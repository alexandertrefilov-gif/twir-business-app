'use server'
// app/(dashboard)/customers/actions.ts

import { revalidatePath }     from 'next/cache'
import { redirect }           from 'next/navigation'
import { getServerSession }   from 'next-auth'
import { authOptions }        from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { CustomerCreateSchema, CustomerUpdateSchema } from '@/lib/validators/customer.schema'
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '@/lib/services/customer.service'
import { requireTestDeleteEnabled } from '@/lib/security/test-delete'

// ── Shared session helper ────────────────────────────────────

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  return { userId: session.user.id, userEmail: session.user.email }
}

// ── CREATE ───────────────────────────────────────────────────

export async function createCustomerAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.CUSTOMER, Action.CREATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    name:        formData.get('name'),
    legalName:   formData.get('legalName')   || null,
    legalForm:   formData.get('legalForm')   || null,
    contactSalutation: formData.get('contactSalutation') || null,
    contactFirstName:  formData.get('contactFirstName')  || null,
    contactLastName:   formData.get('contactLastName')   || null,
    contactDepartment: formData.get('contactDepartment') || null,
    vatId:       formData.get('vatId')       || null,
    taxNumber:   formData.get('taxNumber')   || null,
    street:      formData.get('street')      || null,
    houseNumber: formData.get('houseNumber') || null,
    postalCode:  formData.get('postalCode')  || null,
    city:        formData.get('city')        || null,
    country:     formData.get('country')     || 'DE',
    email:       formData.get('email')       || null,
    phone:       formData.get('phone')       || null,
    fax:         formData.get('fax')         || null,
    website:     formData.get('website')     || null,
    notes:       formData.get('notes')       || null,
  }

  const result = CustomerCreateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  let id: string
  try {
    id = await createCustomer(result.data, userId, userEmail)
    revalidatePath('/customers')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return { success: false, error: msg }
  }

  redirect(`/customers/${id}`)
}

// ── UPDATE ───────────────────────────────────────────────────

export async function updateCustomerAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.CUSTOMER, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    name:        formData.get('name'),
    legalName:   formData.get('legalName')   || null,
    legalForm:   formData.get('legalForm')   || null,
    contactSalutation: formData.get('contactSalutation') || null,
    contactFirstName:  formData.get('contactFirstName')  || null,
    contactLastName:   formData.get('contactLastName')   || null,
    contactDepartment: formData.get('contactDepartment') || null,
    vatId:       formData.get('vatId')       || null,
    taxNumber:   formData.get('taxNumber')   || null,
    street:      formData.get('street')      || null,
    houseNumber: formData.get('houseNumber') || null,
    postalCode:  formData.get('postalCode')  || null,
    city:        formData.get('city')        || null,
    country:     formData.get('country')     || 'DE',
    email:       formData.get('email')       || null,
    phone:       formData.get('phone')       || null,
    fax:         formData.get('fax')         || null,
    website:     formData.get('website')     || null,
    notes:       formData.get('notes')       || null,
  }

  const result = CustomerUpdateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  try {
    await updateCustomer(id, result.data, userId, userEmail)
    revalidatePath('/customers')
    revalidatePath(`/customers/${id}`)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return { success: false, error: msg }
  }

  redirect(`/customers/${id}`)
}

// ── DELETE ───────────────────────────────────────────────────

export async function deleteCustomerAction(id: string): Promise<ActionState> {
  await requirePermission(Resource.CUSTOMER, Action.DELETE)
  requireTestDeleteEnabled()
  const { userId, userEmail } = await getActor()

  try {
    await deleteCustomer(id, userId, userEmail)
    revalidatePath('/customers')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return { success: false, error: msg }
  }
}

// ── Types ────────────────────────────────────────────────────

export interface ActionState {
  success?:    boolean
  error?:      string
  fieldErrors?: Record<string, string[]>
}
