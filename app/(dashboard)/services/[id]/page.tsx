// app/(dashboard)/services/[id]/page.tsx
import type { Metadata }  from 'next'
import { notFound }       from 'next/navigation'
import Link               from 'next/link'
import { getServiceReportById } from '@/lib/services/service-report.service'
import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { format } from 'date-fns'
import { de }     from 'date-fns/locale'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForServiceReport } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'
import { OfferRichText } from '@/components/offers/OfferRichText'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { DocumentSectionCard } from '@/components/documents/DocumentSectionCard'
import { BusinessDocumentHeader } from '@/components/documents/BusinessDocumentHeader'
import { BusinessDocumentMeta } from '@/components/documents/BusinessDocumentMeta'
import { buildBusinessDocumentHeader } from '@/lib/workflow/document-header'
import { getHeaderPermissions } from '@/lib/workflow/document-header-permissions'
import { buildServiceReportDocumentSections } from '@/lib/documents/service-report-document'
import { ServiceReportFinalizeButton } from '@/components/service-reports/ServiceReportFinalizeButton'

export const metadata: Metadata = { title: 'Leistungsnachweis' }

export default async function ServiceReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePagePermission(Resource.SERVICE_REPORT, Action.READ)

  let report
  try { report = await getServiceReportById(id, user.userId, user.role) }
  catch { notFound() }

  const [process, processPermissions] = await Promise.all([
    getBusinessProcessForServiceReport(id, user.userId, user.role),
    getBusinessProcessPermissions(),
  ])

  const preparedBy = `${report.createdBy.firstName} ${report.createdBy.lastName}`
  const headerModel = buildBusinessDocumentHeader({
    current: 'serviceReport',
    customer: report.order.customer,
    process,
    permissions: await getHeaderPermissions(processPermissions),
    dates: [{ label: 'Leistungsdatum', value: report.reportDate, pattern: 'dd. MMMM yyyy' }],
    extraFields: [{ label: 'Erfasst von', value: preparedBy }],
  })
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
        <BusinessDocumentMeta model={headerModel} />
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
