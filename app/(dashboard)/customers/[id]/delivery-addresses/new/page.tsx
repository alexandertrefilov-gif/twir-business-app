import { PageHeader } from '@/components/shared/PageHeader'
import { CustomerDeliveryAddressForm } from '@/components/customers/CustomerDeliveryAddressForm'
import { Action, requirePagePermission, Resource } from '@/lib/auth/permissions'
import { getCustomerById } from '@/lib/services/customer.service'
import { createDeliveryAddressAction } from '../actions'

export default async function NewDeliveryAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePagePermission(Resource.CUSTOMER, Action.UPDATE)
  const customer = await getCustomerById(id)
  return <div><PageHeader title="Lieferadresse anlegen" breadcrumbs={[{ label: 'Kunden', href: '/customers' }, { label: customer.name, href: `/customers/${id}` }, { label: 'Neue Lieferadresse' }]} /><div className="mx-auto max-w-3xl p-6"><CustomerDeliveryAddressForm mode="create" action={createDeliveryAddressAction.bind(null, id)} /></div></div>
}
