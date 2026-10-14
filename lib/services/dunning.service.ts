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
// REQ-029 P5-3: Mahnbarkeit entscheidet die reine Policy (dunning-policy.ts); dieser Service ist die Sicherheitsgrenze.

import type { Prisma }      from '@prisma/client'
import { prisma }            from '@/lib/db/prisma'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { AuditAction, InvoiceStatus, InvoiceType } from '@/types/enums'
import { normalizeMoneyInput, toMoney, DUNNING_FEE_SPEC } from '@/lib/billing/payment-math'
import { toCentString } from '@/lib/billing/money'
import { NotFoundError, BusinessRuleError, ConflictError } from '@/lib/auth/permissions'
import { berlinCalendarDate, berlinDayStartUtc, formatUtcCalendarDate } from '@/lib/utils/berlin-date'
import {
  DUNNABLE_INVOICE_STATUSES,
  dunningBlockMessage,
  evaluateDunningEligibility,
} from '@/lib/services/dunning-policy'
import type { DunningBlockReason, DunningLevelNumber } from '@/lib/services/dunning-policy'

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
  fee?:      number | string | null
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

// ── Gemeinsame Lesevorgänge (Anlage und Vorschau) ─────────────
//
// REQ-029 P5-3: Alle Entscheidungen über „darf gemahnt werden“ trifft die reine Policy (dunning-policy.ts).
// Dieser Abschnitt lädt nur die Tatsachen: Rechnung, Σ aktive Zahlungszeilen (nicht der Cache paidAmount),
// nicht gelöschte Mahnungen und die Status-Audits der Rechnung (Versandnachweis).

type DunningFactsClient = Pick<Prisma.TransactionClient, 'invoice' | 'payment' | 'auditLog'>

async function loadDunningFacts(tx: DunningFactsClient, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where:  { id: invoiceId },
    select: {
      id:            true,
      status:        true,
      type:          true,
      invoiceNumber: true,
      sentAt:        true,
      dueDate:       true,
      totalGross:    true,
    },
  })
  if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')

  // Gleiche Quelle wie addPayment: aktive Zahlungszeilen (deletedAt IS NULL), exakt als Decimal summiert.
  const paid = await tx.payment.aggregate({
    where: { invoiceId, deletedAt: null },
    _sum:  { amount: true },
  })
  const activePaymentsSum = toCentString(toMoney(paid._sum.amount ?? '0'))

  const noticeRows: Array<{ id: string; level: number; sentAt: Date | null }> =
    await (tx as any).dunningNotice.findMany({
      where:   { invoiceId, deletedAt: null },
      orderBy: { level: 'desc' },
      select:  { id: true, level: true, sentAt: true },
    })

  // Alle Statuswechsel-Audits der Rechnung; welcher davon als Versandnachweis zählt, entscheidet die Policy.
  const auditEntries = await tx.auditLog.findMany({
    where:   { entityType: 'invoice', entityId: invoiceId, action: AuditAction.STATUS_CHANGE },
    select:  {
      id: true, entityType: true, entityId: true, action: true,
      userId: true, oldValue: true, newValue: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return { invoice, activePaymentsSum, notices: noticeRows, auditEntries }
}

// ── CREATE ────────────────────────────────────────────────────

/**
 * Legt die nächste Mahnstufe an (REQ-029 P5-3).
 *
 * Alles geschieht in einer Transaktion unter der Zeilensperre der Rechnung (`SELECT … FOR UPDATE`); dieselbe Sperre
 * nehmen Zahlung, Statuswechsel, Storno, Überfälligkeitslauf und „versendet“-Markierung. Die Policy
 * (dunning-policy.ts) entscheidet; dieser Service ist die Sicherheitsgrenze, die UI nur eine Anzeige.
 * Abgelehnte Anlagen schreiben nichts.
 */
export async function createDunningNotice(
  data:      CreateDunningInput,
  userId:    string,
  userEmail: string,
  now:       Date = new Date(),
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // P4-C: Rechnungszeile sperren, damit Mahnung, Zahlung und Statuswechsel nicht gleichzeitig laufen.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE
    `
    if (locked.length === 0) throw new NotFoundError('Rechnung nicht gefunden')

    // Alle Lesezugriffe liegen NACH der Sperre.
    const facts = await loadDunningFacts(tx, data.invoiceId)
    const { invoice } = facts

    const decision = evaluateDunningEligibility({
      purpose:           'create',
      invoice: {
        id:         invoice.id,
        status:     invoice.status,
        type:       invoice.type,
        sentAt:     invoice.sentAt,
        dueDate:    invoice.dueDate,
        totalGross: invoice.totalGross,
      },
      auditEntries:      facts.auditEntries,
      activePaymentsSum: facts.activePaymentsSum,
      notices:           facts.notices,
      requestedLevel:    data.level,
      dunningDueDate:    data.dueDate,
      now,
    })
    if (!decision.ok) {
      const first = decision.reasons[0]
      throw new BusinessRuleError(
        first
          ? dunningBlockMessage(first, decision.details)
          : 'Für diese Rechnung kann keine Mahnung erstellt werden.',
      )
    }

    const level       = decision.nextLevel
    const levelConfig = DUNNING_LEVELS[level]

    // P4-D: Gebühr als Geldbetrag streng prüfen (0–9999, höchstens 2 Nachkommastellen, keine stille Rundung).
    const rawFee = data.fee ?? levelConfig.defaultFee
    let fee: string | null = null
    if (rawFee !== null && rawFee !== undefined) {
      const checkedFee = normalizeMoneyInput(rawFee, DUNNING_FEE_SPEC)
      if (!checkedFee.ok) throw new BusinessRuleError(checkedFee.message)
      fee = checkedFee.value
    }

    const notice = await (tx as any).dunningNotice.create({
      data: {
        invoiceId:   data.invoiceId,
        level,
        levelLabel:  levelConfig.label,
        dueDate:     data.dueDate,
        fee:         fee,
        createdById: userId,
      },
    })

    // Ab Mahnstufe 2: SENT / PARTIALLY_PAID → OVERDUE (mit Statusbedingung und Audit); ein bereits überfälliger
    // Status bleibt unverändert. Spätere Teilzahlungen setzen OVERDUE nicht zurück (derivePaymentStatus).
    if (
      level >= 2 &&
      (invoice.status === InvoiceStatus.SENT || invoice.status === InvoiceStatus.PARTIALLY_PAID)
    ) {
      const marked = await tx.invoice.updateMany({
        where: { id: data.invoiceId, status: invoice.status },
        data:  { status: InvoiceStatus.OVERDUE },
      })
      if (marked.count === 0) {
        throw new ConflictError('Der Rechnungsstatus wurde zwischenzeitlich geändert; die Mahnung wurde nicht angelegt.')
      }
      await buildAuditLogCreate(tx, {
        userId, userEmail,
        action:     AuditAction.STATUS_CHANGE,
        entityType: 'invoice',
        entityId:   data.invoiceId,
        oldValue:   { status: invoice.status },
        newValue:   { status: InvoiceStatus.OVERDUE },
        metadata:   {
          source: 'dunning', level, dunningNoticeId: notice.id,
          outstandingAmount: decision.outstandingAmount,
        },
      })
    }

    // D4: Berechnungsgrundlage unveränderlich im Audit festhalten (keine Migration; Beträge als Cent-Strings).
    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.CREATE,
      entityType: 'dunning_notice',
      entityId:   notice.id,
      newValue: {
        invoiceId:     data.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        level,
        levelLabel:    levelConfig.label,
        dueDate:       data.dueDate,
        fee,
        snapshot:      { ...decision.basis, feeAmount: fee },
      },
    })

    return notice.id as string
  })
}

// ── MARK AS SENT ──────────────────────────────────────────────

/**
 * Markiert eine Mahnung als versendet (REQ-029 P5-3, D8).
 *
 * Transaktion unter derselben Rechnungssperre wie die Anlage; Mahnung und Rechnung werden unter der Sperre neu
 * gelesen. Nur bei mahnbarem Rechnungsstatus (SENT / PARTIALLY_PAID / OVERDUE). Idempotent und race-sicher über
 * `updateMany … WHERE sentAt IS NULL`: genau ein `sentAt`, genau ein Audit.
 */
export async function markDunningNoticeSent(
  noticeId:  string,
  pdfPath:   string | null,
  userId:    string,
  userEmail: string,
): Promise<void> {
  // Nur um die Rechnung zu finden, auf die gesperrt werden muss; die Entscheidung fällt unter der Sperre.
  const lookup = await (prisma as any).dunningNotice.findUnique({
    where:  { id: noticeId },
    select: { invoiceId: true },
  })
  if (!lookup) throw new NotFoundError('Mahnung nicht gefunden')

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${lookup.invoiceId} FOR UPDATE
    `
    if (locked.length === 0) throw new NotFoundError('Rechnung nicht gefunden')

    const notice = await (tx as any).dunningNotice.findUnique({
      where:  { id: noticeId },
      select: { id: true, invoiceId: true, level: true, sentAt: true, deletedAt: true },
    })
    if (!notice || notice.deletedAt || notice.invoiceId !== lookup.invoiceId) {
      throw new NotFoundError('Mahnung nicht gefunden')
    }
    if (notice.sentAt) throw new BusinessRuleError('Mahnung wurde bereits als versendet markiert.')

    const invoice = await tx.invoice.findUnique({
      where:  { id: lookup.invoiceId },
      select: { status: true },
    })
    if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')
    if (!DUNNABLE_INVOICE_STATUSES.includes(invoice.status)) {
      throw new BusinessRuleError(
        'Eine Mahnung kann nur bei Rechnungen im Status „Versendet“, „Teilweise bezahlt“ oder „Überfällig“ als versendet markiert werden.',
      )
    }

    const sentAt = new Date()
    const updated = await (tx as any).dunningNotice.updateMany({
      where: { id: noticeId, sentAt: null, deletedAt: null },
      data:  { sentAt, pdfPath: pdfPath ?? null },
    })
    if (updated.count === 0) throw new BusinessRuleError('Mahnung wurde bereits als versendet markiert.')

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.STATUS_CHANGE,
      entityType: 'dunning_notice',
      entityId:   noticeId,
      oldValue:   { sentAt: null },
      newValue:   { sentAt },
      metadata:   { invoiceId: lookup.invoiceId, level: notice.level },
    })
  })
}

// ── ELIGIBILITY (nur Anzeige) ─────────────────────────────────

/**
 * Serialisierbares Ergebnis der Policy für die Oberfläche. Reine Anzeige: lesend, ohne Sperre, ohne Schreibzugriff.
 * Verbindlich bleibt ausschließlich `createDunningNotice`.
 */
export interface DunningEligibilityDto {
  ok:                boolean
  nextLevel:         DunningLevelNumber | null
  /** Offener Betrag als Cent-String ("64.26"), nur bei ok. */
  outstandingAmount: string | null
  /** Berliner Kalendertag der Berechnung (JJJJ-MM-TT). */
  berlinDate:        string
  calculatedAt:      string
  reasons:           DunningBlockReason[]
  messages:          string[]
}

export async function getDunningEligibility(
  invoiceId: string,
  now:       Date = new Date(),
): Promise<DunningEligibilityDto> {
  return prisma.$transaction(async (tx) => {
    const facts = await loadDunningFacts(tx, invoiceId)
    const decision = evaluateDunningEligibility({
      purpose: 'preview',
      invoice: {
        id:         facts.invoice.id,
        status:     facts.invoice.status,
        type:       facts.invoice.type,
        sentAt:     facts.invoice.sentAt,
        dueDate:    facts.invoice.dueDate,
        totalGross: facts.invoice.totalGross,
      },
      auditEntries:      facts.auditEntries,
      activePaymentsSum: facts.activePaymentsSum,
      notices:           facts.notices,
      now,
    })

    if (decision.ok) {
      return {
        ok:                true,
        nextLevel:         decision.nextLevel,
        outstandingAmount: decision.outstandingAmount,
        berlinDate:        decision.basis.berlinDate,
        calculatedAt:      decision.basis.calculatedAt,
        reasons:           [],
        messages:          [],
      }
    }
    return {
      ok:                false,
      nextLevel:         decision.details.nextLevel,
      outstandingAmount: null,
      berlinDate:        berlinCalendarDate(now),
      calculatedAt:      now.toISOString(),
      reasons:           decision.reasons,
      messages:          decision.reasons.map((reason) => dunningBlockMessage(reason, decision.details)),
    }
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

/** Kennzeichnung der Systemaktion im Audit-Log (kein Benutzer). */
export const OVERDUE_JOB_ACTOR = 'system:overdue-job'

/**
 * Markiert überfällige Rechnungen als OVERDUE (REQ-029 P4-C, Tagesgrenze P5-2).
 *
 * Regeln:
 *   - Nur Rechnungen im Status SENT, Fälligkeit vor heute (Kalendertag in Europe/Berlin, unabhängig von der
 *     Zeitzone des Servers; Fälligkeiten sind Kalendertage als UTC-Mitternacht), keine Stornorechnungen. Teilbezahlte Rechnungen
 *     werden nicht automatisch markiert.
 *   - Jede Rechnung in einer eigenen Transaktion mit Zeilensperre, erneuter Prüfung und Statusbedingung;
 *     jede Änderung erhält einen Audit-Eintrag (Systemakteur, ohne Benutzer, mit Fälligkeitsdatum).
 *   - Idempotent: bereits markierte oder zwischenzeitlich bezahlte/stornierte Rechnungen werden übersprungen.
 *   - Einzelfehler stoppen den Lauf nicht; am Ende wird gesammelt ein Fehler geworfen (nichts bleibt unbemerkt).
 * Rückgabe: Anzahl tatsächlich markierter Rechnungen.
 */
export async function markOverdueInvoices(now: Date = new Date()): Promise<number> {
  // Beginn des Berliner Kalendertags als UTC-Mitternacht, direkt mit gespeicherten Fälligkeiten vergleichbar.
  const today = berlinDayStartUtc(now)

  const candidates = await prisma.invoice.findMany({
    where: {
      dueDate: { lt: today },
      status:  InvoiceStatus.SENT,
      type:    { not: InvoiceType.CANCELLATION },
    },
    select: { id: true },
    orderBy: { dueDate: 'asc' },
  })

  let marked = 0
  const failures: string[] = []
  for (const { id } of candidates) {
    try {
      const done = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM invoices WHERE id = ${id} FOR UPDATE
        `
        if (locked.length === 0) return false
        const current = await tx.invoice.findUnique({
          where:  { id },
          select: { status: true, type: true, dueDate: true },
        })
        if (
          !current || current.status !== InvoiceStatus.SENT || current.type === InvoiceType.CANCELLATION ||
          !current.dueDate || current.dueDate >= today
        ) return false

        const updated = await tx.invoice.updateMany({
          where: { id, status: InvoiceStatus.SENT },
          data:  { status: InvoiceStatus.OVERDUE },
        })
        if (updated.count === 0) return false

        await buildAuditLogCreate(tx, {
          userId:     null,
          userEmail:  OVERDUE_JOB_ACTOR,
          action:     AuditAction.STATUS_CHANGE,
          entityType: 'invoice',
          entityId:   id,
          oldValue:   { status: InvoiceStatus.SENT },
          newValue:   { status: InvoiceStatus.OVERDUE },
          metadata:   { source: 'overdue-job', dueDate: formatUtcCalendarDate(current.dueDate) },
        })
        return true
      })
      if (done) marked += 1
    } catch (error) {
      failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(`Überfälligkeitslauf: ${marked} markiert, ${failures.length} Fehler (${failures.slice(0, 3).join('; ')})`)
  }
  return marked
}
