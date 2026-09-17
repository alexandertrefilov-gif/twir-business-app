// app/(dashboard)/invoices/[id]/page.tsx — FIXED
// Entfernt: ungültige 'use server' inline-Funktion (addPaymentBound)
// addPaymentAction aus Phase 7 wird direkt als prop übergeben — kein Wrapper nötig.
// [Differenz zu Phase 9: Zeilen 88-96 entfernt, addPaymentAction direkt übergeben]

import type { Metadata }      from 'next'
import { notFound }           from 'next/navigation'
import Link                   from 'next/link'
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge'
import { InvoiceActions }     from '@/components/invoices/InvoiceActions'
import { PaymentForm }        from '@/components/payments/PaymentForm'
import { PaymentJournal }     from '@/components/payments/PaymentJournal'
import { DunningPanel }       from '@/components/payments/DunningPanel'
import {
  getInvoiceById,
  getInvoicePayments,
} from '@/lib/services/invoice-query.service'
import { getDunningNoticesForInvoice } from '@/lib/services/dunning.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { InvoiceStatus, INVOICE_TYPE_LABELS } from '@/types/enums'
import { addPaymentAction }   from '@/app/(dashboard)/payments/actions'
import { format }             from 'date-fns'
import { de }                 from 'date-fns/locale'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'
import { getSupplierNumber } from '@/lib/services/settings.service'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForInvoice } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { BusinessDocumentHeader } from '@/components/documents/BusinessDocumentHeader'
import { DocumentSectionCard } from '@/components/documents/DocumentSectionCard'
import { OfferRichText } from '@/components/offers/OfferRichText'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  await requirePermission(Resource.INVOICE, Action.READ)

  try {
    const inv = await getInvoiceById(id)
    return { title: inv.invoiceNumber ?? 'Rechnungsentwurf' }
  } catch { return { title: 'Rechnung' } }
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePermission(Resource.INVOICE, Action.READ)

  let invoice
  try { invoice = await getInvoiceById(id) }
  catch { notFound() }

  const [
    canEdit,
    canDelete,
    canFinalize,
    canCancel,
    canCreatePayment,
    canReadPayments,
    canManageDunning,
    process,
    processPermissions,
  ] = await Promise.all([
    hasPermission(Resource.INVOICE, Action.UPDATE),
    hasPermission(Resource.INVOICE, Action.DELETE),
    hasPermission(Resource.INVOICE, Action.FINALIZE),
    hasPermission(Resource.INVOICE, Action.CANCEL),
    hasPermission(Resource.PAYMENT, Action.CREATE),
    hasPermission(Resource.PAYMENT, Action.READ),
    hasPermission(Resource.INVOICE, Action.UPDATE),
    getBusinessProcessForInvoice(id, user.userId, user.role, {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      type: invoice.type,
      orderId: invoice.orderId,
    }),
    getBusinessProcessPermissions(),
  ])

  const paymentRecords = canReadPayments
    ? await getInvoicePayments(invoice.id)
    : []

  let dunningNotices: Awaited<ReturnType<typeof getDunningNoticesForInvoice>> = []
  if (canManageDunning) {
    try { dunningNotices = await getDunningNoticesForInvoice(invoice.id) }
    catch { /* dunning table may not exist pre-migration */ }
  }

  const totalGross = invoice.totalGross.toNumber()
  const paidAmount = invoice.paidAmount.toNumber()
  const remaining  = Math.round((totalGross - paidAmount) * 100) / 100

  const items = invoice.items.map((item) => ({
    ...item,
    quantity:    item.quantity.toNumber(),
    unitPrice:   item.unitPrice.toNumber(),
    taxRate:     item.taxRate.toNumber(),
    netAmount:   item.netAmount.toNumber(),
    taxAmount:   item.taxAmount.toNumber(),
    grossAmount: item.grossAmount.toNumber(),
  }))

  const taxGroups: Record<string, number> = {}
  for (const item of items) {
    const k = String(item.taxRate)
    taxGroups[k] = Math.round(((taxGroups[k] ?? 0) + item.taxAmount) * 100) / 100
  }

  const payments = paymentRecords.map((p) => ({
    id: p.id, amount: p.amount.toNumber(), paymentDate: p.paymentDate,
    method: p.method, reference: p.reference, notes: p.notes, createdAt: p.createdAt,
  }))

  const fmt  = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtD = (d: Date) => format(new Date(d), 'dd. MMMM yyyy', { locale: de })
  const cs   = invoice.customerSnapshot as Record<string, any> | null
  const cmp  = invoice.companySnapshot  as Record<string, any> | null
  const supplierNumber = invoice.status === InvoiceStatus.DRAFT
    ? await getSupplierNumber()
    : typeof cmp?.supplierNumber === 'string'
      ? cmp.supplierNumber
      : null
  const canAddPayment = canCreatePayment && remaining > 0 &&
    !['DRAFT', 'PAID', 'CANCELLED'].includes(invoice.status)

  return (
    <div>
      <BusinessDocumentHeader
        title={invoice.invoiceNumber ?? 'Rechnungsentwurf'}
        description={invoice.order
          ? `Auftrag ${invoice.order.orderNumber}${invoice.order.title ? ` · ${invoice.order.title}` : ''}`
          : undefined}
        titleId="invoice-detail-title"
        detailsLabel="Kunden- und Rechnungsdaten"
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2 xl:col-span-1 xl:row-span-2">
            <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Kunde</dt>
            <dd className="mt-0.5">
              <Link href={`/customers/${invoice.customerId}`} className="text-sm font-600 text-blue-700 hover:underline">
                {cs?.name ?? invoice.customer.name}
              </Link>
              {(cs?.street || cs?.city) && (
                <address className="mt-3 text-sm not-italic leading-5 text-muted-foreground">
                  {cs.street} {cs.houseNumber}<br />
                  {cs.postalCode} {cs.city}
                </address>
              )}
            </dd>
          </div>
          <HeaderReference
            label="Angebot"
            value={invoice.order?.offer?.offerNumber}
            href={invoice.order?.offer ? `/offers/${invoice.order.offer.id}` : undefined}
            canLink={processPermissions.readOffer}
          />
          <HeaderReference
            label="Auftrag"
            value={invoice.order?.orderNumber}
            href={invoice.order ? `/orders/${invoice.order.id}` : undefined}
            canLink={processPermissions.readOrder}
          />
          <HeaderReference
            label="Leistungsnachweis"
            value={invoice.order?.serviceReports[0]?.reportNumber}
            href={invoice.order?.serviceReports[0] ? `/services/${invoice.order.serviceReports[0].id}` : undefined}
            canLink={processPermissions.readServiceReport}
          />
          <HeaderReference label="Rechnung" value={invoice.invoiceNumber ?? 'Entwurf'} />
          {supplierNumber && <HeaderValue label="Lieferantennummer" value={supplierNumber} />}
          <HeaderValue label="Rechnungsdatum" value={fmtD(invoice.invoiceDate)} />
          {invoice.dueDate && <HeaderValue label="Zahlungsziel" value={fmtD(invoice.dueDate)} />}
          <div>
            <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Status</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <InvoiceStatusBadge status={invoice.status} />
              {invoice.type !== 'STANDARD' && (
                <span className="rounded border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs text-muted-foreground mono">
                  {INVOICE_TYPE_LABELS[invoice.type as keyof typeof INVOICE_TYPE_LABELS] ?? invoice.type}
                </span>
              )}
            </dd>
          </div>
          {invoice.finalizedAt && (
            <HeaderValue label="Finalisiert am" value={format(new Date(invoice.finalizedAt), 'dd.MM.yyyy HH:mm', { locale: de })} />
          )}
          {invoice.sentAt && (
            <HeaderValue label="Versendet am" value={format(new Date(invoice.sentAt), 'dd.MM.yyyy', { locale: de })} />
          )}
        </dl>
      </BusinessDocumentHeader>

      <div className="p-6">
        <BusinessDocumentLayout>
          <div className="min-w-0 space-y-4">

            <DocumentSectionCard title="Rechnungsparteien">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Rechnungsadresse</p>
                  {cs ? (
                    <div className="text-sm">
                      <p className="font-600">{cs.name}</p>
                      {cs.additional && <p className="text-xs text-muted-foreground">{cs.additional}</p>}
                      {cs.contactName && <p className="text-xs text-muted-foreground">{cs.contactName}</p>}
                      {cs.email && <p className="text-xs text-muted-foreground">{cs.email}</p>}
                      {cs.vatId && <p className="text-xs text-muted-foreground mono">USt-ID: {cs.vatId}</p>}
                      {(cs.street || cs.city) && (
                        <address className="mt-1 text-xs not-italic leading-5 text-muted-foreground">
                          {cs.street} {cs.houseNumber}<br />{cs.postalCode} {cs.city}
                          {cs.country && cs.country !== 'DE' && <><br />{cs.country}</>}
                        </address>
                      )}
                    </div>
                  ) : (
                    <Link href={`/customers/${invoice.customerId}`}
                      className="font-600 text-sm text-blue-700 hover:underline">
                      {invoice.customer.name}
                    </Link>
                  )}
                </div>
                {cmp && (
                  <div>
                    <p className="mb-2 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Rechnungssteller</p>
                    <div className="space-y-1 text-sm">
                      <p className="font-600">{cmp.companyName}{cmp.legalForm ? ` ${cmp.legalForm}` : ''}</p>
                      {cmp.vatId && <p className="text-xs text-muted-foreground"><span className="font-500">USt-Id:</span> <span className="mono">{cmp.vatId}</span></p>}
                      {cmp.iban && <p className="text-xs text-muted-foreground"><span className="font-500">IBAN:</span> <span className="mono">{cmp.iban}</span></p>}
                    </div>
                  </div>
                )}
              </div>
            </DocumentSectionCard>

            {invoice.introText && (
              <DocumentSectionCard title="Leistungsbeschreibung / Abrechnungstext">
                <OfferRichText value={invoice.introText} />
              </DocumentSectionCard>
            )}

            {/* Items */}
            <DocumentSectionCard title={`Positionen (${items.length})`} flush>
              {items.length === 0
                ? <p className="p-5 text-sm text-muted-foreground">Noch keine Positionen.</p>
                : <>
                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th className="w-8">#</th><th>Beschreibung</th>
                            <th className="num text-right">Menge</th><th>Einh.</th>
                            <th className="num text-right">Einzelpr.</th>
                            <th className="num text-right">MwSt.</th>
                            <th className="num text-right">Netto</th>
                            <th className="num text-right">Brutto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, idx) => (
                            <tr key={item.id}>
                              <td className="mono text-xs text-muted-foreground">{idx+1}</td>
                              <td><p className="font-500 text-sm">{item.description}</p></td>
                              <td className="num text-right mono text-sm">{item.quantity.toLocaleString('de-DE')}</td>
                              <td className="text-sm">{item.unit}</td>
                              <td className="num text-right mono text-sm">{fmt(item.unitPrice)} €</td>
                              <td className="num text-right mono text-sm">{item.taxRate} %</td>
                              <td className="num text-right mono text-sm">{fmt(item.netAmount)} €</td>
                              <td className="num text-right mono text-sm font-500">{fmt(item.grossAmount)} €</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-5 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end">
                      <div className="w-72 space-y-1.5">
                        <TR label="Nettobetrag" value={`${fmt(invoice.totalNet.toNumber())} €`} />
                        {Object.entries(taxGroups).filter(([,v])=>v>0)
                          .sort(([a],[b])=>parseFloat(b)-parseFloat(a))
                          .map(([rate,amt])=>(
                            <TR key={rate} label={`zzgl. ${rate}% MwSt.`} value={`${fmt(amt)} €`} muted />
                          ))}
                        <div className="border-t border-stone-200 pt-1.5">
                          <TR label="Bruttobetrag" value={`${fmt(totalGross)} €`} bold />
                        </div>
                        {paidAmount > 0 && <TR label="Bereits bezahlt" value={`- ${fmt(paidAmount)} €`} green />}
                        {remaining > 0  && <TR label="Noch offen"      value={`${fmt(remaining)} €`} amber />}
                      </div>
                    </div>
                  </>
              }
            </DocumentSectionCard>

            {/* Payments journal */}
            {!['DRAFT', 'FINALIZED'].includes(invoice.status) && canReadPayments && (
              <div className="card-base overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-100">
                  <h2 className="text-sm font-600">Zahlungen</h2>
                </div>
                <div className="p-5">
                  <PaymentJournal
                    payments={payments}
                    totalGross={totalGross}
                    paidAmount={paidAmount}
                    invoiceStatus={invoice.status}
                    canDelete={canCreatePayment}
                  />
                </div>
              </div>
            )}

            {/* Cancellation reference */}
            {invoice.cancelledByInvoiceId && (
              <div className="card-base p-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                </svg>
                <div>
                  <p className="text-sm text-muted-foreground">Storniert durch</p>
                  <Link href={`/invoices/${invoice.cancelledByInvoiceId}`}
                    className="text-sm font-600 text-blue-700 hover:underline mono">
                    Stornorechnung anzeigen →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <BusinessDocumentSidebar sticky>
            <BusinessProcessWorkflow process={process} currentDocument={{ type: 'invoice', id: invoice.id }} permissions={processPermissions}
              invoiceAction={<InvoiceActions
                invoiceId={invoice.id}
                status={invoice.status as InvoiceStatus}
                invoiceNumber={invoice.invoiceNumber}
                totalGross={totalGross}
                canFinalize={canFinalize}
                canCancel={canCancel}
                canEdit={canEdit}
                canDelete={canDelete && isTestDeleteEnabled()}
              />} />

            {/* FIX: addPaymentAction importiert direkt — kein inline 'use server' wrapper */}
            {canAddPayment && (
              <div className="card-base overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100">
                  <h3 className="text-sm font-600">Zahlung erfassen</h3>
                </div>
                <div className="p-4">
                  <PaymentForm
                    invoiceId={invoice.id}
                    totalGross={totalGross}
                    paidAmount={paidAmount}
                    action={addPaymentAction}
                  />
                </div>
              </div>
            )}

            {!['DRAFT', 'PAID', 'CANCELLED'].includes(invoice.status) && canManageDunning && (
              <div className="card-base overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100">
                  <h3 className="text-sm font-600">Mahnwesen</h3>
                </div>
                <div className="p-4">
                  <DunningPanel
                    invoiceId={invoice.id}
                    invoiceStatus={invoice.status}
                    notices={dunningNotices}
                    canManage={canManageDunning}
                  />
                </div>
              </div>
            )}

            <div className="card-base p-4 space-y-3">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Details</p>
              <MI label="Rechnungs-ID" value={invoice.id.slice(0,8)+'…'} mono />
              <MI label="Angelegt von" value={`${invoice.createdBy.firstName} ${invoice.createdBy.lastName}`} />
              <MI label="Angelegt am"  value={format(new Date(invoice.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })} />
              {invoice.order && (
                <div>
                  <p className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Auftrag</p>
                  <Link href={`/orders/${invoice.order.id}`} className="text-sm text-blue-700 hover:underline mono">
                    {invoice.order.orderNumber}
                  </Link>
                </div>
              )}
            </div>
          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}

function MI({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm text-foreground ${mono ? 'mono' : ''}`}>{value}</dd>
    </div>
  )
}

function HeaderReference({ label, value, href, canLink = false }: {
  label: string
  value?: string | null
  href?: string
  canLink?: boolean
}) {
  return (
    <div>
      <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm mono">
        {value && href && canLink
          ? <Link href={href} className="text-blue-700 hover:underline">{value}</Link>
          : value ?? '—'}
      </dd>
    </div>
  )
}

function HeaderValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm text-foreground">{value}</dd></div>
}

function TR({ label, value, bold, muted, green, amber }: {
  label: string; value: string; bold?: boolean; muted?: boolean; green?: boolean; amber?: boolean
}) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className={`text-sm ${muted ? 'text-muted-foreground' : bold ? 'font-600' : green ? 'text-emerald-700' : amber ? 'text-amber-700' : ''}`}>
        {label}
      </span>
      <span className={`mono text-sm tabular-nums ${bold ? 'font-600' : green ? 'text-emerald-700' : amber ? 'text-amber-700 font-500' : ''}`}>
        {value}
      </span>
    </div>
  )
}
