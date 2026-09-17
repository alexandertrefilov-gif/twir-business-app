// app/(dashboard)/customers/[id]/edit/page.tsx
import type { Metadata }   from 'next'
import { notFound }        from 'next/navigation'
import { PageHeader }      from '@/components/shared/PageHeader'
import { CustomerForm }    from '@/components/customers/CustomerForm'
import { getCustomerById } from '@/lib/services/customer.service'
import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { updateCustomerAction } from '../../actions'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  await requirePagePermission(Resource.CUSTOMER, Action.READ)

  try {
    const c = await getCustomerById(id)
    return { title: `${c.name} bearbeiten` }
  } catch {
    return { title: 'Kunde bearbeiten' }
  }
}

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePagePermission(Resource.CUSTOMER, Action.UPDATE)

  let customer
  try {
    customer = await getCustomerById(id)
  } catch {
    notFound()
  }

  const primaryContact = customer.contacts.find((contact) => contact.isPrimary) ??
    customer.contacts[0]

  // Bind customer ID to the action
  const boundAction = updateCustomerAction.bind(null, customer.id)

  return (
    <div>
      <PageHeader
        title={`${customer.name} bearbeiten`}
        breadcrumbs={[
          { label: 'Kunden', href: '/customers' },
          { label: customer.name, href: `/customers/${customer.id}` },
          { label: 'Bearbeiten' },
        ]}
      />

      <div className="p-6 max-w-3xl">
        <CustomerForm
          mode="edit"
          customerId={customer.id}
          action={boundAction}
          defaults={{
            name:        customer.name,
            legalName:   customer.legalName   ?? undefined,
            legalForm:   customer.legalForm   ?? undefined,
            contactSalutation: primaryContact?.salutation ?? undefined,
            contactFirstName:  primaryContact?.firstName  ?? undefined,
            contactLastName:   primaryContact?.lastName   ?? undefined,
            contactDepartment: primaryContact?.position   ?? undefined,
            vatId:       customer.vatId       ?? undefined,
            taxNumber:   customer.taxNumber   ?? undefined,
            street:      customer.street      ?? undefined,
            houseNumber: customer.houseNumber ?? undefined,
            postalCode:  customer.postalCode  ?? undefined,
            city:        customer.city        ?? undefined,
            country:     customer.country,
            email:       customer.email       ?? undefined,
            phone:       customer.phone       ?? undefined,
            fax:         customer.fax         ?? undefined,
            website:     customer.website     ?? undefined,
            notes:       customer.notes       ?? undefined,
          }}
        />
      </div>
    </div>
  )
}
