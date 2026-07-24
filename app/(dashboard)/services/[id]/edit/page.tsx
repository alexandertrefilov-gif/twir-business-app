// app/(dashboard)/services/[id]/edit/page.tsx
import type { Metadata }  from 'next'
import { notFound }       from 'next/navigation'
import { PageHeader }     from '@/components/shared/PageHeader'
import { ServiceReportForm } from '@/components/service-reports/ServiceReportForm'
import { getServiceReportById } from '@/lib/services/service-report.service'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }         from '@/lib/db/prisma'
import { updateServiceReportAction } from '../../actions'

export const metadata: Metadata = { title: 'Leistungsnachweis bearbeiten' }

export default async function EditServiceReportPage({ params }: { params: { id: string } }) {
  const user = await requirePermission(Resource.SERVICE_REPORT, Action.UPDATE)

  let report
  try { report = await getServiceReportById(params.id, user.userId, user.role) }
  catch { notFound() }

  // Employee restriction checked inside getServiceReportById – if we reach here we're allowed

  const orders = await prisma.order.findMany({
    where:   { deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED'] } },
    orderBy: { orderDate: 'desc' },
    select:  { id: true, orderNumber: true, title: true },
  })

  const boundAction = updateServiceReportAction.bind(null, report.id)

  return (
    <div>
      <PageHeader
        title={`${report.reportNumber} bearbeiten`}
        breadcrumbs={[
          { label: 'Leistungen',   href: '/services' },
          { label: report.reportNumber, href: `/services/${report.id}` },
          { label: 'Bearbeiten' },
        ]}
      />
      <div className="p-6 max-w-4xl">
        <ServiceReportForm
          mode="edit"
          orders={orders}
          lockOrder
          action={boundAction}
          defaults={{
            orderId:     report.orderId,
            title:       report.title       ?? undefined,
            description: report.description ?? undefined,
            reportDate:  report.reportDate.toISOString().slice(0, 10),
            items:       report.items.map((item) => ({
              _key:        item.id,
              type:        item.type as 'hours' | 'material' | 'flat',
              description: item.description,
              quantity:    item.quantity.toNumber().toString(),
              unit:        item.unit,
              unitPrice:   item.unitPrice.toNumber().toString(),
              notes:       item.notes ?? '',
            })),
          }}
        />
      </div>
    </div>
  )
}
