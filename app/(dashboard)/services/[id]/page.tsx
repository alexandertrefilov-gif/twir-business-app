// app/(dashboard)/services/[id]/page.tsx
import type { Metadata }  from 'next'
import { notFound }       from 'next/navigation'
import Link               from 'next/link'
import { getServiceReportById } from '@/lib/services/service-report.service'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { format } from 'date-fns'
import { de }     from 'date-fns/locale'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForServiceReport } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'
import { OfferRichText } from '@/components/offers/OfferRichText'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { DocumentSectionCard } from '@/components/documents/DocumentSectionCard'
import { BusinessDocumentHeader } from '@/components/documents/BusinessDocumentHeader'
import { buildServiceReportDocumentSections } from '@/lib/documents/service-report-document'
import { ServiceReportFinalizeButton } from '@/components/service-reports/ServiceReportFinalizeButton'

export const metadata: Metadata = { title: 'Leistungsnachweis' }

export default async function ServiceReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePermission(Resource.SERVICE_REPORT, Action.READ)

  let report
  try { report = await getServiceReportById(id, user.userId, user.role) }
  catch { notFound() }

  const [process, processPermissions] = await Promise.all([
    getBusinessProcessForServiceReport(id, user.userId, user.role),
    getBusinessProcessPermissions(),
  ])

  const preparedBy = `${report.createdBy.firstName} ${report.createdBy.lastName}`
  // The surrounding split layout is a Client Component. Convert Prisma
  // class instances before they can become part of its React payload.
  const serializableItems = report.items.map((item) => ({
    id: item.id,
    position: item.position,
    type: item.type,
    description: item.description,
    quantity: item.quantity.toNumber(),
    unit: item.unit,
    unitPrice: item.unitPrice.toNumber(),
    discountRate: item.discountRate.toNumber(),
    taxRate: item.taxRate.toNumber(),
    netAmount: item.netAmount.toNumber(),
    notes: item.notes,
  }))
  const documentSections = buildServiceReportDocumentSections({
    description: report.description,
    items: serializableItems,
    preparedBy,
    customerName: report.order.customer.name,
  })

  return (
    <div>
      <BusinessDocumentHeader
        title={report.reportNumber}
        description={report.title}
        titleId="service-report-detail-title"
        detailsLabel="Kunden- und Auftragsdaten"
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2 xl:col-span-1 xl:row-span-2">
            <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Kunde</dt>
            <dd className="mt-0.5">
              <Link href={`/customers/${report.order.customer.id}`} className="text-sm font-600 text-blue-700 hover:underline">
                {report.order.customer.name}
              </Link>
              {(report.order.customer.street || report.order.customer.city) && (
                <address className="mt-3 text-sm not-italic leading-5 text-muted-foreground">
                  {report.order.customer.street} {report.order.customer.houseNumber}<br />
                  {report.order.customer.postalCode} {report.order.customer.city}
                </address>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Auftrag</dt>
            <dd className="mt-0.5">
              <Link href={`/orders/${report.order.id}`} className="text-sm text-blue-700 hover:underline mono">{report.order.orderNumber}</Link>
            </dd>
          </div>
          <MetaItem label="Leistungsdatum" value={format(new Date(report.reportDate), 'dd. MMMM yyyy', { locale: de })} />
          <MetaItem label="Erfasst von" value={preparedBy} />
          {report.order.offer && processPermissions.readOffer && (
            <div>
              <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Angebotsbezug</dt>
              <dd className="mt-0.5">
                <Link href={`/offers/${report.order.offer.id}`} className="text-sm text-blue-700 hover:underline mono">{report.order.offer.offerNumber}</Link>
              </dd>
            </div>
          )}
        </dl>
      </BusinessDocumentHeader>

      <div className="p-6">
        <BusinessDocumentLayout>

          {/* ── Main ── */}
          <div className="min-w-0 space-y-4">

            {documentSections.map((section) => {
              if (section.kind === 'richText') {
                return <OfferRichText key={section.id} value={section.value} sectionCards />
              }
              if (section.kind === 'positions') {
                return (
                  <DocumentSectionCard key={section.id} title={`Positionen (${section.items.length})`} flush>
                    <div className="overflow-x-auto px-5 pb-5">
                      <table className="w-full text-left text-sm">
                        <thead><tr className="border-b border-stone-200 text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2 pr-3">Pos.</th><th className="py-2 pr-3">Leistung / Material</th><th className="py-2 pr-3 text-right">Menge</th><th className="py-2">Einheit</th></tr></thead>
                        <tbody>{section.items.map((item) => <tr key={item.id} className="border-b border-stone-100"><td className="py-2 pr-3 tabular-nums">{item.position}</td><td className="py-2 pr-3"><span className="font-500">{item.description}</span>{item.notes && <span className="mt-0.5 block text-xs text-muted-foreground">{item.notes}</span>}</td><td className="py-2 pr-3 text-right tabular-nums">{item.quantity.toLocaleString('de-DE')}</td><td className="py-2">{item.unit}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </DocumentSectionCard>
                )
              }
              return (
                <DocumentSectionCard key={section.id} title="Unterschriften">
                  <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
                    <div className="border-t border-stone-300 pt-2 text-muted-foreground">Ort, Datum, Unterschrift Auftragnehmer<br />{section.preparedBy}</div>
                    <div className="border-t border-stone-300 pt-2 text-muted-foreground">Ort, Datum, Unterschrift Auftraggeber<br />{section.customerName}</div>
                  </div>
                </DocumentSectionCard>
              )
            })}

          </div>

          {/* ── Sidebar ── */}
          <BusinessDocumentSidebar sticky>
            <BusinessProcessWorkflow process={process} currentDocument={{ type: 'serviceReport', id: report.id }} permissions={processPermissions}
              serviceReportAction={report.status === 'DRAFT' ? <ServiceReportFinalizeButton reportId={report.id} /> : undefined} />
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

          </BusinessDocumentSidebar>

        </BusinessDocumentLayout>
      </div>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}
