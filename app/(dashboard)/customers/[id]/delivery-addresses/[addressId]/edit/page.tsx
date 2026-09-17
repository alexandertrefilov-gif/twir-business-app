import { PageHeader } from '@/components/shared/PageHeader'
import { CustomerDeliveryAddressForm } from '@/components/customers/CustomerDeliveryAddressForm'
import { Action, requirePagePermission, Resource } from '@/lib/auth/permissions'
import { getCustomerById } from '@/lib/services/customer.service'
import { getCustomerDeliveryAddress } from '@/lib/services/customer-delivery-address.service'
import { getAddressCoUsers } from '@/lib/services/customer-address.service'
import { updateDeliveryAddressAction } from '../../actions'

export default async function EditDeliveryAddressPage({ params }: { params: Promise<{ id: string; addressId: string }> }) {
  const { id, addressId } = await params
  await requirePagePermission(Resource.CUSTOMER, Action.UPDATE)
  const [customer, address] = await Promise.all([getCustomerById(id), getCustomerDeliveryAddress(id, addressId)])
  const sharedWith = await getAddressCoUsers(address.addressId, id)
  const defaults = {
    label: address.label, companyName: address.companyName, additional: address.additional ?? undefined,
    street: address.street, houseNumber: address.houseNumber ?? undefined, postalCode: address.postalCode,
    city: address.city, country: address.country, contactName: address.contactName ?? undefined,
    email: address.email ?? undefined, phone: address.phone ?? undefined,
    isActive: address.isActive, isDefault: address.isDefault,
  }
  return <div><PageHeader title="Lieferadresse bearbeiten" breadcrumbs={[{ label: 'Kunden', href: '/customers' }, { label: customer.name, href: `/customers/${id}` }, { label: address.label }]} /><div className="mx-auto max-w-3xl p-6"><CustomerDeliveryAddressForm mode="edit" defaults={defaults} sharedWith={sharedWith} action={updateDeliveryAddressAction.bind(null, id, addressId)} /></div></div>
}
