'use server'

import { revalidatePath } from 'next/cache'
import { Action, requirePermission, Resource } from '@/lib/auth/permissions'
import { AddressDataSchema, AddressSearchSchema, CustomerAddressInputSchema, CustomerAddressTypeSchema } from '@/lib/validators/customer-address.schema'
import { assignExistingCustomerAddress, createAndAssignCustomerAddress, findDuplicateAddress, searchAddresses } from '@/lib/services/customer-address.service'

export type AddressPickerResult = { success: boolean; error?: string; duplicate?: AddressResult; results?: AddressResult[] }
export type AddressResult = { id: string; companyName: string; additional: string | null; street: string; houseNumber: string | null; postalCode: string; city: string; country: string; usedBy?: string[] }

const addressResult = (address: Awaited<ReturnType<typeof searchAddresses>>[number]): AddressResult => ({
  id: address.id, companyName: address.companyName, additional: address.additional, street: address.street,
  houseNumber: address.houseNumber, postalCode: address.postalCode, city: address.city, country: address.country,
  usedBy: 'customerAddresses' in address ? address.customerAddresses.map(item => `${item.customer.number} · ${item.customer.name}`) : undefined,
})

function parseInput(formData: FormData) {
  return CustomerAddressInputSchema.safeParse({
    label: formData.get('label'), companyName: formData.get('companyName'), additional: formData.get('additional') || null,
    street: formData.get('street'), houseNumber: formData.get('houseNumber') || null, postalCode: formData.get('postalCode'),
    city: formData.get('city'), country: formData.get('country') || 'DE', contactName: formData.get('contactName') || null,
    email: formData.get('email') || null, phone: formData.get('phone') || null, isActive: true, isDefault: false,
  })
}

export async function searchCustomerAddressesAction(query: string): Promise<AddressPickerResult> {
  await requirePermission(Resource.CUSTOMER, Action.READ)
  const parsed = AddressSearchSchema.safeParse(query)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message }
  const results = await searchAddresses(parsed.data)
  return { success: true, results: results.map(addressResult) }
}

export async function assignCustomerAddressAction(customerId: string, addressId: string, typeValue: string, label: string): Promise<AddressPickerResult> {
  const actor = await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  const type = CustomerAddressTypeSchema.safeParse(typeValue)
  if (!type.success || !label.trim()) return { success: false, error: 'Bezeichnung oder Adresstyp ist ungültig.' }
  try {
    await assignExistingCustomerAddress(customerId, addressId, type.data, label.trim(), actor)
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Adresse konnte nicht zugeordnet werden.' }
  }
}

export async function createCustomerAddressAction(customerId: string, typeValue: string, formData: FormData): Promise<AddressPickerResult> {
  const actor = await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  const type = CustomerAddressTypeSchema.safeParse(typeValue)
  const input = parseInput(formData)
  if (!type.success || !input.success) return { success: false, error: input.success ? 'Adresstyp ist ungültig.' : input.error.issues[0]?.message }
  const addressData = AddressDataSchema.parse(input.data)
  const duplicate = await findDuplicateAddress(addressData)
  if (duplicate) return { success: false, error: 'Eine wahrscheinlich identische Adresse ist bereits vorhanden.', duplicate: addressResult({ ...duplicate, customerAddresses: [] }) }
  try {
    await createAndAssignCustomerAddress(customerId, type.data, input.data, actor)
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Adresse konnte nicht angelegt werden.' }
  }
}
