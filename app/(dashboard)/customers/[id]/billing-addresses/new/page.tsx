import { PageHeader } from '@/components/shared/PageHeader'
import { CustomerBillingAddressForm } from '@/components/customers/CustomerBillingAddressForm'
import { Action, requirePagePermission, Resource } from '@/lib/auth/permissions'
import { getCustomerById } from '@/lib/services/customer.service'
import { createBillingAddressAction } from '../actions'

export default async function NewBillingAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePagePermission(Resource.CUSTOMER, Action.UPDATE)
  const customer = await getCustomerById(id)
  return <div><PageHeader title="Rechnungsadresse anlegen" breadcrumbs={[{ label: 'Kunden', href: '/customers' }, { label: customer.name, href: `/customers/${id}` }, { label: 'Neue Rechnungsadresse' }]} /><div className="mx-auto max-w-3xl p-6"><CustomerBillingAddressForm mode="create" action={createBillingAddressAction.bind(null, id)} /></div></div>
}
