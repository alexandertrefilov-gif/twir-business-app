// app/(dashboard)/invoices/page.tsx
import type { Metadata }      from 'next'
import Link                   from 'next/link'
import { PageHeader }         from '@/components/shared/PageHeader'
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge'
import { getInvoices }        from '@/lib/services/invoice-query.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { INVOICE_STATUS_LABELS } from '@/types/enums'
import { format }             from 'date-fns'
import { de }                 from 'date-fns/locale'

export const metadata: Metadata = { title: 'Rechnungen' }

interface SearchParams { search?: string; status?: string; page?: string }

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(Resource.INVOICE, Action.READ)

  const page   = parseInt(searchParams.page ?? '1', 10)
  const search = searchParams.search ?? ''
  const status = searchParams.status ?? ''

  const [result, canCreate] = await Promise.all([
    getInvoices({ search, status: status || undefined, page }),
    hasPermission(Resource.INVOICE, Action.CREATE),
  ])

  const today = new Date(); today.setHours(0,0,0,0)
  const fmt   = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  const fmtD  = (d: Date)   => format(new Date(d), 'dd.MM.yyyy', { locale: de })

  return (
    <div>
      <PageHeader
        title="Rechnungen"
        description="Rechnungsverwaltung und -übersicht"
        breadcrumbs={[{ label: 'Rechnungen' }]}
        actions={canCreate && (
          <Link href="/invoices/new"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-blue-700 text-white text-sm font-500 hover:bg-blue-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            Neue Rechnung
          </Link>
        )}
      />
      <div className="p-6">
        <div className="card-base overflow-hidden">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-stone-100">
            <form className="flex gap-2 flex-wrap items-center">
              <input type="search" name="search" placeholder="Nummer, Kunde …"
                defaultValue={search}
                className="h-8 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 w-48" />
              <select name="status" defaultValue={status}
                className="h-8 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="">Alle Status</option>
                {Object.entries(INVOICE_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <button type="submit" className="h-8 px-3 rounded-md bg-stone-800 text-white text-xs font-500">Filtern</button>
            </form>
            <p className="ml-auto text-xs text-muted-foreground mono">{result.total} Rechnungen</p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Kunde</th>
                  <th>Datum</th>
                  <th>Fällig</th>
                  <th>Status</th>
                  <th className="num text-right">Gesamt</th>
                  <th className="num text-right">Offen</th>
                </tr>
              </thead>
              <tbody>
                {result.invoices.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                    {search || status ? 'Keine Rechnungen für diesen Filter.' : 'Noch keine Rechnungen vorhanden.'}
                  </td></tr>
                )}
                {result.invoices.map((inv) => {
                  const isOverdueSoon = inv.dueDate &&
                    new Date(inv.dueDate) < new Date(today.getTime() + 3 * 86400000) &&
                    !['PAID', 'CANCELLED', 'DRAFT'].includes(inv.status)

                  return (
                    <tr key={inv.id}>
                      <td>
                        <Link href={`/invoices/${inv.id}`}
                          className="mono text-xs font-500 text-blue-700 hover:underline">
                          {inv.invoiceNumber ?? <span className="text-muted-foreground italic">Entwurf</span>}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/customers/${inv.customerId}`}
                          className="text-sm text-blue-700 hover:underline">
                          {inv.customerName}
                        </Link>
                      </td>
                      <td className="mono text-xs">{fmtD(inv.invoiceDate)}</td>
                      <td>
                        {inv.dueDate ? (
                          <span className={`mono text-xs ${isOverdueSoon ? 'text-red-600 font-500' : ''}`}>
                            {fmtD(inv.dueDate)}{isOverdueSoon ? ' ⚠' : ''}
                          </span>
                        ) : <span className="text-muted-foreground">–</span>}
                      </td>
                      <td><InvoiceStatusBadge status={inv.status} size="sm" /></td>
                      <td className="num text-right mono text-sm font-500">{fmt(inv.totalGross)}</td>
                      <td className="num text-right">
                        {inv.remainingAmount > 0
                          ? <span className="mono text-sm font-500 text-amber-700">{fmt(inv.remainingAmount)}</span>
                          : <span className="text-emerald-600 text-xs">✓</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
