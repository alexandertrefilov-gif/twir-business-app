// lib/services/dunning.service.ts
// Mahnwesen — Zahlungserinnerung + Mahnstufen
//
// VORAUSSETZUNG: prisma/migrations/phase7_add_dunning.prisma anwenden
//
// Mahnstufen:
//   1 → Zahlungserinnerung  (kein Verzug, freundlich, keine Gebühr)
//   2 → Erste Mahnung       (nach Fälligkeit, ggf. Mahngebühr 5 €)
//   3 → Zweite Mahnung      (letzte Aufforderung, ggf. Mahngebühr 10 €)
//
// Nutzt: buildAuditLogCreate (Phase 2), AuditAction (Phase 2)

import { prisma }            from '@/lib/db/prisma'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { AuditAction, InvoiceStatus } from '@/types/enums'
import { NotFoundError, BusinessRuleError } from '@/lib/auth/permissions'

// ── Constants ─────────────────────────────────────────────────

export const DUNNING_LEVELS = {
  1: { label: 'Zahlungserinnerung', defaultFee: null,  dueDays: 7  },
  2: { label: 'Erste Mahnung',      defaultFee: 5.00,  dueDays: 14 },
  3: { label: 'Zweite Mahnung',     defaultFee: 10.00, dueDays: 7  },
} as const

export type DunningLevel = keyof typeof DUNNING_LEVELS

// ── Types ─────────────────────────────────────────────────────

export interface DunningNoticeData {
  id:         string
  invoiceId:  string
  level:      number
  levelLabel: string
  sentAt:     Date | null
  dueDate:    Date
  fee:        number | null
  pdfPath:    string | null
  createdAt:  Date
}

export interface CreateDunningInput {
  invoiceId: string
  level:     DunningLevel
  dueDate:   Date
  fee?:      number | null
}

// ── GET ───────────────────────────────────────────────────────

export async function getDunningNoticesForInvoice(
  invoiceId: string,
): Promise<DunningNoticeData[]> {
  const notices = await (prisma as any).dunningNotice.findMany({
    where:   { invoiceId, deletedAt: null },
    orderBy: { level: 'asc' },
  })

  return notices.map((n: any) => ({
    id:         n.id,
    invoiceId:  n.invoiceId,
    level:      n.level,
    levelLabel: n.levelLabel,
    sentAt:     n.sentAt,
    dueDate:    n.dueDate,
    fee:        n.fee?.toNumber() ?? null,
    pdfPath:    n.pdfPath,
    createdAt:  n.createdAt,
  }))
}

// ── CREATE ────────────────────────────────────────────────────

export async function createDunningNotice(
  data:      CreateDunningInput,
  userId:    string,
  userEmail: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where:  { id: data.invoiceId },
      select: {
        id:            true,
        status:        true,
        invoiceNumber: true,
        paidAmount:    true,
        totalGross:    true,
      },
    })
    if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')

    // Only non-paid, non-cancelled invoices can receive dunning
    if (
      invoice.status === InvoiceStatus.PAID ||
      invoice.status === InvoiceStatus.CANCELLED ||
      invoice.status === InvoiceStatus.DRAFT
    ) {
      throw new BusinessRuleError(
        `Für Rechnungen im Status „${invoice.status}" kann keine Mahnung erstellt werden.`,
      )
    }

    // Check existing dunning level
    const existingNotices = await (tx as any).dunningNotice.findMany({
      where:   { invoiceId: data.invoiceId, deletedAt: null },
      orderBy: { level: 'desc' },
      take:    1,
    })

    const highestLevel   = existingNotices[0]?.level ?? 0
    const expectedLevel  = highestLevel + 1

    if (data.level !== expectedLevel) {
      throw new BusinessRuleError(
        `Die nächste Mahnstufe muss ${expectedLevel} sein (aktuell: ${highestLevel}).`,
      )
    }

    if (data.level > 3) {
      throw new BusinessRuleError('Maximale Mahnstufe 3 bereits erreicht. Rechtliche Schritte einleiten.')
    }

    const levelConfig = DUNNING_LEVELS[data.level]
    const fee         = data.fee ?? levelConfig.defaultFee

    const notice = await (tx as any).dunningNotice.create({
      data: {
        invoiceId:   data.invoiceId,
        level:       data.level,
        levelLabel:  levelConfig.label,
        dueDate:     data.dueDate,
        fee:         fee,
        createdById: userId,
      },
    })

    // Mark invoice as OVERDUE if it wasn't already
    if (invoice.status !== InvoiceStatus.OVERDUE && data.level >= 2) {
      await tx.invoice.update({
        where: { id: data.invoiceId },
        data:  { status: InvoiceStatus.OVERDUE },
      })
    }

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.CREATE,
      entityType: 'dunning_notice',
      entityId:   notice.id,
      newValue: {
        invoiceId:     data.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        level:         data.level,
        levelLabel:    levelConfig.label,
        dueDate:       data.dueDate,
        fee,
      },
    })

    return notice.id as string
  })
}

// ── MARK AS SENT ──────────────────────────────────────────────

export async function markDunningNoticeSent(
  noticeId:  string,
  pdfPath:   string | null,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const notice = await (prisma as any).dunningNotice.findUnique({
    where: { id: noticeId },
  })
  if (!notice) throw new NotFoundError('Mahnung nicht gefunden')
  if (notice.sentAt) throw new BusinessRuleError('Mahnung wurde bereits als versendet markiert.')

  await prisma.$transaction(async (tx) => {
    await (tx as any).dunningNotice.update({
      where: { id: noticeId },
      data:  { sentAt: new Date(), pdfPath: pdfPath ?? null },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.STATUS_CHANGE,
      entityType: 'dunning_notice',
      entityId:   noticeId,
      oldValue:   { sentAt: null },
      newValue:   { sentAt: new Date() },
    })
  })
}

// ── OVERDUE CHECK (batch — cron/scheduled job) ────────────────

/**
 * Gibt alle fälligen, unbezahlten Rechnungen zurück.
 * Für Dashboard-Widget und automatische Overdue-Markierung.
 * Wird in einem Cron-Job oder beim Dashboard-Load aufgerufen.
 */
export async function getOverdueInvoices() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return prisma.invoice.findMany({
    where: {
      dueDate:   { lt: today },
      status:    { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
    },
    select: {
      id:            true,
      invoiceNumber: true,
      dueDate:       true,
      totalGross:    true,
      paidAmount:    true,
      customer:      { select: { id: true, name: true } },
    },
    orderBy: { dueDate: 'asc' },
  })
}

/**
 * Markiert überfällige Rechnungen als OVERDUE.
 * Idempotent — sicher mehrfach ausführbar.
 */
export async function markOverdueInvoices(): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const result = await prisma.invoice.updateMany({
    where: {
      dueDate:   { lt: today },
      status:    { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
    },
    data: { status: InvoiceStatus.OVERDUE },
  })

  return result.count
}
