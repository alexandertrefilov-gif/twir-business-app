// app/(dashboard)/services/[id]/edit/page.tsx
import type { Metadata }  from 'next'
import { notFound }       from 'next/navigation'
import { PageHeader }     from '@/components/shared/PageHeader'
import { ServiceReportForm } from '@/components/service-reports/ServiceReportForm'
import { getServiceReportById } from '@/lib/services/service-report.service'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }         from '@/lib/db/prisma'
import { updateServiceReportAction } from '../../actions'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForServiceReport } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'

export const metadata: Metadata = { title: 'Leistungsnachweis bearbeiten' }

export default async function EditServiceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePermission(Resource.SERVICE_REPORT, Action.UPDATE)

  let report
  try { report = await getServiceReportById(id, user.userId, user.role) }
  catch { notFound() }

  // Employee restriction checked inside getServiceReportById – if we reach here we're allowed

  const orders = await prisma.order.findMany({
    where:   { deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED'] } },
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

  const boundAction = updateServiceReportAction.bind(null, report.id)
  const [process, processPermissions] = await Promise.all([
    getBusinessProcessForServiceReport(report.id, user.userId, user.role),
    getBusinessProcessPermissions(),
  ])

  return (
    <div>
      <PageHeader
        sticky
        title={`${report.reportNumber} bearbeiten`}
        breadcrumbs={[
          { label: 'Leistungen',   href: '/services' },
          { label: report.reportNumber, href: `/services/${report.id}` },
          { label: 'Bearbeiten' },
        ]}
      />
      <div className="p-4 sm:p-6">
        <BusinessDocumentLayout>
          <div className="min-w-0">
            <ServiceReportForm
          reportId={report.id}
          mode="edit"
          orders={orderOptions}
          lockOrder
          action={boundAction}
          defaults={{
            orderId:     report.orderId,
            title:       report.title       ?? undefined,
            description: report.description ?? undefined,
            reportDate:  report.reportDate.toISOString().slice(0, 10),
            items:       report.items.map((item) => ({
              _key:        item.id,
              position:    item.position,
              type:        item.type as 'hours' | 'material' | 'flat',
              description: item.description,
              quantity:    item.quantity.toNumber().toString(),
              unit:        item.unit,
              unitPrice:   item.unitPrice.toNumber().toString(),
              discountRate: item.discountRate.toNumber().toString(),
              taxRate:      item.taxRate.toNumber().toString(),
              notes:       item.notes ?? '',
            })),
          }}
            />
          </div>
          <BusinessDocumentSidebar sticky>
            <BusinessProcessWorkflow
              process={process}
              currentDocument={{ type: 'serviceReport', id: report.id }}
              activeStage="serviceReport"
              permissions={processPermissions}
              editingAction={<div id="document-edit-workflow-actions" />}
            />
          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}
