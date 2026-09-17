import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency, formatDate, invoiceStatusLabel, ReconciliationWarning } from '@/components/accounting/AccountingTableHelpers'
import { deriveOpenItems, getOpenAccountingInvoices } from '@/lib/services/accounting.service'

export const metadata: Metadata = { title: 'Offene Posten' }
type OpenFilter = 'all' | 'due' | 'overdue' | 'partial'

export default async function AccountingOpenItemsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const query = await searchParams
  const filter: OpenFilter = query.filter === 'due' || query.filter === 'overdue' || query.filter === 'partial' ? query.filter : 'all'
  const now = new Date()
  const allRows = deriveOpenItems(await getOpenAccountingInvoices(), now)
  const rows = allRows.filter((row) => filter === 'all' || (filter === 'overdue' ? row.overdue : filter === 'partial' ? row.paymentTotal > 0 : row.dueDate !== null && row.dueDate <= now))
  return <div><PageHeader title="Offene Posten" description="Stichtagsbezogene Forderungsübersicht über alle Perioden hinweg, auf Basis der tatsächlich erfassten Zahlungen" breadcrumbs={[{ label: 'Buchhaltung', href: '/accounting' }, { label: 'Offene Posten' }]} /><div className="space-y-6 p-6"><form className="flex flex-wrap gap-2"><select name="filter" defaultValue={filter} className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm"><option value="all">Alle</option><option value="due">Fällig</option><option value="overdue">Überfällig</option><option value="partial">Teilweise bezahlt</option></select><button className="btn-secondary h-9" type="submit">Filtern</button></form><div className="card-base overflow-x-auto"><table className="data-table"><thead><tr><th>Rechnung</th><th>Kunde</th><th className="text-right">Brutto</th><th className="text-right">Bezahlt</th><th className="text-right">Restbetrag</th><th>Fälligkeit</th><th className="text-right">Tage überfällig</th><th>Status</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">Keine offenen Posten für den Filter.</td></tr> : rows.map((row) => <tr key={row.id}><td><Link href={`/invoices/${row.id}`} className="mono text-blue-700 hover:underline">{row.invoiceNumber}</Link>{row.reconciliationMismatch && <ReconciliationWarning />}</td><td>{row.customerName}</td><td className="text-right mono">{formatCurrency(row.totalGross)}</td><td className="text-right mono">{formatCurrency(row.paymentTotal)}</td><td className="text-right mono font-600">{formatCurrency(row.openAmount)}</td><td>{formatDate(row.dueDate)}</td><td className={`text-right mono ${row.overdue ? 'text-red-700' : ''}`}>{row.daysOverdue || '–'}</td><td>{invoiceStatusLabel(row.status)}</td></tr>)}</tbody></table></div></div></div>
}
