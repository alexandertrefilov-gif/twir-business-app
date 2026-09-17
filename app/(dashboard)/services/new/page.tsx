// app/(dashboard)/services/new/page.tsx
import type { Metadata }  from 'next'
import { redirect }       from 'next/navigation'
import { PageHeader }     from '@/components/shared/PageHeader'
import { ServiceReportForm } from '@/components/service-reports/ServiceReportForm'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }         from '@/lib/db/prisma'
import { createServiceReportAction } from '../actions'
import { getServiceReportTemplate } from '@/lib/services/service-report-template.service'
import { BusinessDocumentLayout, BusinessDocumentSidebar, BusinessWorkflowPlaceholder } from '@/components/documents/BusinessDocumentLayout'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForOrder } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'

export const metadata: Metadata = { title: 'Leistung erfassen' }

export default async function NewServiceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; orderId?: string }>
}) {
  const query = await searchParams
  const user = await requirePermission(Resource.SERVICE_REPORT, Action.CREATE)
  const requestedOrderId = query.order ?? query.orderId

  if (requestedOrderId) {
    const existingReport = await prisma.serviceReport.findFirst({
      where: { orderId: requestedOrderId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (existingReport) redirect(`/services/${existingReport.id}`)
  }

  // Only show open/in-progress orders
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status:    { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED'] },
      serviceReports: { none: {} },
    },
    orderBy: { orderDate: 'desc' },
    select:  { id: true, orderNumber: true, title: true, customer: { select: { name: true, contacts: { take: 1, select: { firstName: true, lastName: true } } } } },
  })
  const orderOptions = orders.map((order) => ({
    ...order,
    customerName: order.customer.name,
    contactName: order.customer.contacts[0]
      ? [order.customer.contacts[0].firstName, order.customer.contacts[0].lastName].filter(Boolean).join(' ')
      : undefined,
  }))
  const selectedOrderId = requestedOrderId && orders.some((order) => order.id === requestedOrderId) ? requestedOrderId : null
  const [selectedOrder, process, processPermissions] = await Promise.all([
    selectedOrderId ? getServiceReportTemplate(selectedOrderId) : null,
    selectedOrderId ? getBusinessProcessForOrder(selectedOrderId, user.userId, user.role) : null,
    getBusinessProcessPermissions(),
  ])

  return (
    <div>
      <PageHeader
        sticky
        title="Leistung erfassen"
        breadcrumbs={[{ label: 'Leistungen', href: '/services' }, { label: 'Neu' }]}
      />
      <div className="p-4 sm:p-6">
        <BusinessDocumentLayout>
          <div className="min-w-0">
            <ServiceReportForm
              mode="create"
              orders={orderOptions}
              defaults={{
                orderId: requestedOrderId,
                title: selectedOrder?.title,
                description: selectedOrder?.description,
                reportDate: selectedOrder?.reportDate,
                items: selectedOrder?.items,
              }}
              lockOrder={!!requestedOrderId}
              sourceOfferNumber={selectedOrder?.offerNumber}
              action={createServiceReportAction}
            />
          </div>
          <BusinessDocumentSidebar sticky>
            {process ? (
              <BusinessProcessWorkflow
                process={process}
                currentDocument={{ type: 'serviceReport', id: 'new' }}
                activeStage="serviceReport"
                permissions={processPermissions}
                serviceReportAction={<div id="service-report-workflow-actions" />}
              />
            ) : (
              <BusinessWorkflowPlaceholder message="Wählen Sie zuerst einen Auftrag aus, um den zugehörigen Geschäftsvorgang anzuzeigen.">
                <div id="service-report-workflow-actions" />
              </BusinessWorkflowPlaceholder>
            )}
          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}
