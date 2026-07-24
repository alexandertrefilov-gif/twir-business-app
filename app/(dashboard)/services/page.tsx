// app/(dashboard)/services/page.tsx
import type { Metadata }   from 'next'
import Link                from 'next/link'
import { PageHeader }      from '@/components/shared/PageHeader'
import { getServiceReports } from '@/lib/services/service-report.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { format } from 'date-fns'
import { de }     from 'date-fns/locale'

export const metadata: Metadata = { title: 'Leistungen' }

interface SearchParams { search?: string; page?: string }

export default async function ServicesPage({ searchParams }: { searchParams: SearchParams }) {
  const user       = await requirePermission(Resource.SERVICE_REPORT, Action.READ)
  const page       = parseInt(searchParams.page ?? '1', 10)
  const search     = searchParams.search ?? ''

  const [result, canCreate] = await Promise.all([
    getServiceReports({ search, page, userId: user.userId, userRole: user.role }),
    hasPermission(Resource.SERVICE_REPORT, Action.CREATE),
  ])

  return (
    <div>
      <PageHeader
        title="Leistungserfassung"
        description={user.role === 'EMPLOYEE' ? 'Ihre erfassten Leistungen' : 'Alle Leistungsnachweise'}
        breadcrumbs={[{ label: 'Leistungen' }]}
        actions={canCreate && (
          <Link href="/services/new"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-blue-700 text-white text-sm font-500 hover:bg-blue-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            Leistung erfassen
          </Link>
        )}
      />

      <div className="p-6">
        {user.role === 'EMPLOYEE' && (
          <div className="mb-4 p-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd"/></svg>
            Sie sehen nur Ihre eigenen erfassten Leistungen.
          </div>
        )}

        <div className="card-base overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-3 border-b border-stone-100">
            <form className="flex gap-2">
              <input type="search" name="search" placeholder="Nummer, Auftrag, Bezeichnung …"
                defaultValue={search}
                className="h-8 pl-3 pr-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent w-56" />
              <button type="submit" className="h-8 px-3 rounded-md bg-stone-800 text-white text-xs font-500">Suchen</button>
            </form>
            <p className="ml-auto text-xs text-muted-foreground mono">{result.total} Nachweise</p>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Bezeichnung</th>
                  <th>Auftrag</th>
                  <th>Kunde</th>
                  <th>Datum</th>
                  {user.role !== 'EMPLOYEE' && <th>Erfasst von</th>}
                  <th className="num text-right">Pos.</th>
                  <th className="num text-right">Netto</th>
                </tr>
              </thead>
              <tbody>
                {result.reports.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                    {search ? 'Keine Ergebnisse.' : 'Noch keine Leistungen erfasst.'}
                  </td></tr>
                )}
                {result.reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/services/${r.id}`} className="mono text-xs text-blue-700 hover:underline">
                        {r.reportNumber}
                      </Link>
                    </td>
                    <td className="text-sm">
                      {r.title ?? <span className="text-muted-foreground italic">Kein Titel</span>}
                    </td>
                    <td>
                      <Link href={`/orders/${r.orderId}`} className="mono text-xs text-blue-700 hover:underline">
                        {r.orderNumber}
                      </Link>
                    </td>
                    <td className="text-sm">{r.customerName}</td>
                    <td className="mono text-xs">
                      {format(new Date(r.reportDate), 'dd.MM.yyyy', { locale: de })}
                    </td>
                    {user.role !== 'EMPLOYEE' && (
                      <td className="text-sm text-muted-foreground">{r.createdByName}</td>
                    )}
                    <td className="num text-right mono text-xs">{r.itemCount}</td>
                    <td className="num text-right mono text-sm font-500">
                      {r.totalNet.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
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
