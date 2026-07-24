// app/(dashboard)/orders/[id]/edit/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { PageHeader }     from '@/components/shared/PageHeader'
import { OrderForm }      from '@/components/orders/OrderForm'
import { getOrderById }   from '@/lib/services/order.service'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }         from '@/lib/db/prisma'
import { updateOrderAction } from '../../actions'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try { const o = await getOrderById(params.id); return { title: `${o.orderNumber} bearbeiten` } }
  catch { return { title: 'Auftrag bearbeiten' } }
}

export default async function EditOrderPage({ params }: { params: { id: string } }) {
  await requirePermission(Resource.ORDER, Action.UPDATE)

  let order
  try { order = await getOrderById(params.id) }
  catch { notFound() }

  // Only OPEN orders can be edited
  if (order.status !== 'OPEN') redirect(`/orders/${order.id}`)

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, number: true },
  })

  const boundAction = updateOrderAction.bind(null, order.id)

  return (
    <div>
      <PageHeader
        title={`${order.orderNumber} bearbeiten`}
        breadcrumbs={[
          { label: 'Aufträge', href: '/orders' },
          { label: order.orderNumber, href: `/orders/${order.id}` },
          { label: 'Bearbeiten' },
        ]}
      />
      <div className="p-6 max-w-3xl">
        <OrderForm
          mode="edit"
          customers={customers}
          lockCustomer={!!order.offer}
          action={boundAction}
          defaults={{
            customerId:  order.customerId,
            title:       order.title       ?? undefined,
            description: order.description ?? undefined,
            orderDate:   order.orderDate.toISOString().slice(0, 10),
            startDate:   order.startDate?.toISOString().slice(0, 10),
            endDate:     order.endDate?.toISOString().slice(0, 10),
            items:       order.items.map((item) => ({
              _key:        item.id,
              description: item.description,
              quantity:    item.quantity.toNumber().toString(),
              unit:        item.unit,
              unitPrice:   item.unitPrice.toNumber().toString(),
              taxRate:     item.taxRate.toNumber().toString(),
            })),
          }}
        />
      </div>
    </div>
  )
}
