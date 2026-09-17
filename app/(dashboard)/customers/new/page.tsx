// app/(dashboard)/customers/new/page.tsx
import type { Metadata }    from 'next'
import { redirect }         from 'next/navigation'
import { PageHeader }       from '@/components/shared/PageHeader'
import { CustomerForm }     from '@/components/customers/CustomerForm'
import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { createCustomerAction } from '../actions'

export const metadata: Metadata = { title: 'Neuer Kunde' }

export default async function NewCustomerPage() {
  await requirePagePermission(Resource.CUSTOMER, Action.CREATE)

  return (
    <div>
      <PageHeader
        title="Neuer Kunde"
        breadcrumbs={[
          { label: 'Kunden', href: '/customers' },
          { label: 'Neu' },
        ]}
      />

      <div className="p-6 max-w-3xl">
        <CustomerForm mode="create" action={createCustomerAction} />
      </div>
    </div>
  )
}
