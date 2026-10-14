// lib/services/invoice.service.ts
// Rechnungs-Service — kritischste Business-Logik der Anwendung
//
// Regeln:
// 1. Nur DRAFT-Rechnungen dürfen bearbeitet werden
// 2. Finalisierung vergibt Rechnungsnummer ATOMAR (Transaktion)
// 3. Nach Finalisierung: nur Storno oder Korrektur
// 4. Snapshots (Kunde, Firma) MÜSSEN bei Finalisierung gesetzt sein
// 5. PDF wird bei Finalisierung serverseitig erzeugt und archiviert

import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { nextNumber } from '@/lib/services/number-sequence.service'
import { berlinDayStartUtc } from '@/lib/utils/berlin-date'
import {
  InvoiceStatus,
  InvoiceType,
  NumberSequenceType,
  isInvoiceLocked,
  isInvoiceTransitionAllowed,
  AuditAction,
} from '@/types/enums'
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '@/lib/auth/permissions'
import { DISCOUNT_SPEC, validateDecimalField } from '@/lib/billing/decimal-input'
import { MoneyDecimal } from '@/lib/billing/money'
import { isServiceReportReadyForInvoice } from '@/lib/workflow/invoice-eligibility'
import {
  calculateInvoiceForPersistence,
  findStaleCalculation,
  STALE_CALCULATION_HINT,
} from '@/lib/services/invoice-calculation.service'

// ── Typen ────────────────────────────────────────────────────

export interface CreateInvoiceDraftInput {
  customerId:      string
  invoiceRecipientSource: 'CUSTOMER' | 'BILLING' | 'CUSTOM'
  billingAddressId?: string
  recipientName?:        string
  recipientAdditional?:  string
  recipientStreet?:      string
  recipientHouseNumber?: string
  recipientPostalCode?:  string
  recipientCity?:        string
  recipientCountry?:     string
  recipientContactName?: string
  recipientEmail?:       string
  orderId?:        string
  invoiceDate:     Date
  dueDate?:        Date
  deliveryDate?:   Date
  deliveryPeriodStart?: Date
  deliveryPeriodEnd?:   Date
  paymentTermDays?: number
  introText?:      string
  outroText?:      string
  /** Käuferreferenz (BT-10); undefined/null = keine. */
  buyerReference?: string | null
  items:           InvoiceItemInput[]
}

export interface InvoiceItemInput {
  position:    number
  description: string
  quantity:    number
  unit?:       string
  unitPrice:   number
  /** Positionsrabatt in % (0–100, höchstens 2 Nachkommastellen; siehe normalizeInvoiceItemDiscount). */
  discountRate?: string | number | null
  taxRate:     number
  /** Nur beim Bearbeiten eines Entwurfs übernommen (wie bisher in der Server-Action). */
  notes?:      string | null
}

/** Eingabe für das Bearbeiten eines Entwurfs: dieselben Felder wie beim Anlegen. */
export type UpdateInvoiceDraftInput = CreateInvoiceDraftInput

export const BUYER_REFERENCE_MAX_LENGTH = 255

/**
 * REQ-029 P4-B: Serverseitige Prüfung und Normalisierung des Positionsrabatts für ALLE Schreibwege auf
 * Rechnungspositionen. Zulässig sind 0–100 % mit höchstens 2 Nachkommastellen (kein stilles Runden).
 * Liefert den zu speichernden Wert als Dezimal-String mit genau zwei Nachkommastellen; fehlend → '0.00'
 * (neue Positionen erhalten nie NULL). Ungültiges wirft einen BusinessRuleError mit Positionsnummer.
 */
export function normalizeInvoiceItemDiscount(value: unknown, position?: number): string {
  const prefix = position === undefined ? '' : `Position ${position}: `
  if (value === undefined || value === null || value === '') return '0.00'
  const input =
    typeof value === 'number' || typeof value === 'string' ? value
    : typeof value === 'object' && typeof (value as { toFixed?: unknown }).toFixed === 'function' ? (value as { toFixed(): string }).toFixed()
    : null
  if (input === null) throw new BusinessRuleError(`${prefix}Rabatt ist ungültig.`)
  const result = validateDecimalField(input, DISCOUNT_SPEC)
  if (!result.ok) throw new BusinessRuleError(`${prefix}${result.message}`)
  return new MoneyDecimal(result.value).toFixed(2)
}

/**
 * Normalisiert die Käuferreferenz: undefined bleibt undefined (nicht übermittelt), leer → null,
 * getrimmt, höchstens 255 Zeichen, keine Steuerzeichen. Keine automatische Ableitung (z. B. Leitweg-ID).
 */
export function normalizeBuyerReference(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') throw new BusinessRuleError('Die Käuferreferenz ist ungültig.')
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (trimmed.length > BUYER_REFERENCE_MAX_LENGTH) {
    throw new BusinessRuleError(`Die Käuferreferenz darf höchstens ${BUYER_REFERENCE_MAX_LENGTH} Zeichen lang sein.`)
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new BusinessRuleError('Die Käuferreferenz darf keine Steuer- oder Zeilenumbruchzeichen enthalten.')
  }
  return trimmed
}

export function assertServiceReportReadyForInvoice(report: {
  status: string
  finalizedAt: Date | null
  sentAt: Date | null
  confirmedAt: Date | null
}): void {
  if (!isServiceReportReadyForInvoice(report)) {
    throw new BusinessRuleError('Die Rechnung kann erst nach bestätigtem Leistungsnachweis erstellt werden.')
  }
}

// ── Hauptfunktionen ──────────────────────────────────────────

/**
 * Erstellt einen Rechnungsentwurf.
 * Keine Rechnungsnummer, Status DRAFT.
 */
export async function createInvoiceDraft(
  input:  CreateInvoiceDraftInput,
  userId: string,
  userEmail: string,
): Promise<string> {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  })
  if (!customer || customer.deletedAt) {
    throw new NotFoundError('Kunde nicht gefunden')
  }

  const discountRates = input.items.map((item, index) => normalizeInvoiceItemDiscount(item.discountRate, index + 1))
  const buyerReference = normalizeBuyerReference(input.buyerReference) ?? null
  const calc = calculateInvoiceForPersistence(input.items.map((item, index) => ({
    quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, discountRate: discountRates[index],
  })))
  const invoice = await prisma.$transaction(async (tx) => {
    if (input.orderId) {
      // Serialisiert parallele Erstellungen für denselben Auftrag. So reicht die
      // UI-Sperre nicht als einzige Absicherung gegen Doppelklicks/Mehrfachrequests.
      const lockedOrders = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM orders
        WHERE id = ${input.orderId}
          AND deleted_at IS NULL
        FOR UPDATE
      `
      if (lockedOrders.length === 0) throw new NotFoundError('Auftrag nicht gefunden')

      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        select: {
          customerId: true,
          status: true,
          serviceReports: { take: 2, select: { id: true, status: true, finalizedAt: true, sentAt: true, confirmedAt: true } },
        },
      })
      if (!order) throw new NotFoundError('Auftrag nicht gefunden')
      if (order.customerId !== input.customerId) {
        throw new BusinessRuleError('Auftrag und Kunde stimmen nicht überein.')
      }
      if (order.status === 'CANCELLED' || order.status === 'INVOICED') {
        throw new BusinessRuleError('Für stornierte oder bereits abgerechnete Aufträge kann keine Rechnung erstellt werden.')
      }
      if (order.serviceReports.length === 0) {
        throw new BusinessRuleError('Für diesen Auftrag existiert noch kein Leistungsnachweis.')
      }
      if (order.serviceReports.length > 1) {
        throw new BusinessRuleError('Für diesen Auftrag existieren mehrere Leistungsnachweise. Bitte den Datenbestand zuerst bereinigen.')
      }
      assertServiceReportReadyForInvoice(order.serviceReports[0])

      const existingInvoice = await tx.invoice.findFirst({
        where: { orderId: input.orderId, type: InvoiceType.STANDARD },
        select: { id: true },
      })
      if (existingInvoice) {
        throw new BusinessRuleError('Für diesen Auftrag existiert bereits eine Rechnung.')
      }
    }

    const customerSnapshot = await resolveInvoiceRecipientSnapshot(customer, input, tx)
    const inv = await tx.invoice.create({
      data: {
        customerId:      input.customerId,
        customerSnapshot: customerSnapshot as Prisma.InputJsonValue,
        orderId:         input.orderId,
        status:          InvoiceStatus.DRAFT,
        type:            InvoiceType.STANDARD,
        invoiceDate:     input.invoiceDate,
        dueDate:         input.dueDate,
        deliveryDate:    input.deliveryDate,
        deliveryPeriodStart: input.deliveryPeriodStart,
        deliveryPeriodEnd:   input.deliveryPeriodEnd,
        paymentTermDays: input.paymentTermDays,
        introText:       input.introText,
        outroText:       input.outroText,
        buyerReference,
        totalNet:        calc.totalNet,
        totalTax:        calc.totalTax,
        totalGross:      calc.totalGross,
        createdById:     userId,
        items: {
          create: input.items.map((item, index) => ({
            position:    item.position,
            description: item.description,
            quantity:    item.quantity,
            unit:        item.unit ?? 'Stk.',
            unitPrice:   item.unitPrice,
            discountRate: discountRates[index],
            taxRate:     item.taxRate,
            netAmount:   calc.lines[index].netAmount,
            taxAmount:   calc.lines[index].taxAmount,
            grossAmount: calc.lines[index].grossAmount,
          })),
        },
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.CREATE,
      entityType: 'invoice',
      entityId:   inv.id,
      newValue:   {
        status: InvoiceStatus.DRAFT, customerId: input.customerId, ...(buyerReference ? { buyerReference } : {}),
        totalNet: calc.totalNet, totalGross: calc.totalGross, calcVersion: calc.calcVersion,
      },
    })

    return inv
  })

  return invoice.id
}

/**
 * Bearbeitet einen Rechnungsentwurf (REQ-029 P4-A).
 *
 * Ersetzt die frühere Direktlogik der Server-Action:
 *   - EINE Rechenquelle (`calculateInvoiceForPersistence`), serverseitig, Dezimalarithmetik.
 *   - Zeilensperre (`FOR UPDATE`) und Statusprüfung INNERHALB der Transaktion; das Schreiben erfolgt
 *     mit Statusbedingung (`status = DRAFT`). Wird die Rechnung gleichzeitig finalisiert, ändert diese
 *     Funktion nichts (ConflictError) – Positionen und Summen einer finalisierten Rechnung bleiben unberührt.
 *   - Die Käuferreferenz wird nur geändert, wenn sie übermittelt wurde (undefined = unverändert).
 */
export async function updateInvoiceDraft(
  invoiceId: string,
  input:     UpdateInvoiceDraftInput,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const discountRates = input.items.map((item, index) => normalizeInvoiceItemDiscount(item.discountRate, index + 1))
  const nextBuyerReference = normalizeBuyerReference(input.buyerReference)
  const calc = calculateInvoiceForPersistence(input.items.map((item, index) => ({
    quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, discountRate: discountRates[index],
  })))

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE
    `
    if (locked.length === 0) throw new NotFoundError('Rechnung nicht gefunden')

    const existing = await tx.invoice.findUnique({
      where:  { id: invoiceId },
      select: { status: true, buyerReference: true },
    })
    if (!existing) throw new NotFoundError('Rechnung nicht gefunden')
    if (existing.status !== InvoiceStatus.DRAFT) {
      throw new BusinessRuleError('Nur Rechnungsentwürfe können bearbeitet werden.')
    }
    const buyerReferenceChanged = nextBuyerReference !== undefined && (existing.buyerReference ?? null) !== nextBuyerReference

    const customer = await tx.customer.findFirst({ where: { id: input.customerId, deletedAt: null } })
    if (!customer) throw new NotFoundError('Kunde nicht gefunden')
    const customerSnapshot = await resolveInvoiceRecipientSnapshot(customer, input, tx)

    const updated = await tx.invoice.updateMany({
      where: { id: invoiceId, status: InvoiceStatus.DRAFT },
      data: {
        customerId:          input.customerId,
        customerSnapshot:    customerSnapshot as Prisma.InputJsonValue,
        orderId:             input.orderId             ?? null,
        invoiceDate:         input.invoiceDate,
        dueDate:             input.dueDate             ?? null,
        deliveryDate:        input.deliveryDate        ?? null,
        deliveryPeriodStart: input.deliveryPeriodStart ?? null,
        deliveryPeriodEnd:   input.deliveryPeriodEnd   ?? null,
        paymentTermDays:     input.paymentTermDays     ?? null,
        introText:           input.introText           ?? null,
        outroText:           input.outroText           ?? null,
        ...(buyerReferenceChanged ? { buyerReference: nextBuyerReference } : {}),
        totalNet:            calc.totalNet,
        totalTax:            calc.totalTax,
        totalGross:          calc.totalGross,
      },
    })
    if (updated.count === 0) {
      throw new ConflictError('Die Rechnung wurde zwischenzeitlich finalisiert; es wurde nichts geändert.')
    }

    await tx.invoiceItem.deleteMany({ where: { invoiceId } })
    await tx.invoiceItem.createMany({
      data: input.items.map((item, index) => ({
        invoiceId,
        position:     item.position,
        description:  item.description,
        quantity:     item.quantity,
        unit:         item.unit ?? 'Stk.',
        unitPrice:    item.unitPrice,
        discountRate: discountRates[index],
        taxRate:      item.taxRate,
        netAmount:    calc.lines[index].netAmount,
        taxAmount:    calc.lines[index].taxAmount,
        grossAmount:  calc.lines[index].grossAmount,
        notes:        item.notes ?? null,
      })),
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.UPDATE,
      entityType: 'invoice',
      entityId:   invoiceId,
      ...(buyerReferenceChanged ? { oldValue: { buyerReference: existing.buyerReference } } : {}),
      newValue:   {
        totalNet: calc.totalNet, totalGross: calc.totalGross, itemCount: input.items.length, calcVersion: calc.calcVersion,
        ...(buyerReferenceChanged ? { buyerReference: nextBuyerReference } : {}),
      },
    })
  })
}

/**
 * Löscht ausschließlich einen noch nicht finalisierten Rechnungsentwurf.
 * Rechtlich relevante Rechnungen bleiben unveränderlich und werden storniert.
 */
export async function deleteInvoiceDraft(
  invoiceId: string,
  userId: string,
  userEmail: string,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  })

  if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')
  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new BusinessRuleError('Nur Rechnungsentwürfe können gelöscht werden.')
  }

  await prisma.$transaction(async (tx) => {
    // P4-A: Status unter Zeilensperre erneut prüfen und nur einen DRAFT löschen. Eine zwischenzeitlich
    // finalisierte Rechnung wird weder gelöscht noch ihrer Positionen beraubt.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE
    `
    if (locked.length === 0) throw new NotFoundError('Rechnung nicht gefunden')
    const current = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } })
    if (!current) throw new NotFoundError('Rechnung nicht gefunden')
    if (current.status !== InvoiceStatus.DRAFT) {
      throw new ConflictError('Die Rechnung wurde zwischenzeitlich finalisiert und kann nicht mehr gelöscht werden.')
    }
    await tx.invoiceItem.deleteMany({ where: { invoiceId } })
    const deleted = await tx.invoice.deleteMany({ where: { id: invoiceId, status: InvoiceStatus.DRAFT } })
    if (deleted.count === 0) {
      throw new ConflictError('Die Rechnung wurde zwischenzeitlich finalisiert und kann nicht mehr gelöscht werden.')
    }
    await tx.auditLog.create({
      data: {
        userId,
        userEmail,
        action: AuditAction.DELETE,
        entityType: 'invoice',
        entityId: invoiceId,
        oldValue: { status: InvoiceStatus.DRAFT },
      },
    })
  })
}

/**
 * Setzt oder löscht die Käuferreferenz eines Rechnungsentwurfs.
 * Nur im Status DRAFT: Nach der Finalisierung ist die Referenz unveränderlich
 * (Korrektur ausschließlich über Storno-/Korrekturrechnung). Änderung wird auditiert.
 */
export async function updateInvoiceBuyerReference(
  invoiceId: string,
  value:     string | null,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const buyerReference = normalizeBuyerReference(value) ?? null
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE
    `
    if (locked.length === 0) throw new NotFoundError('Rechnung nicht gefunden')

    const invoice = await tx.invoice.findUnique({
      where:  { id: invoiceId },
      select: { status: true, buyerReference: true },
    })
    if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BusinessRuleError(
        'Die Käuferreferenz kann nach der Finalisierung nicht mehr geändert werden. Bitte eine Stornorechnung bzw. Korrekturrechnung erstellen.',
      )
    }
    if ((invoice.buyerReference ?? null) === buyerReference) return

    const updated = await tx.invoice.updateMany({
      where: { id: invoiceId, status: InvoiceStatus.DRAFT },
      data:  { buyerReference },
    })
    if (updated.count === 0) {
      throw new ConflictError('Die Rechnung wurde zwischenzeitlich finalisiert; die Käuferreferenz wurde nicht geändert.')
    }

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.UPDATE,
      entityType: 'invoice',
      entityId:   invoiceId,
      oldValue:   { buyerReference: invoice.buyerReference },
      newValue:   { buyerReference },
    })
  })
}

/**
 * Finalisiert eine Rechnung.
 *
 * Diese Funktion:
 * 1. Prüft ob Status DRAFT ist
 * 2. Liest Kunden- und Firmendaten für Snapshots
 * 3. Vergibt die nächste Rechnungsnummer (atomar, gesperrt)
 * 4. Setzt alle Pflichtfelder (§14 UStG)
 * 5. Schreibt Audit-Log
 * 6. Alles in einer einzigen Transaktion
 *
 * Nach Abschluss muss der Aufrufer das PDF erzeugen.
 */
export async function finalizeInvoice(
  invoiceId: string,
  userId:    string,
  userEmail: string,
): Promise<{ invoiceNumber: string }> {
  return prisma.$transaction(async (tx) => {
    // 1. Rechnungszeile sperren — verhindert, dass zwei parallele Finalisierungen
    // derselben Rechnung beide eine Nummer verbrauchen bzw. sich gegenseitig überschreiben.
    const lockedInvoices = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE
    `
    if (lockedInvoices.length === 0) throw new NotFoundError('Rechnung nicht gefunden')

    const invoice = await tx.invoice.findUnique({
      where:   { id: invoiceId },
      include: { customer: true, items: true },
    })

    if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')

    // 2. Status-Prüfung
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BusinessRuleError(
        `Rechnung kann nicht finalisiert werden: Status ist ${invoice.status}, erwartet DRAFT`,
      )
    }

    // 3. Pflichtfeld-Prüfung §14 UStG
    validateInvoiceForFinalization(invoice)

    // 3b. P4-A (D5): Finalisiert wird nur ein Entwurf, dessen gespeicherte Beträge exakt der aktuellen
    // Berechnung entsprechen. Es wird nie still neu gerechnet oder korrigiert – der Entwurf muss neu gespeichert werden.
    const staleReason = findStaleCalculation(invoice)
    if (staleReason) {
      throw new BusinessRuleError(`Rechnung nicht finalisierbar: ${staleReason} ${STALE_CALCULATION_HINT}`)
    }

    // 4. Snapshots erstellen
    const companySetting = await tx.companySetting.findFirst()
    if (!companySetting) {
      throw new BusinessRuleError(
        'Firmeneinstellungen müssen vor der ersten Rechnung konfiguriert sein',
      )
    }

    const customerSnapshot = invoice.customerSnapshot ?? buildCustomerSnapshot(invoice.customer)
    const companySnapshot  = buildCompanySnapshot(companySetting)

    // 5. Rechnungsnummer vergeben (gesperrt innerhalb dieser Transaktion)
    const invoiceNumber = await nextNumber(NumberSequenceType.INVOICE, tx)

    // 6. Rechnung finalisieren — optimistische Bedingung auf den Ausgangsstatus
    // zusätzlich zum Row-Lock: verhindert unter allen Umständen, dass eine zweite
    // parallele Finalisierung dieselbe Rechnung mit einer zweiten Nummer überschreibt.
    const updated = await tx.invoice.updateMany({
      where: { id: invoiceId, status: InvoiceStatus.DRAFT },
      data: {
        invoiceNumber,
        status:           InvoiceStatus.FINALIZED,
        finalizedAt:      new Date(),
        customerSnapshot: customerSnapshot as Prisma.InputJsonValue,
        companySnapshot:  companySnapshot  as Prisma.InputJsonValue,
      },
    })
    if (updated.count === 0) {
      throw new ConflictError('Die Rechnung wurde zwischenzeitlich bereits finalisiert.')
    }
    const finalized = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { invoiceNumber: true } })

    // 7. Audit-Log innerhalb der Transaktion
    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.FINALIZE,
      entityType: 'invoice',
      entityId:   invoiceId,
      oldValue:   { status: InvoiceStatus.DRAFT },
      newValue:   { status: InvoiceStatus.FINALIZED, invoiceNumber },
    })

    return { invoiceNumber: finalized.invoiceNumber! }
  })
}

/**
 * Storniert eine finalisierte Rechnung und erzeugt die Stornorechnung (REQ-029 P4-C).
 *
 * Absicherung:
 *   - Zeilensperre (`FOR UPDATE`) und erneutes Lesen innerhalb der Transaktion; das Markieren des Originals
 *     erfolgt mit Statusbedingung. Zwei gleichzeitige Stornierungen erzeugen nie zwei Stornorechnungen.
 *   - Eine Stornorechnung kann nicht erneut storniert werden; eine bereits stornierte Rechnung ebenso nicht.
 *   - Rechnungen mit erfassten Zahlungen werden NICHT automatisch storniert (Zahlungen müssen zuerst
 *     fachlich geklärt werden); es wird nichts geändert und keine Rechnungsnummer verbraucht.
 */
export async function cancelInvoice(
  invoiceId: string,
  reason:    string,
  userId:    string,
  userEmail: string,
): Promise<{ cancellationInvoiceId: string }> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE
    `
    if (locked.length === 0) throw new NotFoundError('Rechnung nicht gefunden')

    const original = await tx.invoice.findUnique({
      where:   { id: invoiceId },
      include: { items: true, customer: true },
    })

    if (!original) throw new NotFoundError('Rechnung nicht gefunden')

    if (original.type === InvoiceType.CANCELLATION) {
      throw new BusinessRuleError('Eine Stornorechnung kann nicht storniert werden.')
    }
    if (original.cancelledByInvoiceId || original.status === InvoiceStatus.CANCELLED) {
      throw new BusinessRuleError('Die Rechnung wurde bereits storniert.')
    }

    // Zahlungen: nie automatisch stornieren (weder über paidAmount noch über aktive Zahlungsbuchungen).
    // Bewusst VOR der Statusmatrix: Der fachliche Grund (erfasste Zahlungen) soll unabhängig vom aktuellen Status genannt werden.
    const activePayments = await tx.payment.count({ where: { invoiceId, deletedAt: null } })
    if (activePayments > 0 || original.paidAmount?.isZero() === false) {
      throw new BusinessRuleError(
        'Die Rechnung hat erfasste Zahlungen und wird nicht automatisch storniert. '
        + 'Bitte zuerst die Zahlungen klären (z. B. Zahlung entfernen oder Rückzahlung/Gutschrift abstimmen) und danach erneut stornieren.',
      )
    }

    if (!isInvoiceTransitionAllowed(
      original.status as InvoiceStatus,
      InvoiceStatus.CANCELLED,
    )) {
      throw new BusinessRuleError(
        `Rechnung im Status ${original.status} kann nicht storniert werden`,
      )
    }

    // Stornorechnung anlegen (negative Beträge)
    const cancellationNumber = await nextNumber(NumberSequenceType.INVOICE, tx)

    // Zwei verschiedene Semantiken (REQ-029 P5-6 B-1, Owner-Entscheidung D-4): `invoiceDate` ist ein Kalendertag
    // (Berliner Tag der Stornierung, gespeichert als UTC-Mitternacht wie alle Rechnungsdaten); `finalizedAt` ist der echte Zeitpunkt.
    const cancelledAt = new Date()

    const cancellation = await tx.invoice.create({
      data: {
        invoiceNumber:       cancellationNumber,
        customerId:          original.customerId,
        orderId:             original.orderId,
        status:              InvoiceStatus.FINALIZED,
        type:                InvoiceType.CANCELLATION,
        originalInvoiceId:   original.id,
        customerSnapshot:    original.customerSnapshot as Prisma.InputJsonValue,
        companySnapshot:     original.companySnapshot  as Prisma.InputJsonValue,
        invoiceDate:         berlinDayStartUtc(cancelledAt),
        totalNet:            original.totalNet.neg(),
        totalTax:            original.totalTax.neg(),
        totalGross:          original.totalGross.neg(),
        finalizedAt:         cancelledAt,
        createdById:         userId,
        introText:           `Stornierung zu Rechnung ${original.invoiceNumber}`,
        // Käuferreferenz des Originals unverändert übernehmen (BT-10 muss in der Storno konsistent sein)
        buyerReference:      original.buyerReference,
        items: {
          create: original.items.map((item) => ({
            position:    item.position,
            description: item.description,
            quantity:    item.quantity,
            unit:        item.unit,
            unitPrice:   item.unitPrice,
            // Rabattsatz unverändert (NULL bleibt NULL); die Beträge sind negiert
            discountRate: item.discountRate,
            taxRate:     item.taxRate,
            netAmount:   item.netAmount.neg(),
            taxAmount:   item.taxAmount.neg(),
            grossAmount: item.grossAmount.neg(),
          })),
        },
      },
    })

    // Original als CANCELLED markieren – nur, wenn es noch im gelesenen Status und unstorniert ist.
    const marked = await tx.invoice.updateMany({
      where: { id: original.id, status: original.status, cancelledByInvoiceId: null },
      data: {
        status:              InvoiceStatus.CANCELLED,
        cancelledByInvoiceId: cancellation.id,
      },
    })
    if (marked.count === 0) {
      throw new ConflictError('Die Rechnung wurde zwischenzeitlich geändert oder storniert; es wurde nichts storniert.')
    }

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.CANCEL,
      entityType: 'invoice',
      entityId:   original.id,
      oldValue:   { status: original.status },
      newValue:   { status: InvoiceStatus.CANCELLED, cancellationInvoiceId: cancellation.id, cancellationNumber },
      metadata:   { reason },
    })

    return { cancellationInvoiceId: cancellation.id }
  })
}

/**
 * Manuelle Statuswechsel (REQ-029 P4-C). Erlaubt sind ausschließlich:
 *   FINALIZED → SENT   („als versendet markieren")
 *   SENT      → OVERDUE („als überfällig markieren"; keine Stornorechnungen)
 * PAID / PARTIALLY_PAID entstehen nur über erfasste Zahlungen, CANCELLED nur über `cancelInvoice`,
 * FINALIZED nur über `finalizeInvoice`. Sperre + Statusbedingung + Audit in einer Transaktion.
 */
export const MANUAL_INVOICE_TRANSITIONS: Readonly<Partial<Record<InvoiceStatus, readonly InvoiceStatus[]>>> = {
  [InvoiceStatus.FINALIZED]: [InvoiceStatus.SENT],
  [InvoiceStatus.SENT]:      [InvoiceStatus.OVERDUE],
}

export async function changeInvoiceStatus(
  invoiceId: string,
  toStatus:  InvoiceStatus,
  userId:    string,
  userEmail: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE
    `
    if (locked.length === 0) throw new NotFoundError('Rechnung nicht gefunden')

    const invoice = await tx.invoice.findUnique({
      where:  { id: invoiceId },
      select: { status: true, type: true },
    })
    if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')

    const from = invoice.status as InvoiceStatus
    const manual = MANUAL_INVOICE_TRANSITIONS[from] ?? []
    if (!manual.includes(toStatus) || !isInvoiceTransitionAllowed(from, toStatus)) {
      throw new BusinessRuleError(
        `Der Statuswechsel von „${from}" nach „${toStatus}" ist manuell nicht erlaubt. `
        + 'Bezahlt-Status entsteht nur durch erfasste Zahlungen, Stornierungen nur über „Stornieren".',
      )
    }
    if (toStatus === InvoiceStatus.OVERDUE && invoice.type === InvoiceType.CANCELLATION) {
      throw new BusinessRuleError('Eine Stornorechnung kann nicht überfällig werden.')
    }

    const updated = await tx.invoice.updateMany({
      where: { id: invoiceId, status: from },
      data: {
        status: toStatus,
        ...(toStatus === InvoiceStatus.SENT ? { sentAt: new Date() } : {}),
      },
    })
    if (updated.count === 0) {
      throw new ConflictError('Der Rechnungsstatus wurde zwischenzeitlich geändert.')
    }
    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.STATUS_CHANGE,
      entityType: 'invoice',
      entityId:   invoiceId,
      oldValue:   { status: from },
      newValue:   { status: toStatus },
    })
  })
}

// ── Hilfsfunktionen ──────────────────────────────────────────

function validateInvoiceForFinalization(invoice: {
  invoiceDate: Date | null
  items:       { id: string }[]
  customerId:  string
}) {
  const errors: string[] = []

  if (!invoice.invoiceDate)  errors.push('Rechnungsdatum fehlt')
  if (!invoice.customerId)   errors.push('Kunde fehlt')
  if (invoice.items.length === 0) errors.push('Keine Rechnungspositionen vorhanden')

  if (errors.length > 0) {
    throw new BusinessRuleError(
      `Rechnung nicht finalisierbar: ${errors.join(', ')}`,
    )
  }
}

type InvoiceRecipientCustomer = {
  id:          string
  name:        string
  legalName:   string | null
  vatId:       string | null
  taxNumber:   string | null
  street:      string | null
  houseNumber: string | null
  postalCode:  string | null
  city:        string | null
  country:     string
}

function buildCustomerSnapshot(customer: InvoiceRecipientCustomer) {
  return {
    recipientSource: 'CUSTOMER',
    name:        customer.legalName ?? customer.name,
    additional:  null,
    contactName: null,
    email:       null,
    vatId:       customer.vatId,
    taxNumber:   customer.taxNumber,
    street:      customer.street,
    houseNumber: customer.houseNumber,
    postalCode:  customer.postalCode,
    city:        customer.city,
    country:     customer.country,
  }
}

export async function resolveInvoiceRecipientSnapshot(
  customer: InvoiceRecipientCustomer,
  input: Pick<CreateInvoiceDraftInput,
    'invoiceRecipientSource' | 'billingAddressId' | 'recipientName' | 'recipientAdditional' | 'recipientStreet' |
    'recipientHouseNumber' | 'recipientPostalCode' | 'recipientCity' | 'recipientCountry' | 'recipientContactName' | 'recipientEmail'>,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (input.invoiceRecipientSource === 'CUSTOMER') return buildCustomerSnapshot(customer)
  if (input.invoiceRecipientSource === 'BILLING') {
    if (!input.billingAddressId) throw new BusinessRuleError('Bitte eine Rechnungsadresse auswählen.')
    const assignment = await db.customerAddress.findFirst({
      where: { id: input.billingAddressId, customerId: customer.id, type: 'BILLING', deletedAt: null, isActive: true },
      include: { address: true },
    })
    if (!assignment) throw new BusinessRuleError('Die gewählte Rechnungsadresse ist nicht mehr verfügbar.')
    return buildBillingAddressSnapshot(customer, { ...assignment.address, id: assignment.id })
  }
  if (!input.recipientName || !input.recipientStreet || !input.recipientPostalCode || !input.recipientCity || !input.recipientCountry) {
    throw new BusinessRuleError('Die einmalige Rechnungsadresse ist unvollständig.')
  }
  return {
    recipientSource: 'CUSTOM', name: input.recipientName, additional: input.recipientAdditional ?? null,
    street: input.recipientStreet, houseNumber: input.recipientHouseNumber ?? null,
    postalCode: input.recipientPostalCode, city: input.recipientCity, country: input.recipientCountry,
    contactName: input.recipientContactName ?? null, email: input.recipientEmail ?? null,
    vatId: customer.vatId, taxNumber: customer.taxNumber,
  }
}

export function buildBillingAddressSnapshot(customer: Pick<InvoiceRecipientCustomer, 'vatId'|'taxNumber'>, address: {
  id: string; companyName: string; additional: string | null; street: string; houseNumber: string | null
  postalCode: string; city: string; country: string; contactName: string | null; email: string | null
}) {
  return {
    recipientSource: 'BILLING', billingAddressId: address.id, name: address.companyName,
    additional: address.additional, contactName: address.contactName, email: address.email,
    street: address.street, houseNumber: address.houseNumber, postalCode: address.postalCode,
    city: address.city, country: address.country, vatId: customer.vatId, taxNumber: customer.taxNumber,
  }
}

export function buildCompanySnapshot(settings: {
  companyName:  string
  legalForm:    string | null
  vatId:        string | null
  taxNumber:    string | null
  street:       string | null
  houseNumber:  string | null
  postalCode:   string | null
  city:         string | null
  country:      string
  bankName:     string | null
  iban:         string | null
  bic:          string | null
  email:        string | null
  phone:        string | null
  supplierNumber: string | null
  logoStorageKey?: string | null
  logoScale?: number
  logoWidth?: number | null
  logoHeight?: number | null
}) {
  return {
    companyName:  settings.companyName,
    legalForm:    settings.legalForm,
    vatId:        settings.vatId,
    taxNumber:    settings.taxNumber,
    street:       settings.street,
    houseNumber:  settings.houseNumber,
    postalCode:   settings.postalCode,
    city:         settings.city,
    country:      settings.country,
    bankName:     settings.bankName,
    iban:         settings.iban,
    bic:          settings.bic,
    email:        settings.email,
    phone:        settings.phone,
    supplierNumber: settings.supplierNumber,
    logoStorageKey: settings.logoStorageKey ?? null,
    logoScale: settings.logoScale ?? 140,
    logoWidth: settings.logoWidth ?? null,
    logoHeight: settings.logoHeight ?? null,
  }
}
