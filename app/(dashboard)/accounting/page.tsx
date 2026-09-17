import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountingPeriodFilter } from '@/components/accounting/AccountingPeriodFilter'
import { formatCurrency, formatDate, ReconciliationWarning } from '@/components/accounting/AccountingTableHelpers'
import { resolveAccountingPeriod } from '@/lib/accounting/period'
import { getAccountingOverview } from '@/lib/services/accounting.service'

export const metadata: Metadata = { title: 'Buchhaltung' }

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const period = resolveAccountingPeriod(await searchParams)
  const data = await getAccountingOverview(period)
  const query = new URLSearchParams({ period: period.preset, from: period.fromInput, to: period.toInput }).toString()
  const kpis = [
    ['Fakturierter Umsatz', data.invoicedRevenue],
    ['Zahlungseingänge', data.paymentIncome],
    ['Offene Forderungen', data.openReceivables],
    ['Überfällige Forderungen', data.overdueReceivables],
    ['Umsatzsteuer aus Ausgangsrechnungen', data.outputTax],
  ] as const

  return <div>
    <PageHeader title="Buchhaltung" description="Read-only Übersicht aus Ausgangsrechnungen und Zahlungseingängen" breadcrumbs={[{ label: 'Finanzen' }, { label: 'Buchhaltung' }]} />
    <div className="space-y-6 p-6">
      <AccountingPeriodFilter period={period} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map(([label, value]) => <div key={label} className="stat-card"><p className="stat-value text-xl">{formatCurrency(value)}</p><p className="stat-label">{label}</p></div>)}
      </div>
      {data.reconciliationWarnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">⚠ Bei {data.reconciliationWarnings.length} Rechnung(en) weicht `paidAmount` von der Summe der Zahlungsdatensätze ab. Es wurden keine Daten verändert.</div>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <DashboardList title="Letzte Ausgangsrechnungen" href={`/accounting/income?${query}`} rows={data.recentInvoices.map((row) => ({ id: row.id, href: `/invoices/${row.id}`, title: row.invoiceNumber, detail: `${row.customerName} · ${formatCurrency(row.totalGross)}`, warning: row.reconciliationMismatch }))} />
        <DashboardList title="Größte offene Posten" href="/accounting/open-items" rows={data.largestOpenItems.map((row) => ({ id: row.id, href: `/invoices/${row.id}`, title: row.invoiceNumber, detail: `${row.customerName} · ${formatCurrency(row.openAmount)}`, warning: row.reconciliationMismatch }))} />
        <DashboardList title="Letzte Zahlungseingänge" href={`/accounting/payments?${query}`} rows={data.recentPayments.map((row) => ({ id: row.id, href: `/invoices/${row.invoiceId}`, title: formatCurrency(row.amount), detail: `${formatDate(row.paymentDate)} · ${row.customerName}` }))} />
      </div>
    </div>
  </div>
}

function DashboardList({ title, href, rows }: { title: string; href: string; rows: Array<{ id: string; href: string; title: string; detail: string; warning?: boolean }> }) {
  return <section className="card-base overflow-hidden"><div className="flex items-center justify-between border-b border-stone-100 px-5 py-3"><h2 className="text-sm font-600">{title}</h2><Link href={href} className="text-xs text-blue-700 hover:underline">Alle anzeigen</Link></div><div className="divide-y divide-stone-100">{rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Keine Daten im Zeitraum.</p> : rows.map((row) => <Link key={row.id} href={row.href} className="block px-5 py-3 hover:bg-stone-50"><p className="text-sm font-500">{row.title}{row.warning && <ReconciliationWarning />}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p></Link>)}</div></section>
}
