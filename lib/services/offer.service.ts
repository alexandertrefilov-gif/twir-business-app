// lib/services/offer.service.ts
// Angebots-Service
// Nutzt: nextNumber (Phase 2), buildAuditLogCreate (Phase 2),
//        OfferStatus/AuditAction/NumberSequenceType (Phase 2 enums)

import { prisma }           from '@/lib/db/prisma'
import { Prisma }           from '@prisma/client'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { nextNumber }       from '@/lib/services/number-sequence.service'
import {
  OfferStatus,
  OrderStatus,
  AuditAction,
  NumberSequenceType,
  isOfferTransitionAllowed,
} from '@/types/enums'
import {
  NotFoundError,
  BusinessRuleError,
} from '@/lib/auth/permissions'
import type { OfferCreateInput, OfferUpdateInput } from '@/lib/validators/offer.schema'
import { calcItemAmounts, calcOfferTotals } from '@/lib/validators/offer.schema'
import { offerToOrderDescription } from '@/lib/offers/rich-text'
import { getCompanySnapshot } from '@/lib/services/settings.service'

// ── Types ────────────────────────────────────────────────────

export interface OfferListParams {
  search?:   string
  status?:   string
  customerId?: string
  page?:     number
  pageSize?: number
  sort?:     'offerNumber' | 'offerDate' | 'totalGross' | 'status'
  order?:    'asc' | 'desc'
}

export interface OfferListResult {
  offers:     OfferListItem[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

export interface OfferListItem {
  id:          string
  offerNumber: string
  status:      string
  title:       string | null
  customerId:  string
  customerName: string
  offerDate:   Date
  validUntil:  Date | null
  totalNet:    number
  totalGross:  number
  itemCount:   number
  createdAt:   Date
}

export interface ParsedOfferNumber {
  period: number
  sequence: number
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Parses the established offer format: PREFIX YYMMNN (for example AN 260703). */
export function parseOfferNumber(value: string, prefix: string): ParsedOfferNumber | null {
  const match = value.match(new RegExp(`^${escapeRegExp(prefix)} ([0-9]{2})(0[1-9]|1[0-2])([0-9]{2,})$`))
  if (!match) return null

  const sequence = Number(match[3])
  if (!Number.isSafeInteger(sequence) || sequence < 1) return null

  return {
    period: (2000 + Number(match[1])) * 100 + Number(match[2]),
    sequence,
  }
}

// ── LIST ─────────────────────────────────────────────────────

export async function getOffers(params: OfferListParams = {}): Promise<OfferListResult> {
  const {
    search    = '',
    status,
    customerId,
    page      = 1,
    pageSize  = 25,
    sort      = 'offerDate',
    order     = 'desc',
  } = params

  const where: Prisma.OfferWhereInput = {
    deletedAt: null,
    ...(status     && { status: status as OfferStatus }),
    ...(customerId && { customerId }),
    ...(search && {
      OR: [
        { offerNumber: { contains: search, mode: 'insensitive' } },
        { areaName:    { contains: search, mode: 'insensitive' } },
        { title:       { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  }

  const [raw, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      orderBy: { [sort]: order },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:          true,
        offerNumber: true,
        status:      true,
        areaName:    true,
        title:       true,
        customerId:  true,
        offerDate:   true,
        validUntil:  true,
        totalNet:    true,
        totalGross:  true,
        createdAt:   true,
        customer: { select: { name: true } },
        _count:   { select: { items: true } },
      },
    }),
    prisma.offer.count({ where }),
  ])

  return {
    offers: raw.map((o) => ({
      id:           o.id,
      offerNumber:  o.offerNumber,
      status:       o.status,
      title:        o.title,
      customerId:   o.customerId,
      customerName: o.customer.name,
      offerDate:    o.offerDate,
      validUntil:   o.validUntil,
      totalNet:     o.totalNet.toNumber(),
      totalGross:   o.totalGross.toNumber(),
      itemCount:    o._count.items,
      createdAt:    o.createdAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ── GET BY ID ────────────────────────────────────────────────

export async function getOfferById(id: string) {
  const offer = await prisma.offer.findUnique({
    where:   { id, deletedAt: null },
    include: {
      customer:  {
        include: {
          contacts: {
            where: { deletedAt: null },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 1,
          },
        },
      },
      items:     { orderBy: { position: 'asc' } },
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      order:     { select: { id: true, orderNumber: true, status: true, orderDate: true, completedAt: true } },
    },
  })
  if (!offer) throw new NotFoundError('Angebot nicht gefunden')
  return offer
}

// ── CREATE ───────────────────────────────────────────────────

export async function createOffer(
  data:      OfferCreateInput,
  userId:    string,
  userEmail: string,
): Promise<string> {
  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId, deletedAt: null },
  })
  if (!customer) throw new NotFoundError('Kunde nicht gefunden')

  const totals = calcOfferTotals(data.items)

  return prisma.$transaction(async (tx) => {
    const offerNumber = await nextNumber(NumberSequenceType.OFFER, tx)

    const offer = await tx.offer.create({
      data: {
        offerNumber,
        customerId:  data.customerId,
        status:      OfferStatus.DRAFT,
        areaName:    data.areaName    ?? null,
        title:       data.title       ?? null,
        introText:   data.introText   ?? null,
        outroText:   data.outroText   ?? null,
        offerDate:   data.offerDate,
        validUntil:  data.validUntil  ?? null,
        totalNet:    totals.totalNet,
        totalTax:    totals.totalTax,
        totalGross:  totals.totalGross,
        createdById: userId,
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
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.CREATE,
      entityType: 'offer',
      entityId:   offer.id,
      newValue:   { offerNumber, customerId: data.customerId, areaName: data.areaName ?? null, status: OfferStatus.DRAFT },
    })

    return offer.id
  })
}

// ── UPDATE (nur DRAFT) ───────────────────────────────────────

export async function updateOffer(
  id:        string,
  data:      OfferUpdateInput,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const existing = await prisma.offer.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, status: true, offerNumber: true },
  })
  if (!existing) throw new NotFoundError('Angebot nicht gefunden')

  if (existing.status !== OfferStatus.DRAFT) {
    throw new BusinessRuleError(
      `Angebote im Status „${existing.status}" können nicht mehr bearbeitet werden. Nur Entwürfe sind editierbar.`,
    )
  }

  const totals = calcOfferTotals(data.items)

  await prisma.$transaction(async (tx) => {
    // Items komplett ersetzen (delete all + recreate)
    await tx.offerItem.deleteMany({ where: { offerId: id } })

    await tx.offer.update({
      where: { id },
      data: {
        customerId:  data.customerId,
        areaName:    data.areaName   ?? null,
        title:       data.title      ?? null,
        introText:   data.introText  ?? null,
        outroText:   data.outroText  ?? null,
        offerDate:   data.offerDate,
        validUntil:  data.validUntil ?? null,
        totalNet:    totals.totalNet,
        totalTax:    totals.totalTax,
        totalGross:  totals.totalGross,
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
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.UPDATE,
      entityType: 'offer',
      entityId:   id,
      newValue:   { areaName: data.areaName ?? null, totalNet: totals.totalNet, totalGross: totals.totalGross, itemCount: data.items.length },
    })
  })
}

// ── MANUAL NUMBER CHANGE (only DRAFT) ───────────────────────

export async function changeOfferNumber(
  id: string,
  requestedNumber: string,
  userId: string,
  userEmail: string,
): Promise<void> {
  const newNumber = requestedNumber.trim()

  try {
    await prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id, deletedAt: null },
        select: { id: true, offerNumber: true, status: true, order: { select: { id: true } } },
      })
      if (!offer) throw new NotFoundError('Angebot nicht gefunden')
      if (offer.status !== OfferStatus.DRAFT || offer.order) {
        throw new BusinessRuleError('Die Angebotsnummer kann nur bei einem Entwurf geändert werden.')
      }
      if (offer.offerNumber === newNumber) {
        return
      }

      const settings = await tx.companySetting.findFirst({ select: { offerPrefix: true } })
      const prefix = settings?.offerPrefix || 'AN'
      const parsed = parseOfferNumber(newNumber, prefix)
      if (!parsed) {
        throw new BusinessRuleError(`Ungültiges Format. Erwartet wird ${prefix} YYMMNN, z. B. ${prefix} 260701.`)
      }

      const sequence = await tx.numberSequence.findUnique({
        where: { type_year: { type: NumberSequenceType.OFFER, year: parsed.period } },
        select: { lastNumber: true },
      })
      if (!sequence || parsed.sequence > sequence.lastNumber) {
        throw new BusinessRuleError('Diese Nummer wurde vom automatischen Nummernkreis noch nicht erreicht.')
      }

      const activeConflict = await tx.offer.findFirst({
        where: { offerNumber: newNumber, deletedAt: null, id: { not: id } },
        select: { id: true },
      })
      if (activeConflict) {
        throw new BusinessRuleError('Diese Angebotsnummer ist bereits vergeben.')
      }

      await tx.offer.update({ where: { id }, data: { offerNumber: newNumber } })
      await buildAuditLogCreate(tx, {
        userId,
        userEmail,
        action: AuditAction.OFFER_NUMBER_CHANGE,
        entityType: 'offer',
        entityId: id,
        oldValue: { offerNumber: offer.offerNumber },
        newValue: { offerNumber: newNumber },
      })
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BusinessRuleError('Diese Angebotsnummer ist bereits vergeben.')
    }
    throw error
  }
}

// ── STATUS TRANSITION ─────────────────────────────────────────

export async function acceptOfferInTransaction(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  userEmail: string,
): Promise<boolean> {
  const offer = await tx.offer.findUnique({
    where: { id, deletedAt: null },
    select: { status: true },
  })
  if (!offer) throw new NotFoundError('Angebot nicht gefunden')

  if (offer.status === OfferStatus.ACCEPTED) return false
  if (!isOfferTransitionAllowed(offer.status as OfferStatus, OfferStatus.ACCEPTED)) {
    throw new BusinessRuleError(
      `Statuswechsel von „${offer.status}" nach „${OfferStatus.ACCEPTED}" ist nicht erlaubt.`,
    )
  }

  const acceptedAt = new Date()
  const updated = await tx.offer.updateMany({
    where: { id, deletedAt: null, status: offer.status },
    data: { status: OfferStatus.ACCEPTED, acceptedAt },
  })
  if (updated.count === 0) {
    const current = await tx.offer.findUnique({ where: { id }, select: { status: true } })
    if (current?.status === OfferStatus.ACCEPTED) return false
    throw new BusinessRuleError('Der Angebotsstatus wurde zwischenzeitlich geändert.')
  }

  await buildAuditLogCreate(tx, {
    userId,
    userEmail,
    action: AuditAction.STATUS_CHANGE,
    entityType: 'offer',
    entityId: id,
    oldValue: { status: offer.status },
    newValue: { status: OfferStatus.ACCEPTED },
  })
  return true
}

export async function changeOfferStatus(
  id:        string,
  toStatus:  OfferStatus,
  userId:    string,
  userEmail: string,
): Promise<void> {
  if (toStatus === OfferStatus.ACCEPTED) {
    await prisma.$transaction(tx => acceptOfferInTransaction(tx, id, userId, userEmail))
    return
  }

  const offer = await prisma.offer.findUnique({
    where:  { id, deletedAt: null },
    include: { customer: true },
  })
  if (!offer) throw new NotFoundError('Angebot nicht gefunden')

  const fromStatus = offer.status as OfferStatus

  if (!isOfferTransitionAllowed(fromStatus, toStatus)) {
    throw new BusinessRuleError(
      `Statuswechsel von „${fromStatus}" nach „${toStatus}" ist nicht erlaubt.`,
    )
  }

  const timestamps: Partial<{
    sentAt:     Date | null
    acceptedAt: Date | null
    rejectedAt: Date | null
    expiredAt:  Date | null
  }> = {}

  if (toStatus === OfferStatus.SENT)     timestamps.sentAt     = new Date()
  if (toStatus === OfferStatus.REJECTED) timestamps.rejectedAt = new Date()
  if (toStatus === OfferStatus.EXPIRED)  timestamps.expiredAt  = new Date()

  // Beim Versenden: Kundendaten einfrieren
  const customerSnapshot =
    toStatus === OfferStatus.SENT ? buildCustomerSnapshot(offer.customer) : undefined
  const companySnapshot = toStatus === OfferStatus.SENT ? await getCompanySnapshot() : undefined

  await prisma.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id },
      data: {
        status: toStatus,
        ...timestamps,
        ...(customerSnapshot && {
          customerSnapshot: customerSnapshot as Prisma.InputJsonValue,
        }),
        ...(companySnapshot && { companySnapshot: companySnapshot as Prisma.InputJsonValue }),
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.STATUS_CHANGE,
      entityType: 'offer',
      entityId:   id,
      oldValue:   { status: fromStatus },
      newValue:   { status: toStatus },
    })
  })
}

// ── CONVERT TO ORDER ─────────────────────────────────────────

export async function convertOfferToOrder(
  offerId:   string,
  userId:    string,
  userEmail: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({
      where:   { id: offerId, deletedAt: null },
      include: { items: true, customer: true },
    })
    if (!offer) throw new NotFoundError('Angebot nicht gefunden')

    if (offer.status !== OfferStatus.ACCEPTED) {
      throw new BusinessRuleError(
        'Nur angenommene Angebote können in Aufträge umgewandelt werden.',
      )
    }

    const orderNumber       = await nextNumber(NumberSequenceType.ORDER, tx)
    const customerSnapshot  = buildCustomerSnapshot(offer.customer)

    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId:       offer.customerId,
        projectId:        offer.projectId,
        offerId:          offer.id,
        status:           OrderStatus.OPEN,
        title:            offer.title,
        description:      offerToOrderDescription(offer.introText, offer.outroText, offer.items.length > 0),
        customerSnapshot: customerSnapshot as Prisma.InputJsonValue,
        totalNet:         offer.totalNet,
        totalTax:         offer.totalTax,
        totalGross:       offer.totalGross,
        createdById:      userId,
        items: {
          create: offer.items.map((item) => ({
            position:    item.position,
            description: item.description,
            quantity:    item.quantity,
            unit:        item.unit,
            unitPrice:   item.unitPrice,
            taxRate:     item.taxRate,
            netAmount:   item.netAmount,
            taxAmount:   item.taxAmount,
            grossAmount: item.grossAmount,
            notes:       item.notes,
          })),
        },
      },
    })

    const customerPurchaseOrder = await tx.customerPurchaseOrder.findUnique({
      where: { offerId },
      select: { id: true },
    })
    if (customerPurchaseOrder) {
      await tx.customerPurchaseOrder.update({
        where: { id: customerPurchaseOrder.id },
        data: { orderId: order.id },
      })
      await tx.document.updateMany({
        where: { customerPurchaseOrderId: customerPurchaseOrder.id, deletedAt: null },
        data: { orderId: order.id },
      })
    }

    await tx.offer.update({
      where: { id: offerId },
      data:  { status: OfferStatus.CONVERTED_TO_ORDER },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.STATUS_CHANGE,
      entityType: 'offer',
      entityId:   offerId,
      oldValue:   { status: OfferStatus.ACCEPTED },
      newValue:   { status: OfferStatus.CONVERTED_TO_ORDER, orderId: order.id, orderNumber },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.CREATE,
      entityType: 'order',
      entityId:   order.id,
      newValue:   { orderNumber, fromOfferId: offerId, fromOfferNumber: offer.offerNumber },
    })

    return order.id
  })
}

// ── DELETE ────────────────────────────────────────────────────

export function canDeleteOfferInEnvironment(
  status: OfferStatus,
  nodeEnv: string | undefined,
): boolean {
  if (nodeEnv === 'development') return true
  return status !== OfferStatus.ACCEPTED &&
    status !== OfferStatus.CONVERTED_TO_ORDER
}

export async function deleteOffer(
  id:        string,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const offer = await prisma.offer.findUnique({
    where:  { id, deletedAt: null },
    select: { id: true, status: true, offerNumber: true },
  })
  if (!offer) throw new NotFoundError('Angebot nicht gefunden')

  if (!canDeleteOfferInEnvironment(offer.status as OfferStatus, process.env.NODE_ENV)) {
    throw new BusinessRuleError(
      'Angenommene oder in Aufträge umgewandelte Angebote können nicht gelöscht werden.',
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id },
      data:  { deletedAt: new Date() },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.DELETE,
      entityType: 'offer',
      entityId:   id,
      oldValue:   { offerNumber: offer.offerNumber, status: offer.status },
    })
  })
}

// ── Helper ───────────────────────────────────────────────────

function buildCustomerSnapshot(customer: {
  name:        string
  legalName:   string | null
  vatId:       string | null
  taxNumber:   string | null
  street:      string | null
  houseNumber: string | null
  postalCode:  string | null
  city:        string | null
  country:     string
  email?:      string | null
  phone?:      string | null
}) {
  return {
    name:        customer.legalName ?? customer.name,
    vatId:       customer.vatId,
    taxNumber:   customer.taxNumber,
    street:      customer.street,
    houseNumber: customer.houseNumber,
    postalCode:  customer.postalCode,
    city:        customer.city,
    country:     customer.country,
    email:       customer.email ?? null,
    phone:       customer.phone ?? null,
  }
}
