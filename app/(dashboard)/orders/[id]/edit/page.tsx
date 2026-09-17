// app/(dashboard)/orders/[id]/edit/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { PageHeader }     from '@/components/shared/PageHeader'
import { OrderForm }      from '@/components/orders/OrderForm'
import { getOrderById }   from '@/lib/services/order.service'
import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }         from '@/lib/db/prisma'
import { updateOrderAction } from '../../actions'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForOrder } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'
import { orderDescriptionWithOfferFallback } from '@/lib/offers/rich-text'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try { const o = await getOrderById(id); return { title: `${o.orderNumber} bearbeiten` } }
  catch { return { title: 'Auftrag bearbeiten' } }
}

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePagePermission(Resource.ORDER, Action.UPDATE)

  let order
  try { order = await getOrderById(id) }
  catch { notFound() }

  // Only OPEN orders can be edited
  if (order.status !== 'OPEN') redirect(`/orders/${order.id}`)

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, number: true },
  })

  const boundAction = updateOrderAction.bind(null, order.id)
  const [process, processPermissions] = await Promise.all([
    getBusinessProcessForOrder(order.id, user.userId, user.role),
    getBusinessProcessPermissions(),
  ])

  return (
    <div>
      <PageHeader
        sticky
        title={`${order.orderNumber} bearbeiten`}
        breadcrumbs={[
          { label: 'Aufträge', href: '/orders' },
          { label: order.orderNumber, href: `/orders/${order.id}` },
          { label: 'Bearbeiten' },
        ]}
      />
      <div className="p-4 sm:p-6">
        <BusinessDocumentLayout>
          <div className="min-w-0">
            <OrderForm
          mode="edit"
          customers={customers}
          lockCustomer={!!order.offer}
          action={boundAction}
          defaults={{
            customerId:  order.customerId,
            title:       order.title       ?? undefined,
            description: orderDescriptionWithOfferFallback(
              order.description,
              order.offer,
              order.items.length > 0,
            ) ?? undefined,
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
              notes:       item.notes ?? '',
            })),
          }}
            />
          </div>
          <BusinessDocumentSidebar sticky>
            <BusinessProcessWorkflow process={process} currentDocument={{ type: 'order', id: order.id }} permissions={processPermissions} editingAction={<div id="document-edit-workflow-actions" />} />
          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}
