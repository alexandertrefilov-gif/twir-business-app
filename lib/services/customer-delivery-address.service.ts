import type { CustomerDeliveryAddressInput } from '@/lib/validators/customer-delivery-address.schema'
import { createAndAssignCustomerAddress, getCustomerAddress, removeCustomerAddress, setCustomerAddressActive, setDefaultCustomerAddress, updateCustomerAddress } from './customer-address.service'

type Actor = { userId: string; userEmail: string }

export const getCustomerDeliveryAddress = (customerId: string, addressId: string) => getCustomerAddress(customerId, addressId, 'SHIPPING')
export const createCustomerDeliveryAddress = (customerId: string, input: CustomerDeliveryAddressInput, actor: Actor) => createAndAssignCustomerAddress(customerId, 'SHIPPING', input, actor)
export const updateCustomerDeliveryAddress = (customerId: string, addressId: string, input: CustomerDeliveryAddressInput, actor: Actor) => updateCustomerAddress(customerId, addressId, 'SHIPPING', input, actor)
export const setDefaultCustomerDeliveryAddress = (customerId: string, addressId: string, actor: Actor) => setDefaultCustomerAddress(customerId, addressId, 'SHIPPING', actor)
export const setCustomerDeliveryAddressActive = (customerId: string, addressId: string, isActive: boolean, actor: Actor) => setCustomerAddressActive(customerId, addressId, 'SHIPPING', isActive, actor)
export const deleteCustomerDeliveryAddress = (customerId: string, addressId: string, actor: Actor) => removeCustomerAddress(customerId, addressId, 'SHIPPING', actor)
