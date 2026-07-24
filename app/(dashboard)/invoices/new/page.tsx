// app/(dashboard)/invoices/new/page.tsx
import type { Metadata }   from 'next'
import { PageHeader }      from '@/components/shared/PageHeader'
import { InvoiceForm }     from '@/components/invoices/InvoiceForm'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }          from '@/lib/db/prisma'
import { createInvoiceDraftAction } from '../actions'
import { getSettings }     from '@/lib/services/settings.service'

export const metadata: Metadata = { title: 'Neue Rechnung' }

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: { order?: string; customer?: string }
}) {
  await requirePermission(Resource.INVOICE, Action.CREATE)

  const [customers, orders, settings] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, number: true },
    }),
    prisma.order.findMany({
      where: { deletedAt: null, status: { in: ['COMPLETED', 'IN_PROGRESS', 'OPEN'] } },
      orderBy: { orderDate: 'desc' },
      select: { id: true, orderNumber: true, title: true, customerId: true },
    }),
    getSettings(),
  ])

  // If from order, pre-fill customer
  let defaultCustomerId = searchParams.customer
  let defaultOrderId    = searchParams.order

  if (defaultOrderId && !defaultCustomerId) {
    const order = orders.find(o => o.id === defaultOrderId)
    defaultCustomerId = order?.customerId
  }

  return (
    <div>
      <PageHeader
        title="Neue Rechnung"
        breadcrumbs={[{ label: 'Rechnungen', href: '/invoices' }, { label: 'Neu' }]}
      />
      <div className="p-6 max-w-4xl">
        <InvoiceForm
          mode="create"
          customers={customers}
          orders={orders}
          lockCustomer={!!searchParams.order && !!defaultCustomerId}
          lockOrder={!!searchParams.order}
          action={createInvoiceDraftAction}
          defaults={{
            customerId: defaultCustomerId,
            orderId:    defaultOrderId,
            paymentTermDays: String(settings.defaultPaymentTermDays),
            introText:  settings.defaultInvoiceIntro ?? undefined,
            outroText:  settings.defaultInvoiceOutro ?? undefined,
          }}
        />
      </div>
    </div>
  )
}
