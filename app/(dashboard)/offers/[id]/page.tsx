// app/(dashboard)/offers/[id]/page.tsx
import type { Metadata }    from 'next'
import { notFound }         from 'next/navigation'
import { OfferConvertAction, OfferStatusActions } from '@/components/offers/OfferStatusActions'
import { OfferRichText }      from '@/components/offers/OfferRichText'
import { getOfferById }     from '@/lib/services/offer.service'
import { hasPermission, requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import type { OfferStatus } from '@/types/enums'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'
import { getSupplierNumber } from '@/lib/services/settings.service'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForOffer } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { BusinessDocumentHeader } from '@/components/documents/BusinessDocumentHeader'
import { DocumentSectionCard } from '@/components/documents/DocumentSectionCard'
import { BusinessDocumentMeta } from '@/components/documents/BusinessDocumentMeta'
import { buildBusinessDocumentHeader } from '@/lib/workflow/document-header'
import { getHeaderPermissions } from '@/lib/workflow/document-header-permissions'
import { offerNumberForDisplay } from '@/lib/offers/offer-display'
import { CustomerPurchaseOrderDialog } from '@/components/offers/CustomerPurchaseOrderDialog'
import { ProjectAssignmentAction } from '@/components/workflow/ProjectAssignmentAction'
import { listProjectsForCustomer } from '@/lib/services/project.service'
import { formatBerlinDate, formatBerlinDateTime } from '@/lib/utils/berlin-date'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  await requirePagePermission(Resource.OFFER, Action.READ)

  try {
    const o = await getOfferById(id)
    return { title: offerNumberForDisplay(o.offerNumber) }
  } catch {
    return { title: 'Angebot' }
  }
}

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePagePermission(Resource.OFFER, Action.READ)

  let offer
  try {
    offer = await getOfferById(id)
  } catch {
    notFound()
  }

  const [canEdit, canDelete, canConvert, canCopy, canManageProject, process, processPermissions] = await Promise.all([
    hasPermission(Resource.OFFER, Action.UPDATE),
    hasPermission(Resource.OFFER, Action.DELETE),
    hasPermission(Resource.ORDER, Action.CREATE),
    hasPermission(Resource.OFFER, Action.CREATE),
    hasPermission(Resource.PROJECT, Action.CREATE),
    getBusinessProcessForOffer(id, user.userId, user.role),
    getBusinessProcessPermissions(),
  ])
  const availableProjects = canManageProject && !process.project ? await listProjectsForCustomer(offer.customerId) : []
  const headerModel = buildBusinessDocumentHeader({
    current: 'offer',
    customer: offer.customer,
    process,
    permissions: await getHeaderPermissions(processPermissions),
    dates: [
      { label: 'Angebotsdatum', value: offer.offerDate, pattern: 'dd. MMMM yyyy' },
      { label: 'Gültig bis', value: offer.validUntil, pattern: 'dd. MMMM yyyy' },
      { label: 'Versendet am', value: offer.sentAt, pattern: 'dd.MM.yyyy HH:mm', kind: 'instant' },
      { label: 'Angenommen am', value: offer.acceptedAt, kind: 'instant' },
      { label: 'Auftragsdatum', value: offer.order?.orderDate, pattern: 'dd. MMMM yyyy' },
      { label: 'Abgeschlossen', value: offer.order?.completedAt, kind: 'instant' },
    ],
  })

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

  return (
    <div>
      <BusinessDocumentHeader
        title={offerNumberForDisplay(offer.offerNumber)}
        description={offer.title}
        titleId="offer-detail-title"
        detailsLabel="Kunden- und Auftragsdaten"
      >
            <BusinessDocumentMeta model={headerModel} />
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
            <BusinessProcessWorkflow
              process={process}
              currentDocument={{ type: 'offer', id: offer.id }}
              permissions={processPermissions}
              offerCopyHref={canCopy ? `/offers/new?copy=${offer.id}` : undefined}
              projectAction={canManageProject
                ? <ProjectAssignmentAction kind="offer" targetId={offer.id} customerId={offer.customerId} suggestedName={offer.title ?? offer.offerNumber} projects={availableProjects} />
                : undefined}
              customerPurchaseOrderAction={canEdit && ['ACCEPTED', 'CONVERTED_TO_ORDER'].includes(offer.status)
                ? <CustomerPurchaseOrderDialog
                    offerId={offer.id}
                    mode="add"
                    trigger={<button type="button" className="min-h-9 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-500 text-blue-700 hover:bg-stone-50">{process.customerPurchaseOrder?.documents.length ? 'Weitere Anlage hinzufügen' : 'Bestellung hinzufügen'}</button>}
                  />
                : undefined}
              orderAction={offer.status === 'ACCEPTED' && canConvert
                ? <OfferConvertAction offerId={offer.id} offerNumber={offer.offerNumber} totalGross={totalGross} />
                : undefined}
              offerLifecycle={{
                status: offer.status,
                sentDate: offer.sentAt ? formatBerlinDate(offer.sentAt) : undefined,
                actions: (
                  <OfferStatusActions
                    offerId={offer.id}
                    status={offer.status as OfferStatus}
                    totalGross={totalGross}
                    offerNumber={offer.offerNumber}
                    canEdit={canEdit}
                    canDelete={canDelete && isTestDeleteEnabled()}
                    canConvert={canConvert}
                    showConversion={false}
                    compactDecision
                  />
                ),
              }}
            />

            {/* Meta */}
            <div className="card-base p-4 space-y-3">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">
                Details
              </p>
              <MetaItem label="Angebotsnummer" value={offerNumberForDisplay(offer.offerNumber)} mono />
              <MetaItem label="Angelegt von"
                value={`${offer.createdBy.firstName} ${offer.createdBy.lastName}`} />
              <MetaItem label="Angelegt am"
                value={formatBerlinDateTime(offer.createdAt)} />
              <MetaItem label="Letzte Änderung"
                value={formatBerlinDateTime(offer.updatedAt)} />
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
