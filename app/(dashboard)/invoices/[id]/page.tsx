// app/(dashboard)/invoices/[id]/page.tsx — FIXED
// Entfernt: ungültige 'use server' inline-Funktion (addPaymentBound)
// addPaymentAction aus Phase 7 wird direkt als prop übergeben — kein Wrapper nötig.
// [Differenz zu Phase 9: Zeilen 88-96 entfernt, addPaymentAction direkt übergeben]

import type { Metadata }      from 'next'
import { notFound }           from 'next/navigation'
import Link                   from 'next/link'
import { getServerSession }   from 'next-auth'
import { authOptions }        from '@/lib/auth/options'
import { PageHeader }         from '@/components/shared/PageHeader'
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
import { isInvoiceLocked, InvoiceStatus, INVOICE_TYPE_LABELS } from '@/types/enums'
import { addPaymentAction }   from '@/app/(dashboard)/payments/actions'
import { format }             from 'date-fns'
import { de }                 from 'date-fns/locale'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  await requirePermission(Resource.INVOICE, Action.READ)

  try {
    const inv = await getInvoiceById(params.id)
    return { title: inv.invoiceNumber ?? 'Rechnungsentwurf' }
  } catch { return { title: 'Rechnung' } }
}

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  await requirePermission(Resource.INVOICE, Action.READ)

  let invoice
  try { invoice = await getInvoiceById(params.id) }
  catch { notFound() }

  const session  = await getServerSession(authOptions)
  const userRole = (session?.user as any)?.role ?? 'OFFICE'

  const [
    canEdit,
    canFinalize,
    canCancel,
    canCreatePayment,
    canReadPayments,
    canManageDunning,
  ] = await Promise.all([
    hasPermission(Resource.INVOICE, Action.UPDATE),
    hasPermission(Resource.INVOICE, Action.FINALIZE),
    hasPermission(Resource.INVOICE, Action.CANCEL),
    hasPermission(Resource.PAYMENT, Action.CREATE),
    hasPermission(Resource.PAYMENT, Action.READ),
    hasPermission(Resource.INVOICE, Action.UPDATE),
  ])

  const paymentRecords = canReadPayments
    ? await getInvoicePayments(invoice.id)
    : []

  let dunningNotices: Awaited<ReturnType<typeof getDunningNoticesForInvoice>> = []
  if (canManageDunning) {
    try { dunningNotices = await getDunningNoticesForInvoice(invoice.id) }
    catch { /* dunning table may not exist pre-migration */ }
  }

  const locked     = isInvoiceLocked(invoice.status as InvoiceStatus)
  const canEditNow = canEdit && !locked
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
  const canAddPayment = canCreatePayment && remaining > 0 &&
    !['DRAFT', 'PAID', 'CANCELLED'].includes(invoice.status)

  return (
    <div>
      <PageHeader
        title={invoice.invoiceNumber ?? 'Rechnungsentwurf'}
        description={invoice.order
          ? `Auftrag ${invoice.order.orderNumber}${invoice.order.title ? ` · ${invoice.order.title}` : ''}`
          : undefined}
        breadcrumbs={[
          { label: 'Rechnungen', href: '/invoices' },
          { label: invoice.invoiceNumber ?? 'Entwurf' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            {invoice.type !== 'STANDARD' && (
              <span className="text-xs mono text-muted-foreground px-2 py-0.5 rounded bg-stone-100 border border-stone-200">
                {INVOICE_TYPE_LABELS[invoice.type as keyof typeof INVOICE_TYPE_LABELS] ?? invoice.type}
              </span>
            )}
            {canEditNow && (
              <Link href={`/invoices/${invoice.id}/edit`}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors">
                Bearbeiten
              </Link>
            )}
          </div>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">

            {/* Customer + Dates */}
            <div className="card-base p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-2">Rechnungsempfänger</p>
                  {cs ? (
                    <div className="text-sm">
                      <p className="font-600">{cs.name}</p>
                      {cs.vatId && <p className="text-xs text-muted-foreground mono">USt-ID: {cs.vatId}</p>}
                      {(cs.street || cs.city) && (
                        <address className="not-italic text-muted-foreground text-xs mt-1 leading-5">
                          {cs.street} {cs.houseNumber}<br />{cs.postalCode} {cs.city}
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
                <div className="space-y-2.5">
                  <MI label="Rechnungsdatum" value={fmtD(invoice.invoiceDate)} />
                  {invoice.dueDate    && <MI label="Zahlungsziel" value={fmtD(invoice.dueDate)} />}
                  {invoice.finalizedAt && <MI label="Finalisiert am"
                    value={format(new Date(invoice.finalizedAt), 'dd.MM.yyyy HH:mm', { locale: de })} />}
                  {invoice.sentAt && <MI label="Versendet am"
                    value={format(new Date(invoice.sentAt), 'dd.MM.yyyy', { locale: de })} />}
                </div>
              </div>
              {cmp && (
                <div className="mt-4 pt-4 border-t border-stone-100">
                  <p className="text-[10px] font-600 uppercase tracking-wider text-muted-foreground mb-1">Rechnungssteller (Snapshot)</p>
                  <p className="text-xs text-muted-foreground">
                    {cmp.companyName}{cmp.legalForm ? ` ${cmp.legalForm}` : ''}
                    {cmp.vatId ? ` · USt-ID: ${cmp.vatId}` : ''}
                    {cmp.iban  ? ` · IBAN: ${cmp.iban}` : ''}
                  </p>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="card-base overflow-hidden">
              <div className="px-5 py-3 border-b border-stone-100">
                <h2 className="text-sm font-600">Positionen ({items.length})</h2>
              </div>
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
            </div>

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
          <div className="space-y-4">
            <div className="card-base p-4">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3">Workflow</p>
              <InvoiceActions
                invoiceId={invoice.id}
                status={invoice.status as InvoiceStatus}
                invoiceNumber={invoice.invoiceNumber}
                totalGross={totalGross}
                canFinalize={canFinalize}
                canCancel={canCancel}
                canEdit={canEdit}
              />
            </div>

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
          </div>
        </div>
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
