// app/(dashboard)/invoices/new/page.tsx
import type { Metadata }   from 'next'
import { InvoiceForm }     from '@/components/invoices/InvoiceForm'
import { InvoiceDocumentHeader } from '@/components/invoices/InvoiceDocumentHeader'
import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }          from '@/lib/db/prisma'
import { createInvoiceDraftAction } from '../actions'
import { getSettings }     from '@/lib/services/settings.service'
import { BusinessDocumentLayout, BusinessDocumentSidebar, BusinessWorkflowPlaceholder } from '@/components/documents/BusinessDocumentLayout'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForOrder } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'
import { copyDocumentTextModules } from '@/lib/offers/rich-text'
import { DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID } from '@/components/documents/DocumentFormWorkflowActions'
import { SERVICE_REPORT_READY_FOR_INVOICE_WHERE } from '@/lib/workflow/invoice-eligibility'

export const metadata: Metadata = { title: 'Neue Rechnung' }

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; customer?: string }>
}) {
  const query = await searchParams
  const user = await requirePagePermission(Resource.INVOICE, Action.CREATE)

  const [customers, orders, settings] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, number: true, legalName: true, street: true, houseNumber: true, postalCode: true, city: true, country: true,
        addresses: { where: { type: 'BILLING', deletedAt: null, isActive: true }, orderBy: [{ isDefault: 'desc' }, { label: 'asc' }], include: { address: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { in: ['COMPLETED', 'IN_PROGRESS', 'OPEN'] },
        serviceReports: { some: SERVICE_REPORT_READY_FOR_INVOICE_WHERE },
      },
      orderBy: { orderDate: 'desc' },
      select: {
        id: true, orderNumber: true, title: true, customerId: true,
        customer: { select: { id: true, name: true, street: true, houseNumber: true, postalCode: true, city: true } },
        offer: { select: { id: true, offerNumber: true } },
        serviceReports: {
          // Das aktuelle Modell erlaubt genau einen Leistungsnachweis je Auftrag.
          // Für vor dem Unique-Constraint entstandene Legacy-Dubletten verwenden
          // wir deterministisch den zuletzt erfassten Stand statt gar keinen.
          orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }], take: 1,
          select: { id: true, reportNumber: true, reportDate: true, description: true, items: { orderBy: { position: 'asc' }, select: { id: true, description: true, quantity: true, unit: true, netAmount: true, taxRate: true } } },
        },
      },
    }),
    getSettings(),
  ])

  const customerOptions = customers.map(customer => ({
    ...customer,
    billingAddresses: customer.addresses.map(assignment => ({ ...assignment.address, ...assignment })),
  }))

  // If from order, pre-fill customer
  let defaultCustomerId = query.customer
  let defaultOrderId    = query.order

  if (defaultOrderId && !defaultCustomerId) {
    const order = orders.find(o => o.id === defaultOrderId)
    defaultCustomerId = order?.customerId
  }

  const selectedOrderId = defaultOrderId && orders.some((order) => order.id === defaultOrderId) ? defaultOrderId : null
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null
  const selectedCustomer = selectedOrder?.customer ?? customerOptions.find((customer) => customer.id === defaultCustomerId) ?? null
  const [process, processPermissions] = await Promise.all([
    selectedOrderId ? getBusinessProcessForOrder(selectedOrderId, user.userId, user.role) : null,
    getBusinessProcessPermissions(),
  ])
  const serviceReport = selectedOrder?.serviceReports[0] ?? null
  const reportItems = serviceReport?.items.map((item) => ({
    _key: item.id,
    description: item.description,
    quantity: item.quantity.toString(),
    unit: item.unit,
    unitPrice: item.quantity.isZero() ? '0' : item.netAmount.dividedBy(item.quantity).toString(),
    taxRate: item.taxRate.toString(),
  }))

  return (
    <div>
      <InvoiceDocumentHeader
        title="Neue Rechnung"
        projectTitle={selectedOrder?.title ?? 'Rechnung'}
        customer={selectedCustomer}
        order={selectedOrder}
        offer={selectedOrder?.offer}
        serviceReport={serviceReport}
      />
      <div className="p-4 sm:p-6">
        <BusinessDocumentLayout>
          <div className="min-w-0">
            <InvoiceForm
          mode="create"
          customers={customerOptions}
          orders={orders}
          lockCustomer={!!query.order && !!defaultCustomerId}
          lockOrder={!!query.order}
          action={createInvoiceDraftAction}
          defaults={{
            customerId: defaultCustomerId,
            orderId:    defaultOrderId,
            deliveryDate: serviceReport?.reportDate.toISOString().slice(0, 10),
            paymentTermDays: String(settings.defaultPaymentTermDays),
            introText:  copyDocumentTextModules(serviceReport?.description) ?? settings.defaultInvoiceIntro ?? undefined,
            outroText:  settings.defaultInvoiceOutro ?? undefined,
            items: reportItems,
          }}
            />
          </div>
          <BusinessDocumentSidebar sticky>
            {process ? (
              <BusinessProcessWorkflow process={process} currentDocument={{ type: 'invoice', id: 'new' }} activeStage="invoice" permissions={processPermissions} editingAction={<div id={DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID} />} />
            ) : (
              <BusinessWorkflowPlaceholder message="Wählen Sie optional einen Auftrag aus. Freie Rechnungen besitzen keine Auftragskette.">
                <p className="mb-3 text-sm font-600 text-foreground">Status: Neuer Entwurf</p>
                <div id={DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID} />
              </BusinessWorkflowPlaceholder>
            )}
          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}
