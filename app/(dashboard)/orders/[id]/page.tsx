// app/(dashboard)/orders/[id]/page.tsx
import type { Metadata }      from 'next'
import { notFound }           from 'next/navigation'
import Link                   from 'next/link'
import { OrderStatusActions } from '@/components/orders/OrderStatusActions'
import { getOrderById }       from '@/lib/services/order.service'
import { hasPermission, Resource, Action } from '@/lib/auth/permissions'
import { format } from 'date-fns'
import { de }     from 'date-fns/locale'
import type { OrderStatus } from '@/types/enums'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'
import { OfferRichText } from '@/components/offers/OfferRichText'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForOrder } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'
import { requirePermission } from '@/lib/auth/permissions'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { BusinessDocumentHeader } from '@/components/documents/BusinessDocumentHeader'
import { DocumentSectionCard } from '@/components/documents/DocumentSectionCard'
import { orderDescriptionWithOfferFallback, splitOfferTextAtPositions } from '@/lib/offers/rich-text'
import { OrderContentCardActions } from '@/components/orders/OrderContentCardActions'
import { ProjectAssignmentAction } from '@/components/workflow/ProjectAssignmentAction'
import { listProjectsForCustomer } from '@/lib/services/project.service'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  await requirePermission(Resource.ORDER, Action.READ)
  try { const o = await getOrderById(id); return { title: o.orderNumber } }
  catch { return { title: 'Auftrag' } }
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePermission(Resource.ORDER, Action.READ)
  let order
  try { order = await getOrderById(id) }
  catch { notFound() }

  const [canEdit, canDelete, canManageProject, process, processPermissions] = await Promise.all([
    hasPermission(Resource.ORDER, Action.UPDATE),
    hasPermission(Resource.ORDER, Action.DELETE),
    hasPermission(Resource.PROJECT, Action.CREATE),
    getBusinessProcessForOrder(id, user.userId, user.role),
    getBusinessProcessPermissions(),
  ])
  const availableProjects = canManageProject && !process.project ? await listProjectsForCustomer(order.customerId) : []

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
  const content = splitOfferTextAtPositions(orderDescriptionWithOfferFallback(
    order.description,
    order.offer,
    items.length > 0,
  ))

  return (
    <div>
      <BusinessDocumentHeader
        title={order.orderNumber}
        description={order.title}
        titleId="order-detail-title"
        detailsLabel="Kunden- und Auftragsdaten"
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2 xl:col-span-1 xl:row-span-2">
            <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Kunde</dt>
            <dd className="mt-0.5">
              <Link href={`/customers/${order.customerId}`} className="text-sm font-600 text-blue-700 hover:underline">
                {order.customer.name}
              </Link>
              {(order.customer.street || order.customer.city) && (
                <address className="mt-3 text-sm not-italic leading-5 text-muted-foreground">
                  {order.customer.street} {order.customer.houseNumber}<br />
                  {order.customer.postalCode} {order.customer.city}
                </address>
              )}
            </dd>
          </div>
          <MetaItem label="Auftragsdatum"
            value={format(new Date(order.orderDate), 'dd. MMMM yyyy', { locale: de })} />
          {order.offer && (
            <div>
              <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Angebotsbezug</dt>
              <dd className="mt-0.5">
                <Link href={`/offers/${order.offer.id}`} className="text-sm text-blue-700 hover:underline mono">
                  {order.offer.offerNumber}
                </Link>
              </dd>
            </div>
          )}
          {order.startDate && <MetaItem label="Geplanter Start" value={format(new Date(order.startDate), 'dd.MM.yyyy', { locale: de })} />}
          {order.endDate && <MetaItem label="Geplantes Ende" value={format(new Date(order.endDate), 'dd.MM.yyyy', { locale: de })} />}
          {order.completedAt && <MetaItem label="Abgeschlossen am" value={format(new Date(order.completedAt), 'dd.MM.yyyy', { locale: de })} />}
        </dl>
      </BusinessDocumentHeader>

      <div className="p-4 sm:p-6">
        <BusinessDocumentLayout>

          {/* ── Main ── */}
          <div className="min-w-0 space-y-4">
            {content.before && (
              <DocumentSectionCard
                title="Thema und Beschreibung"
                actions={order.status === 'OPEN' && canEdit ? <OrderContentCardActions orderId={order.id} card="descriptionBefore" /> : undefined}
              >
                <OfferRichText value={content.before} />
              </DocumentSectionCard>
            )}

            {/* Items */}
            {content.positionsEnabled && items.length > 0 && (
              <DocumentSectionCard
                title={`Positionen (${items.length})`}
                actions={order.status === 'OPEN' && canEdit ? <OrderContentCardActions orderId={order.id} card="positions" /> : undefined}
                flush
              >
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
                <div className="flex justify-end border-t border-stone-200 bg-stone-50/50 px-3 py-3">
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
              </DocumentSectionCard>
            )}

            {content.after && (
              <DocumentSectionCard
                title="Weitere Angebotsinhalte"
                actions={order.status === 'OPEN' && canEdit ? <OrderContentCardActions orderId={order.id} card="descriptionAfter" /> : undefined}
              >
                <OfferRichText value={content.after} />
              </DocumentSectionCard>
            )}
          </div>

          {/* ── Sidebar ── */}
          <BusinessDocumentSidebar sticky>
            <BusinessProcessWorkflow
              process={process}
              currentDocument={{ type: 'order', id: order.id }}
              activeStage="order"
              permissions={processPermissions}
              projectAction={canManageProject
                ? <ProjectAssignmentAction kind="order" targetId={order.id} customerId={order.customerId} suggestedName={order.title ?? order.orderNumber} projects={availableProjects} />
                : undefined}
              orderAction={<OrderStatusActions
                orderId={order.id}
                status={order.status as OrderStatus}
                orderNumber={order.orderNumber}
                canEdit={canEdit}
                canDelete={canDelete && isTestDeleteEnabled()}
              />}
            />
            <div className="card-base p-4 space-y-3">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Details</p>
              <MetaItem label="Angelegt von"
                value={`${order.createdBy.firstName} ${order.createdBy.lastName}`} />
              <MetaItem label="Angelegt am"
                value={format(new Date(order.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })} />
            </div>
          </BusinessDocumentSidebar>

        </BusinessDocumentLayout>
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
