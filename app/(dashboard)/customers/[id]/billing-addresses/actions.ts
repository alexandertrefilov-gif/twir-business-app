'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { Action, requirePermission, Resource } from '@/lib/auth/permissions'
import { CustomerBillingAddressSchema } from '@/lib/validators/customer-billing-address.schema'
import {
  createCustomerBillingAddress,
  deleteCustomerBillingAddress,
  setDefaultCustomerBillingAddress,
  updateCustomerBillingAddress,
} from '@/lib/services/customer-billing-address.service'

export type BillingAddressActionState = {
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
  return CustomerBillingAddressSchema.safeParse({
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
    isActive: formData.get('isActive') === 'on',
    isDefault: formData.get('isDefault') === 'on',
  })
}

export async function createBillingAddressAction(customerId: string, _state: BillingAddressActionState, formData: FormData) {
  await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  const result = parse(formData)
  if (!result.success) return { success: false, fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  try {
    await createCustomerBillingAddress(customerId, result.data, await actor())
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Rechnungsadresse konnte nicht angelegt werden.' }
  }
  revalidatePath(`/customers/${customerId}`)
  redirect(`/customers/${customerId}`)
}

export async function updateBillingAddressAction(customerId: string, addressId: string, _state: BillingAddressActionState, formData: FormData) {
  await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  const result = parse(formData)
  if (!result.success) return { success: false, fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  try {
    await updateCustomerBillingAddress(customerId, addressId, result.data, await actor())
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Rechnungsadresse konnte nicht gespeichert werden.' }
  }
  revalidatePath(`/customers/${customerId}`)
  redirect(`/customers/${customerId}`)
}

export async function setDefaultBillingAddressAction(customerId: string, addressId: string): Promise<BillingAddressActionState> {
  await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  try {
    await setDefaultCustomerBillingAddress(customerId, addressId, await actor())
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Standardadresse konnte nicht gesetzt werden.' }
  }
}

export async function deleteBillingAddressAction(customerId: string, addressId: string): Promise<BillingAddressActionState> {
  await requirePermission(Resource.CUSTOMER, Action.DELETE)
  try {
    await deleteCustomerBillingAddress(customerId, addressId, await actor())
    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Rechnungsadresse konnte nicht gelöscht werden.' }
  }
}
