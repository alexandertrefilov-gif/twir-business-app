// lib/services/order.service.ts
// Nutzt:
//   nextNumber        (Phase 2)
//   buildAuditLogCreate (Phase 2)
//   OrderStatus / AuditAction / NumberSequenceType (Phase 2 enums)
//   calcItemAmounts / calcOrderTotals (Phase 4 offer.schema – re-exported in order.schema)
//
// convertOfferToOrder ist in offer.service.ts (Phase 4) implementiert – nicht hier.

import { prisma }            from '@/lib/db/prisma'
import { Prisma }            from '@prisma/client'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { nextNumber }        from '@/lib/services/number-sequence.service'
import {
  OrderStatus,
  AuditAction,
  NumberSequenceType,
  isOrderTransitionAllowed,
} from '@/types/enums'
import {
  NotFoundError,
  BusinessRuleError,
} from '@/lib/auth/permissions'
import type { OrderCreateInput, OrderUpdateInput } from '@/lib/validators/order.schema'
import { calcItemAmounts, calcOrderTotals } from '@/lib/validators/order.schema'

// ── Types ─────────────────────────────────────────────────────

export interface OrderListParams {
  search?:     string
  status?:     string
  customerId?: string
  page?:       number
  pageSize?:   number
  sort?:       'orderNumber' | 'orderDate' | 'totalGross' | 'status'
  order?:      'asc' | 'desc'
}

export interface OrderListResult {
  orders:     OrderListItem[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

export interface OrderListItem {
  id:            string
  orderNumber:   string
  status:        string
  title:         string | null
  customerId:    string
  customerName:  string
  offerNumber:   string | null
  orderDate:     Date
  startDate:     Date | null
  endDate:       Date | null
  totalGross:    number
  serviceReportCount: number
  createdAt:     Date
}

// ── LIST ──────────────────────────────────────────────────────

export async function getOrders(params: OrderListParams = {}): Promise<OrderListResult> {
  const {
    search     = '',
    status,
    customerId,
    page       = 1,
    pageSize   = 25,
    sort       = 'orderDate',
    order      = 'desc',
  } = params

  const where: Prisma.OrderWhereInput = {
    deletedAt: null,
    ...(status     && { status: status as OrderStatus }),
    ...(customerId && { customerId }),
    ...(search && {
      OR: [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { title:       { contains: search, mode: 'insensitive' } },
        { customer:    { name: { contains: search, mode: 'insensitive' } } },
        { offer:       { offerNumber: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  }

  const [raw, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { [sort]: order },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:          true,
        orderNumber: true,
        status:      true,
        title:       true,
        customerId:  true,
        orderDate:   true,
        startDate:   true,
        endDate:     true,
        totalGross:  true,
        createdAt:   true,
        customer:    { select: { name: true } },
        offer:       { select: { offerNumber: true } },
        _count:      { select: { serviceReports: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  return {
    orders: raw.map((o) => ({
      id:                 o.id,
      orderNumber:        o.orderNumber,
      status:             o.status,
      title:              o.title,
      customerId:         o.customerId,
      customerName:       o.customer.name,
      offerNumber:        o.offer?.offerNumber ?? null,
      orderDate:          o.orderDate,
      startDate:          o.startDate,
      endDate:            o.endDate,
      totalGross:         o.totalGross.toNumber(),
      serviceReportCount: o._count.serviceReports,
      createdAt:          o.createdAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ── GET BY ID ─────────────────────────────────────────────────

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({
    where:   { id, deletedAt: null },
    include: {
      customer:  true,
      offer:     { select: { id: true, offerNumber: true } },
      items:     { orderBy: { position: 'asc' } },
      createdBy: { select: { firstName: true, lastName: true } },
      serviceReports: {
        orderBy: { reportDate: 'desc' },
        include: {
          createdBy: { select: { firstName: true, lastName: true } },
          _count:    { select: { items: true } },
        },
      },
    },
  })
  if (!order) throw new NotFoundError('Auftrag nicht gefunden')
  return order
}

// ── CREATE (direkt) ───────────────────────────────────────────

export async function createOrder(
  data:      OrderCreateInput,
  userId:    string,
  userEmail: string,
): Promise<string> {
  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId, deletedAt: null },
  })
  if (!customer) throw new NotFoundError('Kunde nicht gefunden')

  const totals = data.items.length > 0
    ? calcOrderTotals(data.items)
    : { totalNet: 0, totalTax: 0, totalGross: 0 }

  return prisma.$transaction(async (tx) => {
    const orderNumber = await nextNumber(NumberSequenceType.ORDER, tx)

    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId:  data.customerId,
        status:      OrderStatus.OPEN,
        title:       data.title,
        description: data.description  ?? null,
        orderDate:   data.orderDate,
        startDate:   data.startDate   ?? null,
        endDate:     data.endDate     ?? null,
        totalNet:    totals.totalNet,
        totalTax:    totals.totalTax,
        totalGross:  totals.totalGross,
        createdById: userId,
        ...(data.items.length > 0 && {
          items: {
            create: data.items.map((item) => {
              const { netAmount, taxAmount, grossAmount } = calcItemAmounts(item)
              return {
                position:    item.position,
                description: item.description,
                quantity:    item.quantity,
                unit:        item.unit,
                unitPrice:   item.unitPrice,
                taxRate:     item.taxRate,
                netAmount,
                taxAmount,
                grossAmount,
                notes:       item.notes ?? null,
              }
            }),
          },
        }),
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.CREATE,
      entityType: 'order',
      entityId:   order.id,
      newValue:   { orderNumber, customerId: data.customerId, status: OrderStatus.OPEN },
    })

    return order.id
  })
}

// ── UPDATE (nur OPEN) ─────────────────────────────────────────

export async function updateOrder(
  id:        string,
  data:      OrderUpdateInput,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const existing = await prisma.order.findUnique({
    where:  { id, deletedAt: null },
    select: { id: true, status: true, orderNumber: true },
  })
  if (!existing) throw new NotFoundError('Auftrag nicht gefunden')

  if (existing.status !== OrderStatus.OPEN) {
    throw new BusinessRuleError(
      `Aufträge im Status „${existing.status}" können nicht mehr bearbeitet werden.`,
    )
  }

  const totals = data.items.length > 0
    ? calcOrderTotals(data.items)
    : { totalNet: 0, totalTax: 0, totalGross: 0 }

  await prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { orderId: id } })

    await tx.order.update({
      where: { id },
      data: {
        customerId:  data.customerId,
        title:       data.title,
        description: data.description ?? null,
        orderDate:   data.orderDate,
        startDate:   data.startDate  ?? null,
        endDate:     data.endDate    ?? null,
        totalNet:    totals.totalNet,
        totalTax:    totals.totalTax,
        totalGross:  totals.totalGross,
        ...(data.items.length > 0 && {
          items: {
            create: data.items.map((item) => {
              const { netAmount, taxAmount, grossAmount } = calcItemAmounts(item)
              return {
                position:    item.position,
                description: item.description,
                quantity:    item.quantity,
                unit:        item.unit,
                unitPrice:   item.unitPrice,
                taxRate:     item.taxRate,
                netAmount,
                taxAmount,
                grossAmount,
                notes:       item.notes ?? null,
              }
            }),
          },
        }),
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.UPDATE,
      entityType: 'order',
      entityId:   id,
      newValue:   { title: data.title, totalGross: totals.totalGross },
    })
  })
}

// ── STATUS CHANGE ─────────────────────────────────────────────

export async function changeOrderStatus(
  id:        string,
  toStatus:  OrderStatus,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where:  { id, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!order) throw new NotFoundError('Auftrag nicht gefunden')

  const fromStatus = order.status as OrderStatus

  if (!isOrderTransitionAllowed(fromStatus, toStatus)) {
    throw new BusinessRuleError(
      `Statuswechsel von „${fromStatus}" nach „${toStatus}" ist nicht erlaubt.`,
    )
  }

  const timestamps: Record<string, Date | null> = {}
  if (toStatus === OrderStatus.COMPLETED) timestamps.completedAt = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id },
      data:  { status: toStatus, ...timestamps },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.STATUS_CHANGE,
      entityType: 'order',
      entityId:   id,
      oldValue:   { status: fromStatus },
      newValue:   { status: toStatus },
    })
  })
}

// ── DELETE ────────────────────────────────────────────────────

export function canDeleteOrderInEnvironment(
  status: OrderStatus,
  serviceReportCount: number,
  nodeEnv: string | undefined,
): boolean {
  if (nodeEnv === 'development') return true
  return status !== OrderStatus.INVOICED && serviceReportCount === 0
}

export async function deleteOrder(
  id:        string,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where:  { id, deletedAt: null },
    select: {
      id:          true,
      status:      true,
      orderNumber: true,
      _count:      { select: { serviceReports: true } },
    },
  })
  if (!order) throw new NotFoundError('Auftrag nicht gefunden')

  if (!canDeleteOrderInEnvironment(
    order.status as OrderStatus,
    order._count.serviceReports,
    process.env.NODE_ENV,
  )) {
    throw new BusinessRuleError(
      'Abgerechnete Aufträge oder Aufträge mit Leistungsnachweisen können nicht gelöscht werden.',
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { deletedAt: new Date() } })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.DELETE,
      entityType: 'order',
      entityId:   id,
      oldValue:   { orderNumber: order.orderNumber, status: order.status },
    })
  })
}
