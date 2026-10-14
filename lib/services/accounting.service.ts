import { prisma } from '@/lib/db/prisma'
import type { AccountingPeriod } from '@/lib/accounting/period'
import { MoneyDecimal } from '@/lib/billing/money'
import { toMoney, sumMoney } from '@/lib/billing/payment-math'
import { sumCentNumbers, moneyToNumber } from '@/lib/services/money-output'
import { berlinDayStartUtc } from '@/lib/utils/berlin-date'

const REVENUE_STATUSES = ['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'CORRECTED'] as const
const OPEN_STATUSES = ['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const

// REQ-029 P4-D: Summen und Differenzen werden mit Dezimalarithmetik gerechnet (lib/billing); `number` nur an der Ausgabegrenze.

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
  const paymentTotal = sumMoney(invoice.payments.map((payment) => payment.amount))
  const storedPaid = toMoney(invoice.paidAmount)
  const open = toMoney(invoice.totalGross).minus(paymentTotal)
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber!,
    invoiceDate: invoice.invoiceDate,
    customerName: invoice.customer.name,
    status: invoice.status,
    type: invoice.type,
    dueDate: invoice.dueDate,
    totalNet: moneyToNumber(toMoney(invoice.totalNet)),
    totalTax: moneyToNumber(toMoney(invoice.totalTax)),
    itemTaxAmount: moneyToNumber(sumMoney(invoice.items.map((item) => item.taxAmount))),
    totalGross: moneyToNumber(toMoney(invoice.totalGross)),
    paymentTotal: moneyToNumber(paymentTotal),
    openAmount: moneyToNumber(open.lt(0) ? new MoneyDecimal(0) : open),
    reconciliationMismatch: storedPaid.minus(paymentTotal).abs().gte('0.01'),
    storedPaidAmount: moneyToNumber(storedPaid),
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
    amount: moneyToNumber(toMoney(payment.amount)),
    method: payment.method,
    reference: payment.reference,
    invoiceId: payment.invoice.id,
    invoiceNumber: payment.invoice.invoiceNumber ?? 'Rechnung ohne Nummer',
    invoiceStatus: payment.invoice.status,
    customerName: payment.invoice.customer.name,
  }))
}

const MS_PRO_TAG = 86_400_000

/**
 * Laufende Nummer des UTC-Kalendertags (Tage seit 1970-01-01). `Date.UTC(y, m, d)` ist immer ein ganzes Vielfaches
 * von 86 400 000 ms (UTC kennt keine Sommerzeit); die Division ist daher exakt und ganzzahlig. Ein Wert mit Uhrzeit
 * (Altbestand) wird auf seinen UTC-Kalendertag normiert – maßgeblich ist der Tag, nicht die Uhrzeit.
 */
function utcDayNumber(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PRO_TAG
}

/**
 * „Fällig" im Sinne der Offenen-Posten-Liste: Fälligkeitstag ist heute (Europe/Berlin) oder früher.
 * Anders als „überfällig" zählt der Fälligkeitstag selbst bereits als fällig.
 */
export function isOpenItemDue(dueDate: Date | null, now = new Date()): boolean {
  return dueDate !== null && utcDayNumber(dueDate) <= utcDayNumber(berlinDayStartUtc(now))
}

/**
 * Offene Posten mit Überfälligkeit – dieselbe Semantik wie `markOverdueInvoices` (P5-2): überfällig ab dem Berliner
 * Kalendertag NACH der Fälligkeit; der Fälligkeitstag selbst ist nicht überfällig. Die Tage sind die Differenz ganzer
 * Kalendertage (keine Millisekundenarithmetik lokaler Mitternachten → kein Sommerzeit-Fehler).
 */
export function deriveOpenItems(rows: AccountingInvoiceRow[], now = new Date()): AccountingOpenItem[] {
  const today = utcDayNumber(berlinDayStartUtc(now))
  return rows
    .filter((row) => (OPEN_STATUSES as readonly string[]).includes(row.status) && row.openAmount > 0)
    .map((row) => {
      const due = row.dueDate ? utcDayNumber(row.dueDate) : null
      const daysOverdue = due !== null && due < today ? today - due : 0
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
    invoicedRevenue: sumCentNumbers(invoices.map((invoice) => invoice.totalNet)),
    paymentIncome: sumCentNumbers(payments.map((payment) => payment.amount)),
    openReceivables: sumCentNumbers(openItems.map((invoice) => invoice.openAmount)),
    overdueReceivables: sumCentNumbers(openItems.filter((invoice) => invoice.overdue).map((invoice) => invoice.openAmount)),
    outputTax: sumCentNumbers(invoices.map((invoice) => invoice.itemTaxAmount)),
    reconciliationWarnings: invoices.filter((invoice) => invoice.reconciliationMismatch),
    recentInvoices: invoices.slice(0, 5),
    largestOpenItems: [...openItems].sort((a, b) => b.openAmount - a.openAmount).slice(0, 5),
    recentPayments: payments.slice(0, 5),
  }
}
