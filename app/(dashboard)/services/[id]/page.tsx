// app/(dashboard)/services/[id]/page.tsx
import type { Metadata }  from 'next'
import { notFound }       from 'next/navigation'
import Link               from 'next/link'
import { PageHeader }     from '@/components/shared/PageHeader'
import { getServiceReportById } from '@/lib/services/service-report.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { SERVICE_ITEM_TYPE_LABELS, type ServiceItemType } from '@/lib/validators/service-report.schema'
import { DeleteServiceReportButton } from '@/components/service-reports/DeleteServiceReportButton'
import { format } from 'date-fns'
import { de }     from 'date-fns/locale'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'

export const metadata: Metadata = { title: 'Leistungsnachweis' }

const TYPE_STYLES: Record<ServiceItemType, string> = {
  hours:    'bg-blue-50 text-blue-700 border-blue-200',
  material: 'bg-amber-50 text-amber-700 border-amber-200',
  flat:     'bg-violet-50 text-violet-700 border-violet-200',
}

export default async function ServiceReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePermission(Resource.SERVICE_REPORT, Action.READ)

  let report
  try { report = await getServiceReportById(id, user.userId, user.role) }
  catch { notFound() }

  const [canEdit, canDelete] = await Promise.all([
    hasPermission(Resource.SERVICE_REPORT, Action.UPDATE),
    hasPermission(Resource.SERVICE_REPORT, Action.DELETE),
  ])

  // Employees can only edit their own
  const isOwn      = report.createdBy.id === user.userId
  const canEditNow = canEdit && (user.role !== 'EMPLOYEE' || isOwn)
  const canDelNow  = canDelete &&
    isTestDeleteEnabled() &&
    (user.role !== 'EMPLOYEE' || isOwn)

  const items = report.items.map((i) => ({
    ...i,
    quantity:  i.quantity.toNumber(),
    unitPrice: i.unitPrice.toNumber(),
    netAmount: i.netAmount.toNumber(),
  }))

  const totalNet = report.totalNet.toNumber()
  const fmt      = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Totals by type
  const byType: Record<string, number> = {}
  for (const i of items) {
    byType[i.type] = Math.round(((byType[i.type] ?? 0) + i.netAmount) * 100) / 100
  }

  return (
    <div>
      <PageHeader
        title={report.reportNumber}
        description={report.title ?? undefined}
        breadcrumbs={[
          { label: 'Leistungen', href: '/services' },
          { label: report.reportNumber },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {canEditNow && (
              <Link href={`/services/${report.id}/edit`}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors">
                Bearbeiten
              </Link>
            )}
            {canDelNow && <DeleteServiceReportButton reportId={report.id} />}
          </div>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Main ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Header info */}
            <div className="card-base p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-2">Auftrag</p>
                  <Link href={`/orders/${report.order.id}`} className="font-600 text-sm text-blue-700 hover:underline mono">
                    {report.order.orderNumber}
                  </Link>
                  {report.order.title && (
                    <p className="text-sm text-muted-foreground mt-0.5">{report.order.title}</p>
                  )}
                  <div className="mt-3">
                    <p className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Kunde</p>
                    <Link href={`/customers/${report.order.customer.id}`} className="text-sm text-blue-700 hover:underline">
                      {report.order.customer.name}
                    </Link>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Leistungsdatum</p>
                    <p className="text-sm font-500">
                      {format(new Date(report.reportDate), 'dd. MMMM yyyy', { locale: de })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Erfasst von</p>
                    <p className="text-sm">
                      {report.createdBy.firstName} {report.createdBy.lastName}
                    </p>
                  </div>
                </div>
              </div>
              {report.description && (
                <div className="mt-4 pt-4 border-t border-stone-100">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{report.description}</p>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="card-base overflow-hidden">
              <div className="px-5 py-3 border-b border-stone-100">
                <h2 className="text-sm font-600">Positionen ({items.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th>Typ</th>
                      <th>Beschreibung</th>
                      <th className="num text-right">Menge</th>
                      <th>Einh.</th>
                      <th className="num text-right">Einzelpr.</th>
                      <th className="num text-right">Netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="mono text-xs text-muted-foreground">{idx + 1}</td>
                        <td>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-500 ${TYPE_STYLES[item.type as ServiceItemType] ?? ''}`}>
                            {SERVICE_ITEM_TYPE_LABELS[item.type as ServiceItemType] ?? item.type}
                          </span>
                        </td>
                        <td>
                          <p className="font-500 text-sm">{item.description}</p>
                          {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                        </td>
                        <td className="num text-right mono text-sm">
                          {item.quantity.toLocaleString('de-DE', { maximumFractionDigits: 3 })}
                        </td>
                        <td className="text-sm">{item.unit}</td>
                        <td className="num text-right mono text-sm">{fmt(item.unitPrice)} €</td>
                        <td className="num text-right mono text-sm font-500">{fmt(item.netAmount)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-stone-100 bg-stone-50/50">
                <div className="flex flex-col items-end gap-1.5">
                  {Object.entries(byType).map(([type, amount]) => (
                    <div key={type} className="flex gap-8 text-sm">
                      <span className="text-muted-foreground">
                        {SERVICE_ITEM_TYPE_LABELS[type as ServiceItemType] ?? type}
                      </span>
                      <span className="mono">{fmt(amount)} €</span>
                    </div>
                  ))}
                  <div className="flex gap-8 font-600 pt-1.5 mt-0.5 border-t border-stone-200 w-48 justify-between">
                    <span>Gesamt netto</span>
                    <span className="mono">{fmt(totalNet)} €</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4">
            <div className="card-base p-4 space-y-3">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Details</p>
              <div>
                <p className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Nummer</p>
                <p className="text-sm mono">{report.reportNumber}</p>
              </div>
              <div>
                <p className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Angelegt am</p>
                <p className="text-sm">{format(new Date(report.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}</p>
              </div>
            </div>

            <div className="card-base p-4">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3">Aktionen</p>
              <div className="space-y-2">
                <a href={`/services/new?order=${report.orderId}`}
                  className="flex items-center gap-2 w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors">
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                  Weitere Leistung erfassen
                </a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
