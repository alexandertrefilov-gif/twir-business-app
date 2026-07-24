// app/(dashboard)/invoices/[id]/edit/page.tsx — NEW (missing in Phase 9)
// Nur DRAFT-Rechnungen können bearbeitet werden.
// Bei gesperrtem Status: Redirect auf Detailseite.

import type { Metadata }     from 'next'
import { notFound, redirect } from 'next/navigation'
import { PageHeader }        from '@/components/shared/PageHeader'
import { InvoiceForm }       from '@/components/invoices/InvoiceForm'
import { getInvoiceById }    from '@/lib/services/invoice-query.service'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { InvoiceStatus }     from '@/types/enums'
import { prisma }            from '@/lib/db/prisma'
import { updateInvoiceDraftAction } from '../../actions'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  await requirePermission(Resource.INVOICE, Action.READ)

  try {
    const inv = await getInvoiceById(id)
    return { title: `${inv.invoiceNumber ?? 'Entwurf'} bearbeiten` }
  } catch { return { title: 'Rechnung bearbeiten' } }
}

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePermission(Resource.INVOICE, Action.UPDATE)

  let invoice
  try { invoice = await getInvoiceById(id) }
  catch { notFound() }

  // Guard: nur DRAFT editierbar
  if (invoice.status !== InvoiceStatus.DRAFT) {
    redirect(`/invoices/${invoice.id}`)
  }

  const [customers, orders] = await Promise.all([
    prisma.customer.findMany({
      where:   { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select:  { id: true, name: true, number: true },
    }),
    prisma.order.findMany({
      where:   { deletedAt: null, status: { in: ['COMPLETED', 'IN_PROGRESS', 'OPEN'] } },
      orderBy: { orderDate: 'desc' },
      select:  { id: true, orderNumber: true, title: true },
    }),
  ])

  const boundAction = updateInvoiceDraftAction.bind(null, invoice.id)

  return (
    <div>
      <PageHeader
        title={`${invoice.invoiceNumber ?? 'Entwurf'} bearbeiten`}
        breadcrumbs={[
          { label: 'Rechnungen', href: '/invoices' },
          { label: invoice.invoiceNumber ?? 'Entwurf', href: `/invoices/${invoice.id}` },
          { label: 'Bearbeiten' },
        ]}
      />
      <div className="p-6 max-w-4xl">
        <InvoiceForm
          mode="edit"
          customers={customers}
          orders={orders}
          lockCustomer={!!invoice.orderId}
          lockOrder={!!invoice.orderId}
          action={boundAction}
          defaults={{
            customerId:     invoice.customerId,
            orderId:        invoice.orderId ?? undefined,
            invoiceDate:    invoice.invoiceDate.toISOString().slice(0, 10),
            dueDate:        invoice.dueDate?.toISOString().slice(0, 10),
            deliveryDate:   invoice.deliveryDate?.toISOString().slice(0, 10),
            paymentTermDays: invoice.paymentTermDays
              ? String(invoice.paymentTermDays)
              : undefined,
            introText:  invoice.introText  ?? undefined,
            outroText:  invoice.outroText  ?? undefined,
            items: invoice.items.map((item) => ({
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
