// app/(dashboard)/orders/new/page.tsx
import type { Metadata }  from 'next'
import { PageHeader }     from '@/components/shared/PageHeader'
import { OrderForm }      from '@/components/orders/OrderForm'
import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }         from '@/lib/db/prisma'
import { createOrderAction } from '../actions'
import { BusinessDocumentLayout, BusinessDocumentSidebar, BusinessWorkflowPlaceholder } from '@/components/documents/BusinessDocumentLayout'
import { DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID } from '@/components/documents/DocumentFormWorkflowActions'

export const metadata: Metadata = { title: 'Neuer Auftrag' }

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const query = await searchParams
  await requirePagePermission(Resource.ORDER, Action.CREATE)

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, number: true },
  })

  return (
    <div>
      <PageHeader
        sticky
        title="Neuer Auftrag"
        breadcrumbs={[{ label: 'Aufträge', href: '/orders' }, { label: 'Neu' }]}
      />
      <div className="p-4 sm:p-6">
        <BusinessDocumentLayout>
          <div className="min-w-0">
            <OrderForm
              mode="create"
              customers={customers}
              defaults={{ customerId: query.customer }}
              action={createOrderAction}
            />
          </div>
          <BusinessDocumentSidebar sticky>
            <BusinessWorkflowPlaceholder message="Der Geschäftsvorgang wird nach dem Anlegen des Auftrags angezeigt.">
              <p className="mb-3 text-sm font-600 text-foreground">Status: Neuer Auftrag</p>
              <div id={DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID} />
            </BusinessWorkflowPlaceholder>
          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}
