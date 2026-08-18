// app/(dashboard)/offers/[id]/page.tsx
import type { Metadata }    from 'next'
import { notFound }         from 'next/navigation'
import Link                 from 'next/link'
import { PageHeader }       from '@/components/shared/PageHeader'
import { OfferStatusBadge } from '@/components/offers/OfferStatusBadge'
import { OfferStatusActions } from '@/components/offers/OfferStatusActions'
import { OfferRichText }      from '@/components/offers/OfferRichText'
import { getOfferById }     from '@/lib/services/offer.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { calcOfferTotals }  from '@/lib/validators/offer.schema'
import { format }           from 'date-fns'
import { de }               from 'date-fns/locale'
import type { OfferStatus } from '@/types/enums'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  await requirePermission(Resource.OFFER, Action.READ)

  try {
    const o = await getOfferById(id)
    return { title: o.offerNumber }
  } catch {
    return { title: 'Angebot' }
  }
}

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePermission(Resource.OFFER, Action.READ)

  let offer
  try {
    offer = await getOfferById(id)
  } catch {
    notFound()
  }

  const [canEdit, canCopy, canDelete, canConvert] = await Promise.all([
    hasPermission(Resource.OFFER, Action.UPDATE),
    hasPermission(Resource.OFFER, Action.CREATE),
    hasPermission(Resource.OFFER, Action.DELETE),
    hasPermission(Resource.ORDER, Action.CREATE),
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

  const isLocked  = offer.status !== 'DRAFT'
  const canEditNow = canEdit && !isLocked

  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div>
      <PageHeader
        title={offer.offerNumber}
        description={offer.title ?? undefined}
        breadcrumbs={[
          { label: 'Angebote', href: '/offers' },
          { label: offer.offerNumber },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <OfferStatusBadge status={offer.status} />
            <a
              href={`/api/offers/${offer.id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-blue-200 bg-blue-50 text-sm font-500 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m0 12.75h7.5m-7.5 3h4.5M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.625a9 9 0 00-9-9z" />
              </svg>
              PDF-Vorschau
            </a>
            {canCopy && (
              <Link
                href={`/offers/new?copy=${offer.id}`}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6A2.25 2.25 0 0110.5 3.75h6A2.25 2.25 0 0118.75 6v6A2.25 2.25 0 0116.5 14.25H15M6 8.25h6A2.25 2.25 0 0114.25 10.5v6A2.25 2.25 0 0112 18.75H6A2.25 2.25 0 013.75 16.5v-6A2.25 2.25 0 016 8.25z"/>
                </svg>
                Kopieren
              </Link>
            )}
            {canEditNow && (
              <Link
                href={`/offers/${offer.id}/edit`}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
                </svg>
                Bearbeiten
              </Link>
            )}
          </div>
        }
      />

      <div className="offer-standard-font p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Main content (2/3) ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Customer + dates */}
            <div className="card-base p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-2">Empfänger</p>
                  <Link
                    href={`/customers/${offer.customerId}`}
                    className="font-600 text-sm text-blue-700 hover:underline"
                  >
                    {offer.customer.name}
                  </Link>
                  {(offer.customer.street || offer.customer.city) && (
                    <address className="not-italic text-sm text-muted-foreground mt-1 leading-5">
                      {offer.customer.street} {offer.customer.houseNumber}<br />
                      {offer.customer.postalCode} {offer.customer.city}
                    </address>
                  )}
                  {offer.customer.vatId && (
                    <p className="text-xs text-muted-foreground mono mt-1">{offer.customer.vatId}</p>
                  )}
                </div>
                <div className="space-y-3">
                  <MetaItem label="Angebotsdatum"
                    value={format(new Date(offer.offerDate), 'dd. MMMM yyyy', { locale: de })} />
                  {offer.validUntil && (
                    <MetaItem label="Gültig bis"
                      value={format(new Date(offer.validUntil), 'dd. MMMM yyyy', { locale: de })} />
                  )}
                  {offer.sentAt && (
                    <MetaItem label="Versendet am"
                      value={format(new Date(offer.sentAt), 'dd.MM.yyyy HH:mm', { locale: de })} />
                  )}
                  {offer.acceptedAt && (
                    <MetaItem label="Angenommen am"
                      value={format(new Date(offer.acceptedAt), 'dd.MM.yyyy', { locale: de })} />
                  )}
                </div>
              </div>
            </div>

            {/* Intro text */}
            {offer.introText && (
              <div className="card-base p-5">
                <OfferRichText value={offer.introText} />
              </div>
            )}

            {/* Items table */}
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
            </div>

            {/* Outro text */}
            {offer.outroText && (
              <div className="card-base p-5">
                <OfferRichText value={offer.outroText} />
              </div>
            )}

            {/* Linked order */}
            {offer.order && (
              <div className="card-base p-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-violet-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
                </svg>
                <div>
                  <p className="text-sm text-muted-foreground">Umgewandelt in Auftrag</p>
                  <Link
                    href={`/orders/${offer.order.id}`}
                    className="text-sm font-600 text-blue-700 hover:underline mono"
                  >
                    {offer.order.orderNumber}
                  </Link>
                </div>
              </div>
            )}

          </div>

          {/* ── Sidebar (1/3) ── */}
          <div className="space-y-4">

            {/* Status workflow */}
            <div className="card-base p-4">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3">
                Workflow
              </p>
              <OfferStatusActions
                offerId={offer.id}
                status={offer.status as OfferStatus}
                totalGross={totalGross}
                offerNumber={offer.offerNumber}
                canEdit={canEdit}
                canDelete={canDelete}
                canConvert={canConvert}
              />
            </div>

            {/* Meta */}
            <div className="card-base p-4 space-y-3">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">
                Details
              </p>
              <MetaItem label="Angebotsnummer" value={offer.offerNumber} mono />
              <MetaItem label="Angelegt von"
                value={`${offer.createdBy.firstName} ${offer.createdBy.lastName}`} />
              <MetaItem label="Angelegt am"
                value={format(new Date(offer.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })} />
              {offer.status === 'DRAFT' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Entwurf — noch nicht versendet
                </p>
              )}
            </div>

          </div>
        </div>
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
