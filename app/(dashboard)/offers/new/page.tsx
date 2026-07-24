// app/(dashboard)/offers/new/page.tsx
import type { Metadata }   from 'next'
import { PageHeader }      from '@/components/shared/PageHeader'
import { OfferForm }       from '@/components/offers/OfferForm'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }          from '@/lib/db/prisma'
import { createOfferAction } from '../actions'

export const metadata: Metadata = { title: 'Neues Angebot' }

export default async function NewOfferPage({
  searchParams,
}: {
  searchParams: { customer?: string }
}) {
  await requirePermission(Resource.OFFER, Action.CREATE)

  const customers = await prisma.customer.findMany({
    where:   { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select:  { id: true, name: true, number: true },
  })

  return (
    <div>
      <PageHeader
        title="Neues Angebot"
        breadcrumbs={[
          { label: 'Angebote', href: '/offers' },
          { label: 'Neu' },
        ]}
      />
      <div className="p-6 max-w-4xl">
        <OfferForm
          mode="create"
          customers={customers}
          defaults={{
            customerId: searchParams.customer,
          }}
          action={createOfferAction}
        />
      </div>
    </div>
  )
}
