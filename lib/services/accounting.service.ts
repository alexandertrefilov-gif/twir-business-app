import { prisma } from '@/lib/db/prisma'
import type { AccountingPeriod } from '@/lib/accounting/period'

const REVENUE_STATUSES = ['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'CORRECTED'] as const
const OPEN_STATUSES = ['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const

const cents = (value: number) => Math.round(value * 100) / 100

export interface AccountingInvoiceRow {
  id: string
  invoiceNumber: string
  invoiceDate: Date
  customerName: string
  status: string
  type: string
  dueDate: Date | null
  totalNet: number
  totalTax: number
  itemTaxAmount: number
  totalGross: number
  paymentTotal: number
  openAmount: number
  reconciliationMismatch: boolean
  storedPaidAmount: number
}

export interface AccountingPaymentRow {
  id: string
  paymentDate: Date
  invoiceId: string
  invoiceNumber: string
  customerName: string
  invoiceStatus: string
  amount: number
  method: string | null
  reference: string | null
}

export interface AccountingOpenItem extends AccountingInvoiceRow {
  daysOverdue: number
  overdue: boolean
}

function invoiceDateWhere(period: AccountingPeriod) {
  return { gte: period.from, lt: period.toExclusive }
}

const INVOICE_ROW_SELECT = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  dueDate: true,
  status: true,
  type: true,
  totalNet: true,
  totalTax: true,
  totalGross: true,
  paidAmount: true,
  items: { select: { taxAmount: true } },
  customer: { select: { name: true } },
  payments: { where: { deletedAt: null }, select: { amount: true } },
} as const

type InvoiceRowSource = Awaited<ReturnType<typeof prisma.invoice.findMany<{ select: typeof INVOICE_ROW_SELECT }>>>[number]

function toAccountingInvoiceRow(invoice: InvoiceRowSource): AccountingInvoiceRow {
  const paymentTotal = cents(invoice.payments.reduce((sum, payment) => sum + payment.amount.toNumber(), 0))
  const storedPaidAmount = invoice.paidAmount.toNumber()
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber!,
    invoiceDate: invoice.invoiceDate,
    customerName: invoice.customer.name,
    status: invoice.status,
    type: invoice.type,
    dueDate: invoice.dueDate,
    totalNet: invoice.totalNet.toNumber(),
    totalTax: invoice.totalTax.toNumber(),
    itemTaxAmount: cents(invoice.items.reduce((sum, item) => sum + item.taxAmount.toNumber(), 0)),
    totalGross: invoice.totalGross.toNumber(),
    paymentTotal,
    openAmount: cents(Math.max(0, invoice.totalGross.toNumber() - paymentTotal)),
    reconciliationMismatch: Math.abs(storedPaidAmount - paymentTotal) >= 0.01,
    storedPaidAmount,
  }
}

export async function getAccountingInvoices(period: AccountingPeriod): Promise<AccountingInvoiceRow[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      invoiceDate: invoiceDateWhere(period),
      invoiceNumber: { not: null },
      status: { in: [...REVENUE_STATUSES] },
    },
    orderBy: [{ invoiceDate: 'desc' }, { invoiceNumber: 'desc' }],
    select: INVOICE_ROW_SELECT,
  })
  return invoices.map(toAccountingInvoiceRow)
}

/**
 * Offene Posten sind ein Stichtags-Bestand (welche Rechnungen sind gerade
 * unbezahlt), keine periodengebundene Auswertung — bewusst ohne
 * invoiceDate-Filter, sonst verschwinden unbezahlte Altrechnungen aus
 * Vorperioden aus der Forderungsübersicht, sobald der Monatsfilter wechselt.
 */
export async function getOpenAccountingInvoices(): Promise<AccountingInvoiceRow[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      invoiceNumber: { not: null },
      status: { in: [...OPEN_STATUSES] },
    },
    orderBy: [{ dueDate: 'asc' }, { invoiceNumber: 'desc' }],
    select: INVOICE_ROW_SELECT,
  })
  return invoices.map(toAccountingInvoiceRow)
}

export async function getAccountingPayments(period: AccountingPeriod): Promise<AccountingPaymentRow[]> {
  const payments = await prisma.payment.findMany({
    where: { deletedAt: null, paymentDate: { gte: period.from, lt: period.toExclusive } },
    orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      paymentDate: true,
      amount: true,
      method: true,
      reference: true,
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          customer: { select: { name: true } },
        },
      },
    },
  })
  return payments.map((payment) => ({
    id: payment.id,
    paymentDate: payment.paymentDate,
    amount: payment.amount.toNumber(),
    method: payment.method,
    reference: payment.reference,
    invoiceId: payment.invoice.id,
    invoiceNumber: payment.invoice.invoiceNumber ?? 'Rechnung ohne Nummer',
    invoiceStatus: payment.invoice.status,
    customerName: payment.invoice.customer.name,
  }))
}

export function deriveOpenItems(rows: AccountingInvoiceRow[], now = new Date()): AccountingOpenItem[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return rows
    .filter((row) => (OPEN_STATUSES as readonly string[]).includes(row.status) && row.openAmount > 0)
    .map((row) => {
      const due = row.dueDate ? new Date(row.dueDate.getFullYear(), row.dueDate.getMonth(), row.dueDate.getDate()) : null
      const daysOverdue = due && due < today ? Math.floor((today.getTime() - due.getTime()) / 86_400_000) : 0
      return { ...row, daysOverdue, overdue: daysOverdue > 0 }
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
}

export async function getAccountingOverview(period: AccountingPeriod) {
  const [invoices, payments, openInvoices] = await Promise.all([
    getAccountingInvoices(period),
    getAccountingPayments(period),
    getOpenAccountingInvoices(),
  ])
  // Offene/überfällige Forderungen sind ein Stichtags-Bestand über alle
  // Perioden hinweg — nicht auf den gewählten Zeitraum beschränkt.
  const openItems = deriveOpenItems(openInvoices)
  return {
    invoicedRevenue: cents(invoices.reduce((sum, invoice) => sum + invoice.totalNet, 0)),
    paymentIncome: cents(payments.reduce((sum, payment) => sum + payment.amount, 0)),
    openReceivables: cents(openItems.reduce((sum, invoice) => sum + invoice.openAmount, 0)),
    overdueReceivables: cents(openItems.filter((invoice) => invoice.overdue).reduce((sum, invoice) => sum + invoice.openAmount, 0)),
    outputTax: cents(invoices.reduce((sum, invoice) => sum + invoice.itemTaxAmount, 0)),
    reconciliationWarnings: invoices.filter((invoice) => invoice.reconciliationMismatch),
    recentInvoices: invoices.slice(0, 5),
    largestOpenItems: [...openItems].sort((a, b) => b.openAmount - a.openAmount).slice(0, 5),
    recentPayments: payments.slice(0, 5),
  }
}
