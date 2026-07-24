// app/(dashboard)/services/new/page.tsx
import type { Metadata }  from 'next'
import { PageHeader }     from '@/components/shared/PageHeader'
import { ServiceReportForm } from '@/components/service-reports/ServiceReportForm'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }         from '@/lib/db/prisma'
import { createServiceReportAction } from '../actions'

export const metadata: Metadata = { title: 'Leistung erfassen' }

export default async function NewServiceReportPage({
  searchParams,
}: {
  searchParams: { order?: string }
}) {
  await requirePermission(Resource.SERVICE_REPORT, Action.CREATE)

  // Only show open/in-progress orders
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status:    { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED'] },
    },
    orderBy: { orderDate: 'desc' },
    select:  { id: true, orderNumber: true, title: true },
  })

  return (
    <div>
      <PageHeader
        title="Leistung erfassen"
        breadcrumbs={[{ label: 'Leistungen', href: '/services' }, { label: 'Neu' }]}
      />
      <div className="p-6 max-w-4xl">
        <ServiceReportForm
          mode="create"
          orders={orders}
          defaults={{ orderId: searchParams.order }}
          lockOrder={!!searchParams.order}
          action={createServiceReportAction}
        />
      </div>
    </div>
  )
}
