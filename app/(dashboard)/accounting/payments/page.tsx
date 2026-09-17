import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountingPeriodFilter } from '@/components/accounting/AccountingPeriodFilter'
import { formatCurrency, formatDate, invoiceStatusLabel } from '@/components/accounting/AccountingTableHelpers'
import { PAYMENT_METHODS } from '@/lib/validators/payment.schema'
import { resolveAccountingPeriod } from '@/lib/accounting/period'
import { getAccountingPayments } from '@/lib/services/accounting.service'

export const metadata: Metadata = { title: 'Zahlungseingänge' }

export default async function AccountingPaymentsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const period = resolveAccountingPeriod(await searchParams)
  const rows = await getAccountingPayments(period)
  const method = (value: string | null) => PAYMENT_METHODS.find((entry) => entry.value === value)?.label ?? value ?? '–'
  return <div><PageHeader title="Zahlungseingänge" description="Read-only Ansicht der im Zahlungsmodul erfassten Eingänge" breadcrumbs={[{ label: 'Buchhaltung', href: '/accounting' }, { label: 'Zahlungseingänge' }]} /><div className="space-y-6 p-6"><AccountingPeriodFilter period={period} /><div className="card-base overflow-x-auto"><table className="data-table"><thead><tr><th>Zahlungsdatum</th><th>Rechnung</th><th>Kunde</th><th className="text-right">Betrag</th><th>Methode</th><th>Referenz</th><th>Rechnungsstatus</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Keine Zahlungseingänge im Zeitraum.</td></tr> : rows.map((row) => <tr key={row.id}><td>{formatDate(row.paymentDate)}</td><td><Link href={`/invoices/${row.invoiceId}`} className="mono text-blue-700 hover:underline">{row.invoiceNumber}</Link></td><td>{row.customerName}</td><td className="text-right mono text-emerald-700">{formatCurrency(row.amount)}</td><td>{method(row.method)}</td><td>{row.reference ?? '–'}</td><td>{invoiceStatusLabel(row.invoiceStatus)}</td></tr>)}</tbody></table></div></div></div>
}
