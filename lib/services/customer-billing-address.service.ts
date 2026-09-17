import type { CustomerBillingAddressInput } from '@/lib/validators/customer-billing-address.schema'
import { createAndAssignCustomerAddress, getCustomerAddress, removeCustomerAddress, setDefaultCustomerAddress, updateCustomerAddress } from './customer-address.service'

type Actor = { userId: string; userEmail: string }

export const getCustomerBillingAddress = (customerId: string, addressId: string) => getCustomerAddress(customerId, addressId, 'BILLING')
export const createCustomerBillingAddress = (customerId: string, input: CustomerBillingAddressInput, actor: Actor) => createAndAssignCustomerAddress(customerId, 'BILLING', input, actor)
export const updateCustomerBillingAddress = (customerId: string, addressId: string, input: CustomerBillingAddressInput, actor: Actor) => updateCustomerAddress(customerId, addressId, 'BILLING', input, actor)
export const setDefaultCustomerBillingAddress = (customerId: string, addressId: string, actor: Actor) => setDefaultCustomerAddress(customerId, addressId, 'BILLING', actor)
export const deleteCustomerBillingAddress = (customerId: string, addressId: string, actor: Actor) => removeCustomerAddress(customerId, addressId, 'BILLING', actor)
