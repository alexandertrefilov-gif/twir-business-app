// app/(dashboard)/orders/[id]/page.tsx
import type { Metadata }      from 'next'
import { notFound }           from 'next/navigation'
import Link                   from 'next/link'
import { PageHeader }         from '@/components/shared/PageHeader'
import { OrderStatusBadge }   from '@/components/orders/OrderStatusBadge'
import { OrderStatusActions } from '@/components/orders/OrderStatusActions'
import { getOrderById }       from '@/lib/services/order.service'
import { hasPermission, Resource, Action } from '@/lib/auth/permissions'
import { format } from 'date-fns'
import { de }     from 'date-fns/locale'
import type { OrderStatus } from '@/types/enums'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try { const o = await getOrderById(id); return { title: o.orderNumber } }
  catch { return { title: 'Auftrag' } }
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let order
  try { order = await getOrderById(id) }
  catch { notFound() }

  const [canEdit, canDelete] = await Promise.all([
    hasPermission(Resource.ORDER, Action.UPDATE),
    hasPermission(Resource.ORDER, Action.DELETE),
  ])

  const items = order.items.map((i) => ({
    ...i,
    quantity:    i.quantity.toNumber(),
    unitPrice:   i.unitPrice.toNumber(),
    taxRate:     i.taxRate.toNumber(),
    netAmount:   i.netAmount.toNumber(),
    taxAmount:   i.taxAmount.toNumber(),
    grossAmount: i.grossAmount.toNumber(),
  }))

  const totalNet   = order.totalNet.toNumber()
  const totalGross = order.totalGross.toNumber()
  const fmt        = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div>
      <PageHeader
        title={order.orderNumber}
        description={order.title ?? undefined}
        breadcrumbs={[{ label: 'Aufträge', href: '/orders' }, { label: order.orderNumber }]}
        actions={
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {order.status === 'OPEN' && canEdit && (
              <Link href={`/orders/${order.id}/edit`}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors">
                Bearbeiten
              </Link>
            )}
          </div>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Main ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Customer + meta */}
            <div className="card-base p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-2">Kunde</p>
                  <Link href={`/customers/${order.customerId}`} className="font-600 text-sm text-blue-700 hover:underline">
                    {order.customer.name}
                  </Link>
                  {(order.customer.street || order.customer.city) && (
                    <address className="not-italic text-sm text-muted-foreground mt-1 leading-5">
                      {order.customer.street} {order.customer.houseNumber}<br />
                      {order.customer.postalCode} {order.customer.city}
                    </address>
                  )}
                </div>
                <div className="space-y-3">
                  <MetaItem label="Auftragsdatum"
                    value={format(new Date(order.orderDate), 'dd. MMMM yyyy', { locale: de })} />
                  {order.startDate && <MetaItem label="Start" value={format(new Date(order.startDate), 'dd.MM.yyyy', { locale: de })} />}
                  {order.endDate   && <MetaItem label="Ende"  value={format(new Date(order.endDate),   'dd.MM.yyyy', { locale: de })} />}
                  {order.completedAt && <MetaItem label="Abgeschlossen" value={format(new Date(order.completedAt), 'dd.MM.yyyy', { locale: de })} />}
                  {order.offer && (
                    <div>
                      <p className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Aus Angebot</p>
                      <Link href={`/offers/${order.offer.id}`} className="text-sm text-blue-700 hover:underline mono">
                        {order.offer.offerNumber}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              {order.description && (
                <div className="mt-4 pt-4 border-t border-stone-100">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{order.description}</p>
                </div>
              )}
            </div>

            {/* Items */}
            {items.length > 0 && (
              <div className="card-base overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100">
                  <h2 className="text-sm font-600">Positionen ({items.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-8">#</th>
                        <th>Beschreibung</th>
                        <th className="num text-right">Menge</th>
                        <th>Einh.</th>
                        <th className="num text-right">Einzelpr.</th>
                        <th className="num text-right">MwSt.</th>
                        <th className="num text-right">Brutto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.id}>
                          <td className="text-muted-foreground mono text-xs">{idx + 1}</td>
                          <td><p className="font-500 text-sm">{item.description}</p></td>
                          <td className="num text-right">{item.quantity.toLocaleString('de-DE')}</td>
                          <td className="text-sm">{item.unit}</td>
                          <td className="num text-right">{fmt(item.unitPrice)} €</td>
                          <td className="num text-right">{item.taxRate} %</td>
                          <td className="num text-right font-500">{fmt(item.grossAmount)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-stone-100 bg-stone-50/50 flex justify-end">
                  <div className="w-64 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Netto</span>
                      <span className="mono">{fmt(totalNet)} €</span>
                    </div>
                    <div className="flex justify-between font-600">
                      <span>Brutto gesamt</span>
                      <span className="mono">{fmt(totalGross)} €</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Service reports */}
            <div className="card-base overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
                <h2 className="text-sm font-600">
                  Leistungsnachweise ({order.serviceReports.length})
                </h2>
                <Link href={`/services/new?order=${order.id}`}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded border border-blue-200 bg-blue-50 text-blue-700 text-xs font-500 hover:bg-blue-100 transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                  Leistung erfassen
                </Link>
              </div>
              {order.serviceReports.length === 0 ? (
                <p className="text-sm text-muted-foreground p-5">Noch keine Leistungen erfasst.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nummer</th>
                      <th>Bezeichnung</th>
                      <th>Datum</th>
                      <th>Erfasst von</th>
                      <th className="num text-right">Positionen</th>
                      <th className="num text-right">Netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.serviceReports.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/services/${r.id}`} className="mono text-xs text-blue-700 hover:underline">
                            {r.reportNumber}
                          </Link>
                        </td>
                        <td className="text-sm">{r.title ?? <span className="text-muted-foreground italic">Kein Titel</span>}</td>
                        <td className="mono text-xs">
                          {format(new Date(r.reportDate), 'dd.MM.yyyy', { locale: de })}
                        </td>
                        <td className="text-sm text-muted-foreground">
                          {r.createdBy.firstName} {r.createdBy.lastName}
                        </td>
                        <td className="num text-right mono text-xs">{r._count.items}</td>
                        <td className="num text-right mono text-sm font-500">
                          {r.totalNet.toNumber().toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4">
            <div className="card-base p-4">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3">Workflow</p>
              <OrderStatusActions
                orderId={order.id}
                status={order.status as OrderStatus}
                orderNumber={order.orderNumber}
                canEdit={canEdit}
                canDelete={canDelete}
              />
            </div>
            <div className="card-base p-4 space-y-3">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Details</p>
              <MetaItem label="Auftragsnummer" value={order.orderNumber} mono />
              <MetaItem label="Angelegt von"
                value={`${order.createdBy.firstName} ${order.createdBy.lastName}`} />
              <MetaItem label="Angelegt am"
                value={format(new Date(order.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm text-foreground ${mono ? 'mono' : ''}`}>{value}</dd>
    </div>
  )
}
