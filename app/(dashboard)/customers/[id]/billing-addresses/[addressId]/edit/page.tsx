import { PageHeader } from '@/components/shared/PageHeader'
import { CustomerBillingAddressForm } from '@/components/customers/CustomerBillingAddressForm'
import { Action, requirePagePermission, Resource } from '@/lib/auth/permissions'
import { getCustomerById } from '@/lib/services/customer.service'
import { getCustomerBillingAddress } from '@/lib/services/customer-billing-address.service'
import { getAddressCoUsers } from '@/lib/services/customer-address.service'
import { updateBillingAddressAction } from '../../actions'

export default async function EditBillingAddressPage({ params }: { params: Promise<{ id: string; addressId: string }> }) {
  const { id, addressId } = await params
  await requirePagePermission(Resource.CUSTOMER, Action.UPDATE)
  const [customer, address] = await Promise.all([getCustomerById(id), getCustomerBillingAddress(id, addressId)])
  const sharedWith = await getAddressCoUsers(address.addressId, id)
  const defaults = {
    label: address.label, companyName: address.companyName, additional: address.additional ?? undefined,
    street: address.street, houseNumber: address.houseNumber ?? undefined, postalCode: address.postalCode,
    city: address.city, country: address.country, contactName: address.contactName ?? undefined,
    email: address.email ?? undefined, isActive: address.isActive, isDefault: address.isDefault,
  }
  return <div><PageHeader title="Rechnungsadresse bearbeiten" breadcrumbs={[{ label: 'Kunden', href: '/customers' }, { label: customer.name, href: `/customers/${id}` }, { label: address.label }]} /><div className="mx-auto max-w-3xl p-6"><CustomerBillingAddressForm mode="edit" defaults={defaults} sharedWith={sharedWith} action={updateBillingAddressAction.bind(null, id, addressId)} /></div></div>
}
