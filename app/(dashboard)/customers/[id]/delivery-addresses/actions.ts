'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { Action, requirePermission, Resource } from '@/lib/auth/permissions'
import { CustomerDeliveryAddressSchema } from '@/lib/validators/customer-delivery-address.schema'
import {
  createCustomerDeliveryAddress,
  deleteCustomerDeliveryAddress,
  setCustomerDeliveryAddressActive,
  setDefaultCustomerDeliveryAddress,
  updateCustomerDeliveryAddress,
} from '@/lib/services/customer-delivery-address.service'

export type DeliveryAddressActionState = {
  success?: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

async function actor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  return { userId: session.user.id, userEmail: session.user.email }
}

function parse(formData: FormData) {
  return CustomerDeliveryAddressSchema.safeParse({
    label: formData.get('label'),
    companyName: formData.get('companyName'),
    additional: formData.get('additional') || null,
    street: formData.get('street'),
    houseNumber: formData.get('houseNumber') || null,
    postalCode: formData.get('postalCode'),
    city: formData.get('city'),
    country: formData.get('country') || 'DE',
    contactName: formData.get('contactName') || null,
    email: formData.get('email') || null,
    phone: formData.get('phone') || null,
    isActive: formData.get('isActive') === 'on',
    isDefault: formData.get('isDefault') === 'on',
  })
}

export async function createDeliveryAddressAction(customerId: string, _state: DeliveryAddressActionState, formData: FormData) {
  await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  const result = parse(formData)
  if (!result.success) return { success: false, fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  try {
    await createCustomerDeliveryAddress(customerId, result.data, await actor())
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Lieferadresse konnte nicht angelegt werden.' }
  }
  revalidatePath(`/customers/${customerId}`)
  redirect(`/customers/${customerId}`)
}

export async function updateDeliveryAddressAction(customerId: string, addressId: string, _state: DeliveryAddressActionState, formData: FormData) {
  await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  const result = parse(formData)
  if (!result.success) return { success: false, fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  try {
    await updateCustomerDeliveryAddress(customerId, addressId, result.data, await actor())
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Lieferadresse konnte nicht gespeichert werden.' }
  }
  revalidatePath(`/customers/${customerId}`)
  redirect(`/customers/${customerId}`)
}

export async function setDefaultDeliveryAddressAction(customerId: string, addressId: string): Promise<DeliveryAddressActionState> {
  await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  try {
    await setDefaultCustomerDeliveryAddress(customerId, addressId, await actor())
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Standardadresse konnte nicht gesetzt werden.' }
  }
}

export async function setDeliveryAddressActiveAction(customerId: string, addressId: string, isActive: boolean): Promise<DeliveryAddressActionState> {
  await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  try {
    await setCustomerDeliveryAddressActive(customerId, addressId, isActive, await actor())
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Aktivstatus konnte nicht geändert werden.' }
  }
}

export async function deleteDeliveryAddressAction(customerId: string, addressId: string): Promise<DeliveryAddressActionState> {
  await requirePermission(Resource.CUSTOMER, Action.DELETE)
  try {
    await deleteCustomerDeliveryAddress(customerId, addressId, await actor())
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Lieferadresse konnte nicht gelöscht werden.' }
  }
}
