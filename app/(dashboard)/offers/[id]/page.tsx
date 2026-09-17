// app/(dashboard)/offers/[id]/page.tsx
import type { Metadata }    from 'next'
import { notFound }         from 'next/navigation'
import Link                 from 'next/link'
import { OfferStatusActions } from '@/components/offers/OfferStatusActions'
import { OfferRichText }      from '@/components/offers/OfferRichText'
import { getOfferById }     from '@/lib/services/offer.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { format }           from 'date-fns'
import { de }               from 'date-fns/locale'
import type { OfferStatus } from '@/types/enums'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'
import { getSupplierNumber } from '@/lib/services/settings.service'
import { BusinessDocumentLayout, BusinessDocumentSidebar, BusinessWorkflowPlaceholder } from '@/components/documents/BusinessDocumentLayout'
import { BusinessDocumentHeader } from '@/components/documents/BusinessDocumentHeader'
import { DocumentSectionCard } from '@/components/documents/DocumentSectionCard'
import { offerNumberForDisplay } from '@/lib/offers/offer-display'
import { CustomerPurchaseOrderDialog } from '@/components/offers/CustomerPurchaseOrderDialog'
import { getBusinessProcessForOffer } from '@/lib/services/business-process.service'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  await requirePermission(Resource.OFFER, Action.READ)

  try {
    const o = await getOfferById(id)
    return { title: offerNumberForDisplay(o.offerNumber) }
  } catch {
    return { title: 'Angebot' }
  }
}

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePermission(Resource.OFFER, Action.READ)

  let offer
  try {
    offer = await getOfferById(id)
  } catch {
    notFound()
  }

  const [canEdit, canDelete, canConvert, canCopy, process] = await Promise.all([
    hasPermission(Resource.OFFER, Action.UPDATE),
    hasPermission(Resource.OFFER, Action.DELETE),
    hasPermission(Resource.ORDER, Action.CREATE),
    hasPermission(Resource.OFFER, Action.CREATE),
    getBusinessProcessForOffer(id, user.userId, user.role),
  ])

  // Compute per-item amts and totals from stored values
  const items = offer.items.map((item) => ({
    ...item,
    netAmount:   item.netAmount.toNumber(),
    taxAmount:   item.taxAmount.toNumber(),
    grossAmount: item.grossAmount.toNumber(),
    unitPrice:   item.unitPrice.toNumber(),
    quantity:    item.quantity.toNumber(),
    taxRate:     item.taxRate.toNumber(),
  }))

  // Tax breakdown
  const taxGroups: Record<string, number> = {}
  for (const item of items) {
    const k = String(item.taxRate)
    taxGroups[k] = Math.round(((taxGroups[k] ?? 0) + item.taxAmount) * 100) / 100
  }
  const totalNet   = offer.totalNet.toNumber()
  const totalTax   = offer.totalTax.toNumber()
  const totalGross = offer.totalGross.toNumber()

  const supplierNumber = await getSupplierNumber()

  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const purchaseOrder = process.customerPurchaseOrder
  const showPurchaseOrderSection = ['SENT', 'ACCEPTED', 'CONVERTED_TO_ORDER'].includes(offer.status)

  return (
    <div>
      <BusinessDocumentHeader
        title={offerNumberForDisplay(offer.offerNumber)}
        description={offer.title}
        titleId="offer-detail-title"
        detailsLabel="Kunden- und Auftragsdaten"
      >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="sm:col-span-2 xl:col-span-1 xl:row-span-2">
                <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Kunde</dt>
                <dd className="mt-0.5">
                  <Link href={`/customers/${offer.customerId}`} className="text-sm font-600 text-blue-700 hover:underline">
                    {offer.customer.name}
                  </Link>
                  {(offer.customer.street || offer.customer.city) && (
                    <address className="mt-3 text-sm not-italic leading-5 text-muted-foreground">
                      {offer.customer.street} {offer.customer.houseNumber}<br />
                      {offer.customer.postalCode} {offer.customer.city}
                    </address>
                  )}
                  {offer.customer.vatId && <p className="mt-1 text-xs text-muted-foreground mono">{offer.customer.vatId}</p>}
                </dd>
              </div>

              <MetaItem label="Angebotsdatum"
                value={format(new Date(offer.offerDate), 'dd. MMMM yyyy', { locale: de })} />
              {offer.validUntil && <MetaItem label="Gültig bis"
                value={format(new Date(offer.validUntil), 'dd. MMMM yyyy', { locale: de })} />}
              {offer.sentAt && <MetaItem label="Versendet am"
                value={format(new Date(offer.sentAt), 'dd.MM.yyyy HH:mm', { locale: de })} />}
              {offer.acceptedAt && <div className="xl:col-start-4 xl:row-start-2">
                <MetaItem label="Angenommen am"
                  value={format(new Date(offer.acceptedAt), 'dd.MM.yyyy', { locale: de })} />
              </div>}
              {offer.order && <div className="xl:col-start-2 xl:row-start-2">
                <MetaItem label="Auftragsdatum"
                  value={format(new Date(offer.order.orderDate), 'dd. MMMM yyyy', { locale: de })} />
              </div>}
              {offer.order?.completedAt && <div className="xl:col-start-3 xl:row-start-2">
                <MetaItem label="Abgeschlossen"
                  value={format(new Date(offer.order.completedAt), 'dd.MM.yyyy', { locale: de })} />
              </div>}
            </dl>
      </BusinessDocumentHeader>

      <div className="offer-standard-font p-6">
        <BusinessDocumentLayout>

          {/* ── Main content (2/3) ── */}
          <div className="min-w-0 space-y-4">

            {/* Intro text */}
            {offer.introText && (
              <DocumentSectionCard title="Thema und Beschreibung">
                <OfferRichText value={offer.introText} />
              </DocumentSectionCard>
            )}

            {/* Items table */}
            <DocumentSectionCard title={`Positionen (${items.length})`} flush>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th>Beschreibung</th>
                      <th className="num text-right">Menge</th>
                      <th>Einheit</th>
                      <th className="num text-right">Einzelpreis</th>
                      <th className="num text-right">MwSt.</th>
                      <th className="num text-right">Netto</th>
                      <th className="num text-right">Brutto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="text-muted-foreground text-xs tabular-nums">{idx + 1}</td>
                        <td>
                          <p className="font-500 text-sm text-foreground">{item.description}</p>
                          {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                        </td>
                        <td className="num text-right">{item.quantity.toLocaleString('de-DE')}</td>
                        <td className="text-sm">{item.unit}</td>
                        <td className="num text-right">{fmt(item.unitPrice)} €</td>
                        <td className="num text-right">{item.taxRate} %</td>
                        <td className="num text-right">{fmt(item.netAmount)} €</td>
                        <td className="num text-right font-500">{fmt(item.grossAmount)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="px-5 py-4 border-t border-stone-100 bg-stone-50/50">
                <div className="flex justify-end">
                  <div className="w-72 space-y-1.5">
                    <TotRow label="Nettobetrag"  value={`${fmt(totalNet)} €`} />
                    {Object.entries(taxGroups)
                      .filter(([, v]) => v > 0)
                      .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
                      .map(([rate, amount]) => (
                        <TotRow key={rate} label={`zzgl. ${rate}% MwSt.`} value={`${fmt(amount)} €`} muted />
                      ))}
                    <div className="border-t border-stone-200 pt-1.5 mt-1.5">
                      <TotRow label="Bruttobetrag" value={`${fmt(totalGross)} €`} bold />
                    </div>
                  </div>
                </div>
              </div>
            </DocumentSectionCard>

            {/* Outro text */}
            {offer.outroText && (
              <DocumentSectionCard title="Ergänzende Informationen">
                <OfferRichText value={offer.outroText} />
              </DocumentSectionCard>
            )}

          </div>

          {/* ── Sidebar (1/3) ── */}
          <BusinessDocumentSidebar sticky>
            <BusinessWorkflowPlaceholder message="Der vollständige Geschäftsvorgang-Workflow steht an dieser Stelle noch nicht zur Verfügung.">
              <p className="mb-3 text-sm font-600 text-foreground">Status: {offer.status}</p>
              {canCopy && (
                <Link href={`/offers/new?copy=${offer.id}`} className="mb-3 inline-block text-sm text-blue-700 hover:underline">Als Vorlage kopieren</Link>
              )}
              <OfferStatusActions
                offerId={offer.id}
                status={offer.status as OfferStatus}
                totalGross={totalGross}
                offerNumber={offer.offerNumber}
                canEdit={canEdit}
                canDelete={canDelete && isTestDeleteEnabled()}
                canConvert={canConvert}
              />
              {showPurchaseOrderSection && (
                <div className="mt-4 border-t border-stone-200 pt-4">
                  <p className="mb-2 text-xs font-600 uppercase tracking-wider text-muted-foreground">Kundenbestellung</p>
                  {purchaseOrder?.documents.length ? (
                    <div className="space-y-2 text-xs">
                      {purchaseOrder.orderNumber && <p><span className="text-muted-foreground">Bestellnummer:</span> {purchaseOrder.orderNumber}</p>}
                      {purchaseOrder.orderDate && <p><span className="text-muted-foreground">Bestelldatum:</span> {format(new Date(purchaseOrder.orderDate), 'dd.MM.yyyy', { locale: de })}</p>}
                      {purchaseOrder.documents.map(document => (
                        <div key={document.id} className="rounded border border-stone-200 bg-stone-50 p-2">
                          <p className="break-all font-500">{document.originalName}</p>
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            <a className="rounded border border-stone-200 bg-white px-2 py-1.5 text-center text-blue-700" href={`/api/documents/${document.id}/download?disposition=inline`} target="_blank" rel="noreferrer">Öffnen</a>
                            <a className="rounded border border-stone-200 bg-white px-2 py-1.5 text-center text-blue-700" href={`/api/documents/${document.id}/download`}>Download</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-800">Noch nicht hinterlegt</p>
                  )}
                  {canEdit && ['ACCEPTED', 'CONVERTED_TO_ORDER'].includes(offer.status) && (
                    <div className="mt-3">
                      <CustomerPurchaseOrderDialog
                        offerId={offer.id}
                        mode="add"
                        trigger={<button type="button" className="min-h-9 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-500 text-blue-700 hover:bg-stone-50">{purchaseOrder?.documents.length ? 'Weitere Anlage hinzufügen' : 'Bestellung hinzufügen'}</button>}
                      />
                    </div>
                  )}
                </div>
              )}
            </BusinessWorkflowPlaceholder>

            {/* Meta */}
            <div className="card-base p-4 space-y-3">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">
                Details
              </p>
              <MetaItem label="Angebotsnummer" value={offerNumberForDisplay(offer.offerNumber)} mono />
              <MetaItem label="Angelegt von"
                value={`${offer.createdBy.firstName} ${offer.createdBy.lastName}`} />
              <MetaItem label="Angelegt am"
                value={format(new Date(offer.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })} />
              <MetaItem label="Letzte Änderung"
                value={format(new Date(offer.updatedAt), 'dd.MM.yyyy HH:mm', { locale: de })} />
              {supplierNumber && <MetaItem label="Lieferantennummer" value={supplierNumber} mono />}
              {offer.status === 'DRAFT' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Entwurf — noch nicht versendet
                </p>
              )}
            </div>

          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm text-foreground ${mono ? 'mono' : ''}`}>{value}</dd>
    </div>
  )
}

function TotRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className={`text-sm ${muted ? 'text-muted-foreground' : bold ? 'font-600' : ''}`}>{label}</span>
      <span className={`mono text-sm tabular-nums ${bold ? 'font-600' : ''}`}>{value}</span>
    </div>
  )
}
