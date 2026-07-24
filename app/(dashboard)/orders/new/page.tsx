// app/(dashboard)/orders/new/page.tsx
import type { Metadata }  from 'next'
import { PageHeader }     from '@/components/shared/PageHeader'
import { OrderForm }      from '@/components/orders/OrderForm'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }         from '@/lib/db/prisma'
import { createOrderAction } from '../actions'

export const metadata: Metadata = { title: 'Neuer Auftrag' }

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const query = await searchParams
  await requirePermission(Resource.ORDER, Action.CREATE)

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, number: true },
  })

  return (
    <div>
      <PageHeader
        title="Neuer Auftrag"
        breadcrumbs={[{ label: 'Aufträge', href: '/orders' }, { label: 'Neu' }]}
      />
      <div className="p-6 max-w-3xl">
        <OrderForm
          mode="create"
          customers={customers}
          defaults={{ customerId: query.customer }}
          action={createOrderAction}
        />
      </div>
    </div>
  )
}
