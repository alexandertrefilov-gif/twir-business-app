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
import { getDunningEligibility, getDunningNoticesForInvoice } from '@/lib/services/dunning.service'
import type { DunningEligibilityDto } from '@/lib/services/dunning.service'
import { DUNNABLE_INVOICE_STATUSES } from '@/lib/services/dunning-policy'
import { groupTaxFromStoredNet, isPositiveMoney, resolveOpenAmount } from '@/lib/billing'
import { formatDecimalDe } from '@/lib/billing/format'
import { hasPermission, requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { InvoiceStatus, INVOICE_TYPE_LABELS } from '@/types/enums'
import { addPaymentAction }   from '@/app/(dashboard)/payments/actions'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'
import { getSupplierNumber } from '@/lib/services/settings.service'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForInvoice } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { BusinessDocumentHeader } from '@/components/documents/BusinessDocumentHeader'
import { BusinessDocumentMeta, DocumentMetaItem } from '@/components/documents/BusinessDocumentMeta'
import { buildBusinessDocumentHeader } from '@/lib/workflow/document-header'
import { getHeaderPermissions } from '@/lib/workflow/document-header-permissions'
import { buildInvoiceHeaderFields, buildInvoiceRecipient } from '@/lib/workflow/invoice-header'
import { getInvoiceHeaderProject } from '@/lib/services/invoice-header-project.service'
import { DocumentSectionCard } from '@/components/documents/DocumentSectionCard'
import { OfferRichText } from '@/components/offers/OfferRichText'
import { ProjectAssignmentAction } from '@/components/workflow/ProjectAssignmentAction'
import { listProjectsForCustomer } from '@/lib/services/project.service'
import { formatBerlinDateTime } from '@/lib/utils/berlin-date'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  await requirePagePermission(Resource.INVOICE, Action.READ)

  try {
    const inv = await getInvoiceById(id)
    return { title: inv.invoiceNumber ?? 'Rechnungsentwurf' }
  } catch { return { title: 'Rechnung' } }
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePagePermission(Resource.INVOICE, Action.READ)

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
    canManageProject,
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
    hasPermission(Resource.PROJECT, Action.CREATE),
    getBusinessProcessForInvoice(id, user.userId, user.role, {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      type: invoice.type,
      orderId: invoice.orderId,
    }),
    getBusinessProcessPermissions(),
  ])
  const availableProjects = canManageProject && !process.project ? await listProjectsForCustomer(invoice.customerId) : []

  // P5-4: Der aktuelle Rest wird aus den aktiven Zahlungszeilen bestimmt (Quelle wie addPayment). Dieselbe bestehende
  // Abfrage dient auch dem Erfassungsformular; die Zahlungsliste selbst bleibt an die Leseberechtigung gebunden.
  const paymentRecords = canReadPayments || canCreatePayment
    ? await getInvoicePayments(invoice.id)
    : null

  let dunningNotices: Awaited<ReturnType<typeof getDunningNoticesForInvoice>> = []
  if (canManageDunning) {
    try { dunningNotices = await getDunningNoticesForInvoice(invoice.id) }
    catch { /* dunning table may not exist pre-migration */ }
  }

  // REQ-029 P5-3: Mahnfähigkeit nur zur Anzeige (serverseitig berechnet). Verbindlich prüft createDunningNotice.
  // Schlägt die Berechnung fehl, wird nichts angeboten (null → Hinweis im Panel) statt still freizugeben.
  let dunningEligibility: DunningEligibilityDto | null = null
  if (canManageDunning && invoice.status !== 'DRAFT') {
    try { dunningEligibility = await getDunningEligibility(invoice.id) }
    catch { dunningEligibility = null }
  }
  const canMarkDunningSent = DUNNABLE_INVOICE_STATUSES.includes(invoice.status)

  const totalGross = invoice.totalGross.toNumber()
  // `null` = Zahlungszeilen NICHT geladen (keine Berechtigung) → ausgewiesener Cache-Rückfall.
  // `[]` = erfolgreich geladen, keine aktiven Zahlungen → 0,00 bezahlt (nicht der Cache).
  const open = resolveOpenAmount(
    invoice.totalGross,
    invoice.paidAmount,
    paymentRecords === null ? null : paymentRecords.map((p) => p.amount),
  )

  const items = invoice.items.map((item) => ({
    ...item,
    quantity:    item.quantity.toNumber(),
    unitPrice:   item.unitPrice.toNumber(),
    discountRate: item.discountRate ? item.discountRate.toNumber() : 0,
    taxRate:     item.taxRate.toNumber(),
    netAmount:   item.netAmount.toNumber(),
    taxAmount:   item.taxAmount.toNumber(),
    grossAmount: item.grossAmount.toNumber(),
  }))

  const hasDiscount = items.some((item) => item.discountRate > 0)

  // P5-4 (F4): Steuergruppen aus dem gespeicherten Positions-Netto (BT-117), nicht aus einzeln gerundeten Positionssteuern.
  const taxGroups = groupTaxFromStoredNet(invoice.items)

  const payments = (canReadPayments ? paymentRecords ?? [] : []).map((p) => ({
    id: p.id, amount: p.amount.toNumber(), paymentDate: p.paymentDate,
    method: p.method, reference: p.reference, notes: p.notes, createdAt: p.createdAt,
  }))

  const fmt  = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const cs   = invoice.customerSnapshot as Record<string, any> | null
  const cmp  = invoice.companySnapshot  as Record<string, any> | null
  const supplierNumber = invoice.status === InvoiceStatus.DRAFT
    ? await getSupplierNumber()
    : typeof cmp?.supplierNumber === 'string'
      ? cmp.supplierNumber
      : null
  const canAddPayment = canCreatePayment && isPositiveMoney(open.remaining) &&
    !['DRAFT', 'PAID', 'CANCELLED'].includes(invoice.status)

  // WF-1B: gemeinsames Kopfmodell (WF-1A). Kunde = Stammdatensatz, Rechnungsadresse =
  // gespeicherter Rechnungs-Snapshot. Ein direkt an der Rechnung hängendes Projekt
  // (Invoice.projectId) wird nur ergänzt, wenn der Vorgang kein Projekt liefert.
  const headerPermissions = await getHeaderPermissions(processPermissions)
  const headerProject = !process.project && headerPermissions.readProject
    ? await getInvoiceHeaderProject(invoice.projectId)
    : null
  const headerModel = buildBusinessDocumentHeader({
    current: 'invoice',
    currentInvoiceId: invoice.id,
    customer: { id: invoice.customerId, name: invoice.customer.name },
    recipient: buildInvoiceRecipient(invoice.customerSnapshot),
    process: headerProject ? { ...process, project: headerProject } : process,
    permissions: headerPermissions,
    dates: [],
    extraFields: buildInvoiceHeaderFields({
      invoiceDate: invoice.invoiceDate,
      deliveryDate: invoice.deliveryDate,
      deliveryPeriodStart: invoice.deliveryPeriodStart,
      deliveryPeriodEnd: invoice.deliveryPeriodEnd,
      dueDate: invoice.dueDate,
      finalizedAt: invoice.finalizedAt,
      sentAt: invoice.sentAt,
      supplierNumber,
    }),
  })

  return (
    <div>
      <BusinessDocumentHeader
        title={invoice.invoiceNumber ?? 'Rechnungsentwurf'}
        description={headerPermissions.readOrder ? invoice.order?.title : undefined}
        titleId="invoice-detail-title"
        detailsLabel="Kunden- und Rechnungsdaten"
      >
        <BusinessDocumentMeta
          model={headerModel}
          leadingItems={
            <DocumentMetaItem label="Status">
              <span className="flex flex-wrap items-center gap-2">
                <InvoiceStatusBadge status={invoice.status} />
                {invoice.type !== 'STANDARD' && (
                  <span className="rounded border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs text-muted-foreground mono">
                    {INVOICE_TYPE_LABELS[invoice.type as keyof typeof INVOICE_TYPE_LABELS] ?? invoice.type}
                  </span>
                )}
              </span>
            </DocumentMetaItem>
          }
        />
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
                    headerPermissions.readCustomer
                      ? <Link href={`/customers/${invoice.customerId}`}
                          className="font-600 text-sm text-blue-700 hover:underline">
                          {invoice.customer.name}
                        </Link>
                      : <span className="font-600 text-sm">{invoice.customer.name}</span>
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
                            {hasDiscount && <th className="num text-right">Rabatt</th>}
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
                              {hasDiscount && <td className="num text-right mono text-sm">{item.discountRate > 0 ? `${fmt(item.discountRate)} %` : '–'}</td>}
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
                        {taxGroups.map((group) => (
                          <TR key={group.rate} label={`zzgl. ${group.rate}% MwSt.`} value={`${formatDecimalDe(group.tax)} €`} muted />
                        ))}
                        <div className="border-t border-stone-200 pt-1.5">
                          <TR label="Bruttobetrag" value={`${fmt(totalGross)} €`} bold />
                        </div>
                        {isPositiveMoney(open.paid)      && <TR label="Bereits bezahlt" value={`- ${formatDecimalDe(open.paid)} €`} green />}
                        {isPositiveMoney(open.remaining) && <TR label="Noch offen"      value={`${formatDecimalDe(open.remaining)} €`} amber />}
                        {open.cacheDrift && (
                          <p className="text-xs text-amber-700 pt-1">
                            Hinweis: Der gespeicherte Zahlungsstand ({formatDecimalDe(open.cachePaid)} €) weicht von der Summe der Zahlungen ({formatDecimalDe(open.paid)} €) ab. Angezeigt wird die Summe der Zahlungen.
                          </p>
                        )}
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
                    paidAmount={open.paid}
                    remainingAmount={open.remaining}
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
              projectAction={canManageProject
                ? <ProjectAssignmentAction kind="invoice" targetId={invoice.id} customerId={invoice.customerId} suggestedName={invoice.order?.title ?? invoice.invoiceNumber ?? 'Rechnung'} projects={availableProjects} />
                : undefined}
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
                    totalGross={open.totalGross}
                    paidAmount={open.paid}
                    remainingAmount={open.remaining}
                    action={addPaymentAction}
                  />
                </div>
              </div>
            )}

            {invoice.status !== 'DRAFT' && canManageDunning && (
              <div className="card-base overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100">
                  <h3 className="text-sm font-600">Mahnwesen</h3>
                </div>
                <div className="p-4">
                  <DunningPanel
                    invoiceId={invoice.id}
                    notices={dunningNotices}
                    canManage={canManageDunning}
                    eligibility={dunningEligibility}
                    canMarkSent={canMarkDunningSent}
                  />
                </div>
              </div>
            )}

            <div className="card-base p-4 space-y-3">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Details</p>
              <MI label="Rechnungs-ID" value={invoice.id.slice(0,8)+'…'} mono />
              <MI label="Angelegt von" value={`${invoice.createdBy.firstName} ${invoice.createdBy.lastName}`} />
              <MI label="Angelegt am"  value={formatBerlinDateTime(invoice.createdAt)} />
              {invoice.order && headerPermissions.readOrder && (
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
