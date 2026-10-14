// lib/services/payment.service.ts
//
// Regeln:
//   - Keine Zahlung zu DRAFT oder CANCELLED Rechnungen
//   - Zahlungsbetrag darf den Restbetrag nicht übersteigen (exakter Dezimalvergleich, keine Toleranz) – P4-D
//   - Nach jeder Zahlung: paidAmount neu berechnen, Status ableiten
//   - Löschung = Soft Delete + Status-Neuberechnung
//   - Jede Aktion → Audit-Log (PAYMENT_ADDED / PAYMENT_REMOVED)
//   - Keine Änderung der Rechnungs-Kerndaten (isInvoiceLocked bleibt)
//   - P4-D: Alle Beträge werden mit Dezimalarithmetik (lib/billing) gerechnet und als String gespeichert;
//     `number` entsteht nur an der Ausgabegrenze (PaymentSummary/InvoicePaymentState). Die Zahlungssumme
//     stammt aus den nicht gelöschten Zahlungszeilen (unter Rechnungssperre), nicht aus dem Cache `paidAmount`.
//
// Nutzt: buildAuditLogCreate (Phase 2), AuditAction (Phase 2),
//        InvoiceStatus/INVOICE_LOCKED_STATUSES (Phase 2),
//        NotFoundError/BusinessRuleError (Phase 2 permissions.ts)

import { prisma }            from '@/lib/db/prisma'
import { Prisma }            from '@prisma/client'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import {
  AuditAction,
  InvoiceStatus,
  INVOICE_LOCKED_STATUSES,
} from '@/types/enums'
import { NotFoundError, BusinessRuleError } from '@/lib/auth/permissions'
import type { PaymentCreateInput } from '@/lib/validators/payment.schema'
import { toMoney, remainingMoney, normalizeMoneyInput, derivePaymentStatus, PAYMENT_AMOUNT_SPEC } from '@/lib/billing/payment-math'
import { toCentString } from '@/lib/billing/money'
import { moneyToNumber } from '@/lib/services/money-output'

// ── Types ─────────────────────────────────────────────────────

export interface PaymentSummary {
  id:          string
  amount:      number
  paymentDate: Date
  method:      string | null
  reference:   string | null
  notes:       string | null
  createdAt:   Date
}

export interface InvoicePaymentState {
  totalGross:    number
  paidAmount:    number
  remainingAmount: number
  payments:      PaymentSummary[]
  status:        string
}

/** Eingabe für addPayment: Betrag als Dezimal-String (ältere Aufrufer dürfen eine Zahl übergeben; sie wird streng geprüft). */
export type PaymentAddInput = Omit<PaymentCreateInput, 'amount'> & { amount: string | number }

// ── Helpers ───────────────────────────────────────────────────

/** Statusableitung nach Zahlungsänderung – exakte Dezimallogik in lib/billing (derivePaymentStatus). */
function deriveInvoiceStatus(totalGross: string, paid: string, currentStatus: string): InvoiceStatus {
  return derivePaymentStatus(totalGross, paid, currentStatus) as InvoiceStatus
}

// ── GET ───────────────────────────────────────────────────────

export async function getInvoicePaymentState(
  invoiceId: string,
): Promise<InvoicePaymentState> {
  const invoice = await prisma.invoice.findUnique({
    where:   { id: invoiceId },
    select: {
      totalGross: true,
      paidAmount: true,
      status:     true,
      payments: {
        where:   { deletedAt: null },
        orderBy: { paymentDate: 'asc' },
        select: {
          id:          true,
          amount:      true,
          paymentDate: true,
          method:      true,
          reference:   true,
          notes:       true,
          createdAt:   true,
        },
      },
    },
  })
  if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')

  return {
    totalGross:      moneyToNumber(toMoney(invoice.totalGross)),
    paidAmount:      moneyToNumber(toMoney(invoice.paidAmount)),
    remainingAmount: moneyToNumber(remainingMoney(invoice.totalGross, invoice.paidAmount)),
    payments: invoice.payments.map((p) => ({
      id:          p.id,
      amount:      moneyToNumber(toMoney(p.amount)),
      paymentDate: p.paymentDate,
      method:      p.method,
      reference:   p.reference,
      notes:       p.notes,
      createdAt:   p.createdAt,
    })),
    status: invoice.status,
  }
}

// ── ADD PAYMENT ───────────────────────────────────────────────

export async function addPayment(
  data:      PaymentAddInput,
  userId:    string,
  userEmail: string,
): Promise<string> {
  // P4-D: Betrag serverseitig streng prüfen (Dezimal-String, höchstens 2 Nachkommastellen, > 0), nie runden.
  const checkedAmount = normalizeMoneyInput(data.amount, PAYMENT_AMOUNT_SPEC)
  if (!checkedAmount.ok) throw new BusinessRuleError(checkedAmount.message)
  const amountText = checkedAmount.value
  const amount     = toMoney(amountText)

  return prisma.$transaction(async (tx) => {
    // Rechnungszeile sperren — verhindert, dass zwei parallele Zahlungsbuchungen
    // sich gegenseitig beim Neuberechnen von paidAmount/Status überschreiben (lost update).
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE
    `
    if (locked.length === 0) throw new NotFoundError('Rechnung nicht gefunden')

    const invoice = await tx.invoice.findUnique({
      where:  { id: data.invoiceId },
      select: {
        id:         true,
        status:     true,
        totalGross: true,
        paidAmount: true,
        invoiceNumber: true,
      },
    })
    if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')

    // Only non-draft, non-cancelled invoices can receive payments
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BusinessRuleError('Entwürfe können keine Zahlungen erhalten. Rechnung zuerst finalisieren.')
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BusinessRuleError('Stornierte Rechnungen können keine Zahlungen erhalten.')
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BusinessRuleError('Diese Rechnung ist bereits vollständig bezahlt.')
    }

    // Zahlungssumme aus den aktiven Zahlungszeilen (unter Rechnungssperre) – nicht aus dem Cache paidAmount.
    const activeSum = await tx.payment.aggregate({
      where: { invoiceId: data.invoiceId, deletedAt: null },
      _sum:  { amount: true },
    })
    const currentPaid = toMoney(activeSum._sum.amount ?? '0')
    const remaining   = remainingMoney(invoice.totalGross, currentPaid)

    if (amount.gt(remaining)) {
      throw new BusinessRuleError(
        `Zahlungsbetrag (${amountText} €) übersteigt den Restbetrag (${toCentString(remaining)} €).`,
      )
    }

    // Create payment record
    const payment = await tx.payment.create({
      data: {
        invoiceId:   data.invoiceId,
        amount:      amountText,
        paymentDate: data.paymentDate,
        method:      data.method   ?? null,
        reference:   data.reference ?? null,
        notes:       data.notes    ?? null,
      },
    })

    const newPaid       = currentPaid.plus(amount)
    const newPaidAmount = toCentString(newPaid)
    const newStatus     = deriveInvoiceStatus(invoice.totalGross.toFixed(), newPaidAmount, invoice.status)

    await tx.invoice.update({
      where: { id: data.invoiceId },
      data:  {
        paidAmount: newPaidAmount,
        status:     newStatus,
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.PAYMENT_ADDED,
      entityType: 'invoice',
      entityId:   data.invoiceId,
      newValue: {
        paymentId:    payment.id,
        amount:       amountText,
        paymentDate:  data.paymentDate,
        newPaidAmount,
        newStatus,
        invoiceNumber: invoice.invoiceNumber,
      },
    })

    return payment.id
  })
}

// ── REMOVE PAYMENT ────────────────────────────────────────────

export async function removePayment(
  paymentId: string,
  reason:    string,
  userId:    string,
  userEmail: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const paymentLookup = await tx.payment.findUnique({
      where:  { id: paymentId },
      select: { invoiceId: true },
    })
    if (!paymentLookup) throw new NotFoundError('Zahlung nicht gefunden')

    // Rechnungszeile sperren — verhindert, dass eine parallele Zahlungsbuchung
    // oder -entfernung sich beim Neuberechnen von paidAmount/Status überschreibt.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM invoices WHERE id = ${paymentLookup.invoiceId} FOR UPDATE
    `
    if (locked.length === 0) throw new NotFoundError('Rechnung nicht gefunden')

    const payment = await tx.payment.findUnique({
      where:  { id: paymentId },
      select: {
        id:        true,
        amount:    true,
        deletedAt: true,
        invoiceId: true,
        invoice: {
          select: { status: true, totalGross: true, invoiceNumber: true },
        },
      },
    })
    if (!payment || payment.deletedAt) {
      throw new NotFoundError('Zahlung nicht gefunden')
    }

    // Protect: can't remove payment from PAID invoice without reason escalation
    // (Accounting must explicitly confirm via ConfirmDialog on UI)
    await tx.payment.update({
      where: { id: paymentId },
      data:  { deletedAt: new Date() },
    })

    // Recalculate (exakt, aus den verbleibenden aktiven Zahlungszeilen)
    const aggResult = await tx.payment.aggregate({
      where: { invoiceId: payment.invoiceId, deletedAt: null },
      _sum:  { amount: true },
    })
    const newPaidAmount = toCentString(toMoney(aggResult._sum.amount ?? '0'))
    const newStatus     = deriveInvoiceStatus(
      payment.invoice.totalGross.toFixed(),
      newPaidAmount,
      payment.invoice.status,
    )

    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data:  { paidAmount: newPaidAmount, status: newStatus },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.PAYMENT_REMOVED,
      entityType: 'invoice',
      entityId:   payment.invoiceId,
      oldValue: {
        paymentId:    paymentId,
        amount:       toCentString(toMoney(payment.amount)),
        invoiceNumber: payment.invoice.invoiceNumber,
      },
      newValue:  { newPaidAmount, newStatus },
      metadata:  { reason },
    })
  })
}

// ── GLOBAL PAYMENT JOURNAL ────────────────────────────────────

export interface PaymentJournalEntry {
  id:             string
  invoiceId:      string
  invoiceNumber:  string | null
  customerName:   string
  amount:         number
  paymentDate:    Date
  method:         string | null
  reference:      string | null
  createdAt:      Date
}

export interface PaymentJournalParams {
  search?:   string
  page?:     number
  pageSize?: number
  from?:     Date
  to?:       Date
}

export async function getPaymentJournal(
  params: PaymentJournalParams = {},
): Promise<{ entries: PaymentJournalEntry[]; total: number; totalAmount: number }> {
  const { search = '', page = 1, pageSize = 50, from, to } = params

  const where: Prisma.PaymentWhereInput = {
    deletedAt: null,
    ...(from && { paymentDate: { gte: from } }),
    ...(to   && { paymentDate: { lte: to } }),
    ...(search && {
      OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { invoice:   { invoiceNumber: { contains: search, mode: 'insensitive' } } },
        { invoice:   { customer: { name: { contains: search, mode: 'insensitive' } } } },
      ],
    }),
  }

  const [raw, total, aggResult] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:          true,
        amount:      true,
        paymentDate: true,
        method:      true,
        reference:   true,
        createdAt:   true,
        invoice: {
          select: {
            id:            true,
            invoiceNumber: true,
            customer:      { select: { name: true } },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
  ])

  return {
    entries: raw.map((p) => ({
      id:            p.id,
      invoiceId:     p.invoice.id,
      invoiceNumber: p.invoice.invoiceNumber,
      customerName:  p.invoice.customer.name,
      amount:        moneyToNumber(toMoney(p.amount)),
      paymentDate:   p.paymentDate,
      method:        p.method,
      reference:     p.reference,
      createdAt:     p.createdAt,
    })),
    total,
    totalAmount: moneyToNumber(toMoney(aggResult._sum.amount ?? '0')),
  }
}
