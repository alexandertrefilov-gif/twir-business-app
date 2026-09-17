// lib/services/service-report.service.ts
// Leistungserfassung-Service
//
// Rollenlogik:
//   - EMPLOYEE  → sieht nur eigene Reports (createdById = userId)
//   - Alle anderen Rollen → sehen alle Reports
//
// Nutzt: nextNumber (Phase 2), buildAuditLogCreate (Phase 2), RoleName (Phase 2)

import { prisma }            from '@/lib/db/prisma'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { nextNumber }        from '@/lib/services/number-sequence.service'
import {
  AuditAction,
  NumberSequenceType,
  RoleName,
} from '@/types/enums'
import { NotFoundError, BusinessRuleError } from '@/lib/auth/permissions'
import type {
  ServiceReportCreateInput,
  ServiceReportUpdateInput,
} from '@/lib/validators/service-report.schema'
import { calcReportItemNet, calcReportTotal } from '@/lib/validators/service-report.schema'
import { Prisma } from '@prisma/client'
import { getCompanySnapshot } from '@/lib/services/settings.service'

// ── Types ─────────────────────────────────────────────────────

export interface ServiceReportListParams {
  orderId?:   string
  userId?:    string     // current user
  userRole?:  RoleName   // filters to own if EMPLOYEE
  search?:    string
  page?:      number
  pageSize?:  number
}

export interface ServiceReportListItem {
  id:           string
  reportNumber: string
  orderId:      string
  orderNumber:  string
  customerName: string
  title:        string | null
  reportDate:   Date
  totalNet:     number
  itemCount:    number
  createdById:  string
  createdByName: string
  createdAt:    Date
}

export interface ServiceReportListResult {
  reports:    ServiceReportListItem[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

// ── LIST ──────────────────────────────────────────────────────

export async function getServiceReports(
  params: ServiceReportListParams = {},
): Promise<ServiceReportListResult> {
  const {
    orderId,
    userId,
    userRole,
    search   = '',
    page     = 1,
    pageSize = 25,
  } = params

  // Employees see only their own reports
  const ownOnly = userRole === RoleName.EMPLOYEE && userId

  const where = {
    ...(orderId  && { orderId }),
    ...(ownOnly  && { createdById: userId }),
    ...(search   && {
      OR: [
        { reportNumber: { contains: search, mode: 'insensitive' as const } },
        { title:        { contains: search, mode: 'insensitive' as const } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' as const } } },
      ],
    }),
  }

  const [raw, total] = await Promise.all([
    prisma.serviceReport.findMany({
      where,
      orderBy: { reportDate: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:           true,
        reportNumber: true,
        orderId:      true,
        title:        true,
        reportDate:   true,
        totalNet:     true,
        createdById:  true,
        createdAt:    true,
        createdBy: { select: { firstName: true, lastName: true } },
        order: {
          select: {
            orderNumber: true,
            customer:    { select: { name: true } },
          },
        },
        _count: { select: { items: true } },
      },
    }),
    prisma.serviceReport.count({ where }),
  ])

  return {
    reports: raw.map((r) => ({
      id:            r.id,
      reportNumber:  r.reportNumber,
      orderId:       r.orderId,
      orderNumber:   r.order.orderNumber,
      customerName:  r.order.customer.name,
      title:         r.title,
      reportDate:    r.reportDate,
      totalNet:      r.totalNet.toNumber(),
      itemCount:     r._count.items,
      createdById:   r.createdById,
      createdByName: `${r.createdBy.firstName} ${r.createdBy.lastName}`,
      createdAt:     r.createdAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ── GET BY ID ─────────────────────────────────────────────────

export async function getServiceReportById(
  id:       string,
  userId:   string,
  userRole: RoleName,
) {
  const report = await prisma.serviceReport.findUnique({
    where:   { id },
    include: {
      items:     { orderBy: { position: 'asc' } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      order: {
        include: {
          customer: true,
          offer: { select: { id: true, offerNumber: true } },
        },
      },
    },
  })

  if (!report) throw new NotFoundError('Leistungsnachweis nicht gefunden')

  // Employees may only view their own
  if (userRole === RoleName.EMPLOYEE && report.createdById !== userId) {
    throw new NotFoundError('Leistungsnachweis nicht gefunden')
  }

  return report
}

// ── CREATE ────────────────────────────────────────────────────

export async function createServiceReport(
  data:      ServiceReportCreateInput,
  userId:    string,
  userEmail: string,
): Promise<string> {
  const totalNet = calcReportTotal(data.items)

  return prisma.$transaction(async (tx) => {
    // Serialisiert Erstellungen für denselben Auftrag. Die Existenzprüfung muss
    // vor der Nummernvergabe innerhalb derselben Transaktion stattfinden.
    const lockedOrders = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM orders
      WHERE id = ${data.orderId}
        AND deleted_at IS NULL
      FOR UPDATE
    `
    if (lockedOrders.length === 0) throw new NotFoundError('Auftrag nicht gefunden')

    const order = await tx.order.findUnique({
      where: { id: data.orderId },
      select: { status: true },
    })
    if (!order) throw new NotFoundError('Auftrag nicht gefunden')
    if (order.status === 'CANCELLED' || order.status === 'INVOICED') {
      throw new BusinessRuleError(
        'Für stornierte oder bereits abgerechnete Aufträge können keine Leistungen erfasst werden.',
      )
    }

    const existingReport = await tx.serviceReport.findFirst({
      where: { orderId: data.orderId },
      select: { id: true },
    })
    if (existingReport) {
      throw new BusinessRuleError('Für diesen Auftrag existiert bereits ein Leistungsnachweis.')
    }

    const reportNumber = await nextNumber(NumberSequenceType.SERVICE_REPORT, tx)

    const report = await tx.serviceReport.create({
      data: {
        reportNumber,
        orderId:     data.orderId,
        title:       data.title       ?? null,
        description: data.description ?? null,
        reportDate:  data.reportDate,
        totalNet,
        createdById: userId,
        items: {
          create: data.items.map((item) => ({
            position:    item.position,
            type:        item.type,
            description: item.description,
            quantity:    item.quantity,
            unit:        item.unit,
            unitPrice:   item.unitPrice,
            discountRate: item.discountRate,
            taxRate:      item.taxRate,
            netAmount:   calcReportItemNet(item),
            notes:       item.notes ?? null,
          })),
        },
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.CREATE,
      entityType: 'service_report',
      entityId:   report.id,
      newValue:   { reportNumber, orderId: data.orderId, totalNet },
    })

    return report.id
  })
}

// ── UPDATE ────────────────────────────────────────────────────

export async function updateServiceReport(
  id:        string,
  data:      ServiceReportUpdateInput,
  userId:    string,
  userEmail: string,
  userRole:  RoleName,
): Promise<void> {
  const existing = await prisma.serviceReport.findUnique({
    where:  { id },
    select: { id: true, createdById: true, reportNumber: true, status: true },
  })
  if (!existing) throw new NotFoundError('Leistungsnachweis nicht gefunden')
  if (existing.status === 'FINALIZED') throw new BusinessRuleError('Finalisierte Leistungsnachweise können nicht bearbeitet werden.')

  // Employees may only edit their own
  if (userRole === RoleName.EMPLOYEE && existing.createdById !== userId) {
    throw new BusinessRuleError('Sie können nur eigene Leistungsnachweise bearbeiten.')
  }

  const totalNet = calcReportTotal(data.items)

  await prisma.$transaction(async (tx) => {
    await tx.serviceReportItem.deleteMany({ where: { serviceReportId: id } })

    await tx.serviceReport.update({
      where: { id },
      data: {
        title:       data.title       ?? null,
        description: data.description ?? null,
        reportDate:  data.reportDate,
        totalNet,
        items: {
          create: data.items.map((item) => ({
            position:    item.position,
            type:        item.type,
            description: item.description,
            quantity:    item.quantity,
            unit:        item.unit,
            unitPrice:   item.unitPrice,
            discountRate: item.discountRate,
            taxRate:      item.taxRate,
            netAmount:   calcReportItemNet(item),
            notes:       item.notes ?? null,
          })),
        },
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.UPDATE,
      entityType: 'service_report',
      entityId:   id,
      newValue:   { totalNet, itemCount: data.items.length },
    })
  })
}

export async function finalizeServiceReport(id: string, userId: string, userEmail: string): Promise<void> {
  const [companySnapshot, fullReport] = await Promise.all([
    getCompanySnapshot(),
    prisma.serviceReport.findUnique({ where: { id }, include: { order: { select: { customerSnapshot: true } } } }),
  ])
  if (!fullReport) throw new NotFoundError('Leistungsnachweis nicht gefunden')
  await prisma.$transaction(async (tx) => {
    const report = await tx.serviceReport.findUnique({ where: { id }, select: { status: true, reportNumber: true } })
    if (!report) throw new NotFoundError('Leistungsnachweis nicht gefunden')
    if (report.status !== 'DRAFT') throw new BusinessRuleError('Der Leistungsnachweis ist bereits finalisiert.')
    await tx.serviceReport.update({ where: { id }, data: { status: 'FINALIZED', finalizedAt: new Date(), customerSnapshot: fullReport.order.customerSnapshot ?? undefined, companySnapshot: companySnapshot as Prisma.InputJsonValue } })
    await tx.auditLog.create({ data: { userId, userEmail, action: AuditAction.FINALIZE, entityType: 'service_report', entityId: id, oldValue: { status: 'DRAFT' }, newValue: { status: 'FINALIZED', reportNumber: report.reportNumber } } })
  })
}

export async function markServiceReportSent(id: string, userId: string, userEmail: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const report = await tx.serviceReport.findUnique({
      where: { id }, select: { status: true, sentAt: true, reportNumber: true },
    })
    if (!report) throw new NotFoundError('Leistungsnachweis nicht gefunden')
    if (report.status !== 'FINALIZED') {
      throw new BusinessRuleError('Der Leistungsnachweis muss vor dem Versand finalisiert werden.')
    }
    if (report.sentAt) return
    const sentAt = new Date()
    const updated = await tx.serviceReport.updateMany({ where: { id, sentAt: null }, data: { sentAt } })
    if (updated.count === 0) return
    await tx.auditLog.create({ data: {
      userId, userEmail, action: AuditAction.STATUS_CHANGE,
      entityType: 'service_report', entityId: id,
      oldValue: { sentAt: null }, newValue: { sentAt: sentAt.toISOString(), reportNumber: report.reportNumber },
    } })
  })
}

// ── DELETE ────────────────────────────────────────────────────

export async function deleteServiceReport(
  id:        string,
  userId:    string,
  userEmail: string,
  userRole:  RoleName,
): Promise<void> {
  const existing = await prisma.serviceReport.findUnique({
    where:  { id },
    select: { id: true, createdById: true, reportNumber: true },
  })
  if (!existing) throw new NotFoundError('Leistungsnachweis nicht gefunden')

  if (userRole === RoleName.EMPLOYEE && existing.createdById !== userId) {
    throw new BusinessRuleError('Sie können nur eigene Leistungsnachweise löschen.')
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceReportItem.deleteMany({ where: { serviceReportId: id } })
    await tx.serviceReport.delete({ where: { id } })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.DELETE,
      entityType: 'service_report',
      entityId:   id,
      oldValue:   { reportNumber: existing.reportNumber },
    })
  })
}
