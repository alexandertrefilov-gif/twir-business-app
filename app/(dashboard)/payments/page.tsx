// app/(dashboard)/payments/page.tsx
import type { Metadata }   from 'next'
import Link                from 'next/link'
import { PageHeader }      from '@/components/shared/PageHeader'
import { getPaymentJournal } from '@/lib/services/payment.service'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { PAYMENT_METHODS } from '@/lib/validators/payment.schema'
import { format }          from 'date-fns'
import { de }              from 'date-fns/locale'

export const metadata: Metadata = { title: 'Zahlungen' }

interface SearchParams {
  search?: string
  from?:   string
  to?:     string
  page?:   string
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams
  await requirePermission(Resource.PAYMENT, Action.READ)

  const page   = parseInt(query.page ?? '1', 10)
  const search = query.search ?? ''
  const from   = query.from ? new Date(query.from) : undefined
  const to     = query.to   ? new Date(query.to)   : undefined

  const { entries, total, totalAmount } = await getPaymentJournal({
    search, page, from, to,
  })

  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  const fmtDate = (d: Date) =>
    format(new Date(d), 'dd.MM.yyyy', { locale: de })

  function methodLabel(m: string | null) {
    if (!m) return '–'
    return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m
  }

  return (
    <div>
      <PageHeader
        title="Zahlungsjournal"
        description="Alle erfassten Zahlungseingänge"
        breadcrumbs={[{ label: 'Zahlungen' }]}
      />

      <div className="p-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="stat-card">
            <p className="stat-value">{fmt(totalAmount)}</p>
            <p className="stat-label">
              {from || to ? 'Summe (gefiltert)' : 'Gesamtsumme'}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-value mono">{total.toLocaleString('de-DE')}</p>
            <p className="stat-label">Zahlungseinträge</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">
              {total > 0
                ? fmt(totalAmount / total)
                : '–'}
            </p>
            <p className="stat-label">Ø pro Zahlung</p>
          </div>
        </div>

        <div className="card-base overflow-hidden">
          {/* Filters */}
          <div className="px-6 py-3 border-b border-stone-100">
            <form className="flex flex-wrap items-center gap-3">
              <input type="search" name="search" placeholder="Rechnung, Kunde, Referenz …"
                defaultValue={search}
                className="h-8 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent w-56" />
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Von</label>
                <input type="date" name="from" defaultValue={query.from ?? ''}
                  className="h-8 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                <label className="text-xs text-muted-foreground">bis</label>
                <input type="date" name="to" defaultValue={query.to ?? ''}
                  className="h-8 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
              </div>
              <button type="submit"
                className="h-8 px-3 rounded-md bg-stone-800 text-white text-xs font-500 hover:bg-stone-900 transition-colors">
                Filtern
              </button>
              {(search || query.from || query.to) && (
                <a href="/payments" className="text-xs text-muted-foreground hover:text-foreground">Zurücksetzen</a>
              )}
              <p className="ml-auto text-xs text-muted-foreground mono">{total} Einträge</p>
            </form>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Rechnung</th>
                  <th>Kunde</th>
                  <th>Zahlungsart</th>
                  <th>Referenz</th>
                  <th className="num text-right">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                      {search || from || to
                        ? 'Keine Zahlungen für den gewählten Filter.'
                        : 'Noch keine Zahlungen erfasst.'}
                    </td>
                  </tr>
                )}
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="mono text-xs">{fmtDate(e.paymentDate)}</td>
                    <td>
                      {e.invoiceNumber ? (
                        <Link href={`/invoices/${e.invoiceId}`}
                          className="mono text-xs text-blue-700 hover:underline">
                          {e.invoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">–</span>
                      )}
                    </td>
                    <td className="text-sm">{e.customerName}</td>
                    <td className="text-sm">{methodLabel(e.method)}</td>
                    <td>
                      {e.reference
                        ? <span className="mono text-xs text-muted-foreground">{e.reference}</span>
                        : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="num text-right">
                      <span className="mono text-sm font-500 text-emerald-700">
                        {fmt(e.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
