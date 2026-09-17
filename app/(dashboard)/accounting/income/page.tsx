import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountingPeriodFilter } from '@/components/accounting/AccountingPeriodFilter'
import { formatCurrency, formatDate, invoiceStatusLabel, ReconciliationWarning } from '@/components/accounting/AccountingTableHelpers'
import { resolveAccountingPeriod } from '@/lib/accounting/period'
import { getAccountingInvoices } from '@/lib/services/accounting.service'

export const metadata: Metadata = { title: 'Ausgangsrechnungen / fakturierter Umsatz' }

export default async function AccountingIncomePage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const period = resolveAccountingPeriod(await searchParams)
  const rows = await getAccountingInvoices(period)
  return <div><PageHeader title="Ausgangsrechnungen / fakturierter Umsatz" description="Fakturierte Beträge sind nicht mit Zahlungseingängen gleichzusetzen." breadcrumbs={[{ label: 'Buchhaltung', href: '/accounting' }, { label: 'Einnahmen' }]} /><div className="space-y-6 p-6"><AccountingPeriodFilter period={period} /><div className="card-base overflow-x-auto"><table className="data-table"><thead><tr><th>Datum</th><th>Rechnung</th><th>Kunde</th><th className="text-right">Netto</th><th className="text-right">Umsatzsteuer</th><th className="text-right">Brutto</th><th className="text-right">Bezahlt</th><th className="text-right">Offen</th><th>Fälligkeit</th><th>Status</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Keine Ausgangsrechnungen im Zeitraum.</td></tr> : rows.map((row) => <tr key={row.id}><td>{formatDate(row.invoiceDate)}</td><td><Link href={`/invoices/${row.id}`} className="mono text-blue-700 hover:underline">{row.invoiceNumber}</Link>{row.reconciliationMismatch && <ReconciliationWarning />}</td><td>{row.customerName}</td><td className="text-right mono">{formatCurrency(row.totalNet)}</td><td className="text-right mono">{formatCurrency(row.totalTax)}</td><td className="text-right mono">{formatCurrency(row.totalGross)}</td><td className="text-right mono">{formatCurrency(row.paymentTotal)}</td><td className="text-right mono">{row.status === 'CANCELLED' ? '–' : formatCurrency(row.openAmount)}</td><td>{formatDate(row.dueDate)}</td><td>{invoiceStatusLabel(row.status)}</td></tr>)}</tbody></table></div></div></div>
}
