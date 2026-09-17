// app/(dashboard)/invoices/[id]/edit/page.tsx — NEW (missing in Phase 9)
// Nur DRAFT-Rechnungen können bearbeitet werden.
// Bei gesperrtem Status: Redirect auf Detailseite.

import type { Metadata }     from 'next'
import { notFound, redirect } from 'next/navigation'
import { InvoiceForm }       from '@/components/invoices/InvoiceForm'
import { InvoiceDocumentHeader } from '@/components/invoices/InvoiceDocumentHeader'
import { getInvoiceById }    from '@/lib/services/invoice-query.service'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { InvoiceStatus }     from '@/types/enums'
import { prisma }            from '@/lib/db/prisma'
import { updateInvoiceDraftAction } from '../../actions'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForInvoice } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'

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
  const user = await requirePermission(Resource.INVOICE, Action.UPDATE)

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
      select:  {
        id: true, name: true, number: true, legalName: true, street: true, houseNumber: true, postalCode: true, city: true, country: true,
        addresses: { where: { type: 'BILLING', deletedAt: null, isActive: true }, orderBy: [{ isDefault: 'desc' }, { label: 'asc' }], include: { address: true } },
      },
    }),
    prisma.order.findMany({
      where:   { deletedAt: null, status: { in: ['COMPLETED', 'IN_PROGRESS', 'OPEN'] } },
      orderBy: { orderDate: 'desc' },
      select:  { id: true, orderNumber: true, title: true },
    }),
  ])

  const customerOptions = customers.map(customer => ({
    ...customer,
    billingAddresses: customer.addresses.map(assignment => ({ ...assignment.address, ...assignment })),
  }))
  const boundAction = updateInvoiceDraftAction.bind(null, invoice.id)
  const [process, processPermissions] = await Promise.all([
    getBusinessProcessForInvoice(invoice.id, user.userId, user.role),
    getBusinessProcessPermissions(),
  ])
  const recipient = invoice.customerSnapshot as Record<string, unknown> | null
  const storedBillingAddressId = snapshotString(recipient, 'billingAddressId')
  const billingAddressIsSelectable = customerOptions.find(customer => customer.id === invoice.customerId)
    ?.billingAddresses.some(address => address.id === storedBillingAddressId)
  const recipientSource = recipient?.recipientSource === 'BILLING'
    ? (billingAddressIsSelectable ? 'BILLING' : 'CUSTOM')
    : recipient?.recipientSource === 'CUSTOM' ? 'CUSTOM' : 'CUSTOMER'

  return (
    <div>
      <InvoiceDocumentHeader
        title={invoice.invoiceNumber ?? 'Rechnungsentwurf'}
        projectTitle={invoice.order?.title ?? 'Rechnung bearbeiten'}
        customer={invoice.customer}
        order={invoice.order}
        offer={invoice.order?.offer}
        serviceReport={invoice.order?.serviceReports[0]}
      />
      <div className="p-4 sm:p-6">
        <BusinessDocumentLayout>
          <div className="min-w-0">
            <InvoiceForm
          mode="edit"
          invoiceId={invoice.id}
          customers={customerOptions}
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
            invoiceRecipientSource: recipientSource,
            billingAddressId: billingAddressIsSelectable ? storedBillingAddressId : undefined,
            recipientName: snapshotString(recipient, 'name'),
            recipientAdditional: snapshotString(recipient, 'additional'),
            recipientStreet: snapshotString(recipient, 'street'),
            recipientHouseNumber: snapshotString(recipient, 'houseNumber'),
            recipientPostalCode: snapshotString(recipient, 'postalCode'),
            recipientCity: snapshotString(recipient, 'city'),
            recipientCountry: snapshotString(recipient, 'country'),
            recipientContactName: snapshotString(recipient, 'contactName'),
            recipientEmail: snapshotString(recipient, 'email'),
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
          <BusinessDocumentSidebar sticky>
            <BusinessProcessWorkflow process={process} currentDocument={{ type: 'invoice', id: invoice.id }} permissions={processPermissions} editingAction={<div id="document-edit-workflow-actions" />} />
          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}

function snapshotString(snapshot: Record<string, unknown> | null, key: string) {
  return typeof snapshot?.[key] === 'string' ? snapshot[key] : undefined
}
