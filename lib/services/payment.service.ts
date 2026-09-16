// lib/services/payment.service.ts
//
// Regeln:
//   - Keine Zahlung zu DRAFT oder CANCELLED Rechnungen
//   - Zahlungsbetrag darf Rechnungsbetrag nicht übersteigen
//   - Nach jeder Zahlung: paidAmount neu berechnen, Status ableiten
//   - Löschung = Soft Delete + Status-Neuberechnung
//   - Jede Aktion → Audit-Log (PAYMENT_ADDED / PAYMENT_REMOVED)
//   - Keine Änderung der Rechnungs-Kerndaten (isInvoiceLocked bleibt)
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

// ── Helpers ───────────────────────────────────────────────────

/**
 * Berechnet den neuen Rechnungsstatus nach Zahlung.
 * Regeln:
 *   paidAmount >= totalGross → PAID
 *   paidAmount > 0           → PARTIALLY_PAID
 *   paidAmount = 0 + overdue  → OVERDUE bleibt
 *   paidAmount = 0            → SENT (zurücksetzen)
 */
function deriveInvoiceStatus(
  totalGross:  number,
  paidAmount:  number,
  currentStatus: string,
): InvoiceStatus {
  if (paidAmount >= totalGross) return InvoiceStatus.PAID
  if (paidAmount > 0)           return InvoiceStatus.PARTIALLY_PAID
  // No payments left → revert to SENT or OVERDUE
  if (currentStatus === InvoiceStatus.OVERDUE) return InvoiceStatus.OVERDUE
  return InvoiceStatus.SENT
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

  const totalGross  = invoice.totalGross.toNumber()
  const paidAmount  = invoice.paidAmount.toNumber()

  return {
    totalGross,
    paidAmount,
    remainingAmount: Math.round((totalGross - paidAmount) * 100) / 100,
    payments: invoice.payments.map((p) => ({
      id:          p.id,
      amount:      p.amount.toNumber(),
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
  data:      PaymentCreateInput,
  userId:    string,
  userEmail: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
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

    const totalGross      = invoice.totalGross.toNumber()
    const currentPaid     = invoice.paidAmount.toNumber()
    const remaining       = Math.round((totalGross - currentPaid) * 100) / 100

    if (data.amount > remaining + 0.005) {
      throw new BusinessRuleError(
        `Zahlungsbetrag (${data.amount.toFixed(2)} €) übersteigt den Restbetrag (${remaining.toFixed(2)} €).`,
      )
    }

    // Create payment record
    const payment = await tx.payment.create({
      data: {
        invoiceId:   data.invoiceId,
        amount:      data.amount,
        paymentDate: data.paymentDate,
        method:      data.method   ?? null,
        reference:   data.reference ?? null,
        notes:       data.notes    ?? null,
      },
    })

    // Recalculate paid total from all non-deleted payments
    const aggResult = await tx.payment.aggregate({
      where: { invoiceId: data.invoiceId, deletedAt: null },
      _sum:  { amount: true },
    })
    const newPaidAmount = aggResult._sum.amount?.toNumber() ?? 0
    const newStatus     = deriveInvoiceStatus(totalGross, newPaidAmount, invoice.status)

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
        amount:       data.amount,
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

    // Recalculate
    const aggResult = await tx.payment.aggregate({
      where: { invoiceId: payment.invoiceId, deletedAt: null },
      _sum:  { amount: true },
    })
    const newPaidAmount = aggResult._sum.amount?.toNumber() ?? 0
    const totalGross    = payment.invoice.totalGross.toNumber()
    const newStatus     = deriveInvoiceStatus(
      totalGross,
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
        amount:       payment.amount.toNumber(),
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
      amount:        p.amount.toNumber(),
      paymentDate:   p.paymentDate,
      method:        p.method,
      reference:     p.reference,
      createdAt:     p.createdAt,
    })),
    total,
    totalAmount: aggResult._sum.amount?.toNumber() ?? 0,
  }
}
