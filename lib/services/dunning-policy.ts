// lib/services/dunning-policy.ts
// REQ-029 P5-3 Phase A: zentrale, reine Mahn-Policy („Mahnung erst nach dokumentiertem Versand“).
//
// Eigenschaften (bewusst):
//   - Reine Funktionen: kein Prisma, kein I/O, keine Uhr. `now` wird immer injiziert.
//   - Geldarithmetik ausschließlich über die bestehende Decimal-Logik (lib/billing); kein `number`-Geld.
//   - Kalendertage ausschließlich über lib/utils/berlin-date (Europe/Berlin, unabhängig von process.env.TZ).
//   - Der Service (Phase B) ruft diese Policy unter der Rechnungssperre auf und ist die Sicherheitsgrenze.
//     Eine UI darf dieselbe Policy nur zur Anzeige nutzen (purpose: 'preview').
//
// Zentrale Regel (Entscheidungen D1–D12): Eine Mahnung darf nur angelegt werden, wenn ALLE gelten:
//   1. Rechnungstyp ist ausdrücklich mahnbar (Allowlist, derzeit nur STANDARD),
//   2. Status ist SENT, PARTIALLY_PAID oder OVERDUE,
//   3. `sentAt` ist gesetzt,
//   4. ein eindeutiges Versand-Audit existiert (Benutzeraktion FINALIZED → SENT, zeitlich konsistent mit `sentAt`),
//   5. die Rechnung ist nach Europe/Berlin fällig (ab 00:00 des Kalendertags nach `dueDate`),
//   6. der offene Betrag (Brutto − Σ aktive Zahlungen) ist > 0,
//   7. die Stufe ist die nächste (höchste vorhandene + 1, maximal 3) und die Vorstufe ist als versendet dokumentiert,
//   8. (nur beim Anlegen) das neue Zahlungsziel der Mahnung liegt nach dem heutigen Berliner Kalendertag.

import { AuditAction, INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS, InvoiceStatus, InvoiceType } from '@/types/enums'
import { toCentString } from '@/lib/billing/money'
import { remainingMoney, toMoney } from '@/lib/billing/payment-math'
import type { MoneyValue } from '@/lib/billing/payment-math'
import { berlinCalendarDate, berlinDayStartUtc, formatUtcCalendarDate } from '@/lib/utils/berlin-date'

// ── Konstanten ────────────────────────────────────────────────

/** Höchste Mahnstufe (3 = zweite Mahnung). */
export const MAX_DUNNING_LEVEL = 3

/** Feste fachtechnische Toleranz zwischen `sentAt` und Zeitstempel des Versand-Audits (inklusive Grenze). */
export const DUNNING_SEND_AUDIT_TOLERANCE_MS = 60_000

/**
 * Allowlist der mahnbaren Rechnungstypen. STANDARD ist im Code der einzige Typ, den die Rechnungserstellung
 * für normale Ausgangsrechnungen vergibt (invoice.service.ts: `type: InvoiceType.STANDARD`; Schema-Kommentar
 * „Normale Rechnung“). Alle anderen Typen (ADVANCE, PARTIAL, FINAL, CORRECTION, CANCELLATION) sind in P5-3 gesperrt.
 */
export const DUNNABLE_INVOICE_TYPES: readonly string[] = [InvoiceType.STANDARD]

/** Rechnungsstatus, in denen eine Mahnung angelegt bzw. als versendet markiert werden darf. */
export const DUNNABLE_INVOICE_STATUSES: readonly string[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
]

// ── Typen ─────────────────────────────────────────────────────

/** Reihenfolge = Prüfreihenfolge; der Service meldet den ersten Grund, die UI darf alle zeigen. */
export const DUNNING_BLOCK_REASONS = [
  'TYPE_NOT_DUNNABLE',
  'STATUS_NOT_DUNNABLE',
  'NOT_SENT',
  'NO_SEND_AUDIT',
  'NO_DUE_DATE',
  'NOT_YET_DUE',
  'NO_OUTSTANDING',
  'MAX_LEVEL',
  'LEVEL_MISMATCH',
  'PREVIOUS_NOT_SENT',
  'INVALID_DUNNING_DUE_DATE',
] as const

export type DunningBlockReason = (typeof DUNNING_BLOCK_REASONS)[number]

export type DunningLevelNumber = 1 | 2 | 3

/** Ein Audit-Eintrag als Kandidat für den Versandnachweis (Rohdaten aus audit_logs, bereits geladen). */
export interface DispatchAuditCandidate {
  id: string
  entityType: string
  entityId: string
  action: string
  userId: string | null
  oldValue: unknown
  newValue: unknown
  createdAt: Date
}

export interface DunningNoticeInput {
  id: string
  level: number
  sentAt: Date | null
}

export interface DunningPolicyInput {
  /** 'create' = Sicherheitsprüfung beim Anlegen (Stufe und neues Zahlungsziel Pflicht); 'preview' = nur Anzeige. */
  purpose: 'create' | 'preview'
  invoice: {
    id: string
    status: string
    type: string
    sentAt: Date | null
    dueDate: Date | null
    totalGross: MoneyValue
  }
  /** Alle STATUS_CHANGE-Audits der Rechnung (ungefiltert); die Policy wählt den eindeutigen Versandnachweis. */
  auditEntries: readonly DispatchAuditCandidate[]
  /** Σ aktiver Zahlungszeilen (deletedAt IS NULL), nicht der `paidAmount`-Cache. */
  activePaymentsSum: MoneyValue
  /** Nur nicht gelöschte Mahnungen der Rechnung. */
  notices: readonly DunningNoticeInput[]
  /** Pflicht bei purpose 'create'. */
  requestedLevel?: number
  /** Pflicht bei purpose 'create': neues Zahlungsziel der Mahnung (Kalendertag als UTC-Mitternacht). */
  dunningDueDate?: Date | null
  now: Date
}

export interface DunningSendEvidence {
  auditId: string
  sentAt: string
  auditCreatedAt: string
}

/** Basisdaten für den Audit-Snapshot (`dunning-basis-v1`); Gebühr ergänzt der Service. Beträge als Cent-Strings. */
export interface DunningBasis {
  schema: 'dunning-basis-v1'
  grossAmount: string
  activePaymentsSum: string
  outstandingAmount: string
  calculatedAt: string
  berlinDate: string
  invoiceDueDate: string
  invoiceStatusBefore: string
  source: 'active-payments'
  sendEvidence: DunningSendEvidence
  previousNotice: { id: string; level: number; sentAt: string } | null
}

export interface DunningBlockDetails {
  invoiceStatus: string
  invoiceType: string
  invoiceDueDate: string | null
  highestLevel: number
  nextLevel: DunningLevelNumber | null
  requestedLevel: number | null
}

export type DunningPolicyResult =
  | { ok: true; nextLevel: DunningLevelNumber; outstandingAmount: string; basis: DunningBasis }
  | { ok: false; reasons: DunningBlockReason[]; details: DunningBlockDetails }

// ── Versandnachweis (D1b) ─────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function auditStatus(value: unknown): string | null {
  return isRecord(value) && typeof value.status === 'string' ? value.status : null
}

/**
 * Wählt den eindeutigen Versandnachweis: dieselbe Rechnung, STATUS_CHANGE, FINALIZED → SENT, ausgelöst von einem
 * Benutzer (userId gesetzt), Zeitstempel höchstens DUNNING_SEND_AUDIT_TOLERANCE_MS von `sentAt` entfernt.
 * Mehrere Treffer: kleinster zeitlicher Abstand, danach früherer Zeitstempel, danach kleinere ID (deterministisch).
 * Kein Treffer (oder `sentAt` fehlt/ungültig) → null.
 */
export function selectDispatchEvidence(
  invoice: { id: string; sentAt: Date | null },
  entries: readonly DispatchAuditCandidate[],
): DispatchAuditCandidate | null {
  if (!isValidDate(invoice.sentAt)) return null
  const sentMs = invoice.sentAt.getTime()

  let best: { entry: DispatchAuditCandidate; distance: number } | null = null
  for (const entry of entries) {
    if (entry.entityType !== 'invoice') continue
    if (entry.entityId !== invoice.id) continue
    if (entry.action !== AuditAction.STATUS_CHANGE) continue
    if (typeof entry.userId !== 'string' || entry.userId.length === 0) continue
    if (auditStatus(entry.oldValue) !== InvoiceStatus.FINALIZED) continue
    if (auditStatus(entry.newValue) !== InvoiceStatus.SENT) continue
    if (!isValidDate(entry.createdAt)) continue

    const distance = Math.abs(entry.createdAt.getTime() - sentMs)
    if (distance > DUNNING_SEND_AUDIT_TOLERANCE_MS) continue

    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance &&
        (entry.createdAt.getTime() < best.entry.createdAt.getTime() ||
          (entry.createdAt.getTime() === best.entry.createdAt.getTime() && entry.id < best.entry.id)))
    ) {
      best = { entry, distance }
    }
  }
  return best ? best.entry : null
}

// ── Policy ────────────────────────────────────────────────────

function assertNoticeLevels(notices: readonly DunningNoticeInput[]): void {
  for (const notice of notices) {
    if (!Number.isInteger(notice.level) || notice.level < 1 || notice.level > MAX_DUNNING_LEVEL) {
      throw new RangeError(`Mahnpolicy: ungültige Mahnstufe ${String(notice.level)} an Mahnung ${notice.id}`)
    }
  }
}

/**
 * Prüft, ob für die Rechnung jetzt die nächste Mahnstufe angelegt werden darf.
 * Sammelt alle Sperrgründe in Prüfreihenfolge. Unlesbare Geldwerte oder ungültige Stufen/Zeitpunkte sind
 * Datenfehler und werfen (fail closed, nie stillschweigend „mahnbar“).
 */
export function evaluateDunningEligibility(input: DunningPolicyInput): DunningPolicyResult {
  const { invoice, now } = input
  const reasons: DunningBlockReason[] = []

  assertNoticeLevels(input.notices)

  const berlinToday = berlinCalendarDate(now)
  const dayStart = berlinDayStartUtc(now)
  const dueDateValid = isValidDate(invoice.dueDate)

  // Stufenlage (unabhängig von den übrigen Prüfungen, auch für die Anzeige der Gründe)
  const highestLevel = input.notices.reduce((max, notice) => Math.max(max, notice.level), 0)
  const atHighest = input.notices.filter((notice) => notice.level === highestLevel)
  const nextLevel: DunningLevelNumber | null =
    highestLevel >= MAX_DUNNING_LEVEL ? null : ((highestLevel + 1) as DunningLevelNumber)

  // Geld: ausschließlich Decimal
  const gross = toMoney(invoice.totalGross)
  const paid = toMoney(input.activePaymentsSum)
  const outstanding = remainingMoney(invoice.totalGross, input.activePaymentsSum)

  // 1. Typ (Allowlist)
  if (!DUNNABLE_INVOICE_TYPES.includes(invoice.type)) reasons.push('TYPE_NOT_DUNNABLE')

  // 2. Status
  if (!DUNNABLE_INVOICE_STATUSES.includes(invoice.status)) reasons.push('STATUS_NOT_DUNNABLE')

  // 3. sentAt
  if (!isValidDate(invoice.sentAt)) reasons.push('NOT_SENT')

  // 4. Versand-Audit (nur sinnvoll, wenn sentAt vorhanden; sonst ist NOT_SENT bereits der Grund)
  const evidence = selectDispatchEvidence(invoice, input.auditEntries)
  if (isValidDate(invoice.sentAt) && evidence === null) reasons.push('NO_SEND_AUDIT')

  // 5. Fälligkeit (Berlin): mahnbar ab 00:00 des Kalendertags nach dueDate
  if (!dueDateValid) {
    reasons.push('NO_DUE_DATE')
  } else if ((invoice.dueDate as Date).getTime() >= dayStart.getTime()) {
    reasons.push('NOT_YET_DUE')
  }

  // 6. Offener Betrag
  if (!outstanding.greaterThan(0)) reasons.push('NO_OUTSTANDING')

  // 7. Stufe
  if (nextLevel === null) reasons.push('MAX_LEVEL')

  const requestedLevel = typeof input.requestedLevel === 'number' ? input.requestedLevel : null
  if (nextLevel !== null) {
    const mismatch =
      input.purpose === 'create'
        ? requestedLevel === null || requestedLevel !== nextLevel
        : requestedLevel !== null && requestedLevel !== nextLevel
    if (mismatch) reasons.push('LEVEL_MISMATCH')
  }

  // Vorstufe muss als versendet dokumentiert sein (jede Mahnung der höchsten Stufe, fail closed bei Dubletten)
  if (highestLevel >= 1 && highestLevel < MAX_DUNNING_LEVEL && atHighest.some((n) => !isValidDate(n.sentAt))) {
    reasons.push('PREVIOUS_NOT_SENT')
  }

  // 8. Neues Zahlungsziel der Mahnung (nur beim Anlegen): Kalendertag nach dem heutigen Berliner Tag
  if (input.purpose === 'create') {
    const due = input.dunningDueDate
    if (!isValidDate(due) || formatUtcCalendarDate(due) <= berlinToday) {
      reasons.push('INVALID_DUNNING_DUE_DATE')
    }
  }

  if (reasons.length > 0 || evidence === null || nextLevel === null || !isValidDate(invoice.sentAt)) {
    return {
      ok: false,
      reasons,
      details: {
        invoiceStatus: invoice.status,
        invoiceType: invoice.type,
        invoiceDueDate: dueDateValid ? formatUtcCalendarDate(invoice.dueDate as Date) : null,
        highestLevel,
        nextLevel,
        requestedLevel,
      },
    }
  }

  const previous =
    highestLevel === 0
      ? null
      : atHighest
          .filter((n): n is DunningNoticeInput & { sentAt: Date } => isValidDate(n.sentAt))
          .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime() || (a.id < b.id ? -1 : 1))[0]

  return {
    ok: true,
    nextLevel,
    outstandingAmount: toCentString(outstanding),
    basis: {
      schema: 'dunning-basis-v1',
      grossAmount: toCentString(gross),
      activePaymentsSum: toCentString(paid),
      outstandingAmount: toCentString(outstanding),
      calculatedAt: now.toISOString(),
      berlinDate: berlinToday,
      invoiceDueDate: formatUtcCalendarDate(invoice.dueDate as Date),
      invoiceStatusBefore: invoice.status,
      source: 'active-payments',
      sendEvidence: {
        auditId: evidence.id,
        sentAt: invoice.sentAt.toISOString(),
        auditCreatedAt: evidence.createdAt.toISOString(),
      },
      previousNotice: previous
        ? { id: previous.id, level: previous.level, sentAt: previous.sentAt.toISOString() }
        : null,
    },
  }
}

// ── Meldungen (D12) ───────────────────────────────────────────

function formatGermanDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year}`
}

/** Deutsche Meldung zu einem Sperrgrund. */
export function dunningBlockMessage(reason: DunningBlockReason, details: DunningBlockDetails): string {
  switch (reason) {
    case 'TYPE_NOT_DUNNABLE':
      if (details.invoiceType === InvoiceType.CORRECTION) {
        return 'Für Korrekturrechnungen kann keine Mahnung erstellt werden.'
      }
      if (details.invoiceType === InvoiceType.CANCELLATION) {
        return 'Für Stornorechnungen kann keine Mahnung erstellt werden.'
      }
      return `Für Rechnungen vom Typ „${
        (INVOICE_TYPE_LABELS as Record<string, string>)[details.invoiceType] ?? details.invoiceType
      }“ kann keine Mahnung erstellt werden.`
    case 'STATUS_NOT_DUNNABLE':
      return `Für Rechnungen im Status „${
        (INVOICE_STATUS_LABELS as Record<string, string>)[details.invoiceStatus] ?? details.invoiceStatus
      }“ kann keine Mahnung erstellt werden.`
    case 'NOT_SENT':
      return 'Die Rechnung ist nicht als versendet dokumentiert (Versanddatum fehlt).'
    case 'NO_SEND_AUDIT':
      return 'Der Rechnungsversand ist nicht nachvollziehbar dokumentiert (Statuswechsel auf „Versendet“ fehlt).'
    case 'NO_DUE_DATE':
      return 'Die Rechnung hat kein Zahlungsziel.'
    case 'NOT_YET_DUE':
      return `Das Zahlungsziel (${
        details.invoiceDueDate ? formatGermanDate(details.invoiceDueDate) : 'unbekannt'
      }) ist noch nicht überschritten.`
    case 'NO_OUTSTANDING':
      return 'Es ist kein offener Betrag vorhanden.'
    case 'MAX_LEVEL':
      return 'Maximale Mahnstufe 3 bereits erreicht. Rechtliche Schritte einleiten.'
    case 'LEVEL_MISMATCH':
      return `Die nächste Mahnstufe muss ${details.nextLevel ?? '–'} sein (aktuell: ${details.highestLevel}).`
    case 'PREVIOUS_NOT_SENT':
      return `Mahnstufe ${details.highestLevel} ist noch nicht als versendet markiert.`
    case 'INVALID_DUNNING_DUE_DATE':
      return 'Das neue Zahlungsziel der Mahnung muss nach dem heutigen Tag liegen.'
  }
}
