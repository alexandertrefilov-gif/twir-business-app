// app/(dashboard)/orders/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader }     from '@/components/shared/PageHeader'
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge'
import { getOrders }       from '@/lib/services/order.service'
import { hasPermission, Resource, Action } from '@/lib/auth/permissions'
import { ORDER_STATUS_LABELS } from '@/types/enums'
import { format } from 'date-fns'
import { de }     from 'date-fns/locale'
import { RecordDeleteButton } from '@/components/shared/RecordDeleteButton'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'

export const metadata: Metadata = { title: 'Aufträge' }

interface SearchParams { search?: string; status?: string; page?: string }

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query  = await searchParams
  const page   = parseInt(query.page ?? '1', 10)
  const search = query.search ?? ''
  const status = query.status ?? ''
  const canDeleteAllStatuses = isTestDeleteEnabled()

  const [result, canCreate, canDelete] = await Promise.all([
    getOrders({ search, status: status || undefined, page }),
    hasPermission(Resource.ORDER, Action.CREATE),
    hasPermission(Resource.ORDER, Action.DELETE),
  ])

  const STATUS_OPTS = [
    { value: '', label: 'Alle Status' },
    ...Object.entries(ORDER_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ]

  return (
    <div>
      <PageHeader
        title="Aufträge"
        description="Laufende und abgeschlossene Aufträge"
        breadcrumbs={[{ label: 'Aufträge' }]}
        actions={canCreate && (
          <Link href="/orders/new"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-blue-700 text-white text-sm font-500 hover:bg-blue-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            Neuer Auftrag
          </Link>
        )}
      />

      <div className="p-6">
        <div className="card-base overflow-hidden">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-stone-100">
            <form className="flex gap-2 flex-wrap">
              <input type="search" name="search" placeholder="Nummer, Bezeichnung, Kunde …"
                defaultValue={search}
                className="h-8 pl-3 pr-3 rounded-md border border-stone-200 bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent w-56" />
              <select name="status" defaultValue={status}
                className="h-8 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="submit"
                className="h-8 px-3 rounded-md bg-stone-800 text-white text-xs font-500 hover:bg-stone-900 transition-colors">
                Filtern
              </button>
            </form>
            <p className="ml-auto text-xs text-muted-foreground mono">{result.total} Aufträge</p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Bezeichnung</th>
                  <th>Kunde</th>
                  <th>Aus Angebot</th>
                  <th>Datum</th>
                  <th>Status</th>
                  <th className="num text-right">LN</th>
                  <th className="num text-right">Brutto</th>
                  <th className="text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {result.orders.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    {search || status ? 'Keine Aufträge für den gewählten Filter.' : 'Noch keine Aufträge vorhanden.'}
                  </td></tr>
                )}
                {result.orders.map((o) => (
                  <tr key={o.id} className="cursor-pointer group">
                    <td>
                      <Link href={`/orders/${o.id}`} className="mono text-xs font-500 text-foreground hover:text-blue-700">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/orders/${o.id}`} className="text-sm font-500 text-foreground hover:text-blue-700 block truncate max-w-[200px]">
                        {o.title ?? <span className="text-muted-foreground italic font-400">Keine Bezeichnung</span>}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/customers/${o.customerId}`} className="text-sm text-blue-700 hover:underline">
                        {o.customerName}
                      </Link>
                    </td>
                    <td>
                      {o.offerNumber
                        ? <span className="mono text-xs text-muted-foreground">{o.offerNumber}</span>
                        : <span className="text-muted-foreground text-xs">–</span>}
                    </td>
                    <td>
                      <span className="mono text-xs">
                        {format(new Date(o.orderDate), 'dd.MM.yyyy', { locale: de })}
                      </span>
                    </td>
                    <td><OrderStatusBadge status={o.status} size="sm" /></td>
                    <td className="num text-right">
                      {o.serviceReportCount > 0
                        ? <span className="mono text-xs">{o.serviceReportCount}</span>
                        : <span className="text-stone-300">–</span>}
                    </td>
                    <td>
                      {canDelete && canDeleteAllStatuses && (
                        canDeleteAllStatuses ||
                        (o.status === 'OPEN' && o.serviceReportCount === 0)
                      ) && (
                        <RecordDeleteButton id={o.id} type="order" />
                      )}
                    </td>
                    <td className="num text-right">
                      <span className="mono text-sm font-500">
                        {o.totalGross.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
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
