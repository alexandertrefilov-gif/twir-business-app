'use server'
// app/(dashboard)/offers/actions.ts

import { revalidatePath }   from 'next/cache'
import { redirect }         from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { OfferCreateSchema, OfferUpdateSchema } from '@/lib/validators/offer.schema'
import {
  createOffer,
  updateOffer,
  deleteOffer,
  changeOfferStatus,
  convertOfferToOrder,
} from '@/lib/services/offer.service'
import type { OfferStatus } from '@/types/enums'
import { requireTestDeleteEnabled } from '@/lib/security/test-delete'

export interface ActionState {
  success?:     boolean
  error?:       string
  fieldErrors?: Record<string, string[]>
  redirectTo?:  string
}

// ── Session helper ───────────────────────────────────────────

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  return { userId: session.user.id, userEmail: session.user.email }
}

// ── Parse items from form ────────────────────────────────────

function parseItems(formData: FormData) {
  const raw = formData.get('itemsJson')
  if (!raw || typeof raw !== 'string') return []
  try {
    return JSON.parse(raw) as unknown[]
  } catch {
    return []
  }
}

// ── CREATE ───────────────────────────────────────────────────

export async function createOfferAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.OFFER, Action.CREATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    customerId:  formData.get('customerId'),
    title:       formData.get('title')      || null,
    introText:   formData.get('introText')  || null,
    outroText:   formData.get('outroText')  || null,
    offerDate:   formData.get('offerDate'),
    validUntil:  formData.get('validUntil') || null,
    items:       parseItems(formData),
  }

  const result = OfferCreateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder ausfüllen.',
    }
  }

  let offerId: string
  try {
    offerId = await createOffer(result.data, userId, userEmail)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Anlegen' }
  }

  revalidatePath('/offers')
  redirect(`/offers/${offerId}`)
}

// ── UPDATE ───────────────────────────────────────────────────

export async function updateOfferAction(
  offerId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.OFFER, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    customerId:  formData.get('customerId'),
    title:       formData.get('title')      || null,
    introText:   formData.get('introText')  || null,
    outroText:   formData.get('outroText')  || null,
    offerDate:   formData.get('offerDate'),
    validUntil:  formData.get('validUntil') || null,
    items:       parseItems(formData),
  }

  const result = OfferUpdateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder ausfüllen.',
    }
  }

  try {
    await updateOffer(offerId, result.data, userId, userEmail)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Speichern' }
  }

  revalidatePath('/offers')
  revalidatePath(`/offers/${offerId}`)
  redirect(`/offers/${offerId}`)
}

// ── STATUS CHANGE ─────────────────────────────────────────────

export async function changeOfferStatusAction(
  offerId:  string,
  toStatus: OfferStatus,
): Promise<ActionState> {
  await requirePermission(Resource.OFFER, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  try {
    await changeOfferStatus(offerId, toStatus, userId, userEmail)
    revalidatePath(`/offers/${offerId}`)
    revalidatePath('/offers')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Statuswechsel fehlgeschlagen' }
  }
}

// ── CONVERT TO ORDER ─────────────────────────────────────────

export async function convertToOrderAction(offerId: string): Promise<ActionState> {
  await requirePermission(Resource.ORDER, Action.CREATE)
  const { userId, userEmail } = await getActor()

  let orderId: string
  try {
    orderId = await convertOfferToOrder(offerId, userId, userEmail)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Umwandlung fehlgeschlagen' }
  }

  revalidatePath('/offers')
  revalidatePath(`/offers/${offerId}`)
  revalidatePath('/orders')
  redirect(`/orders/${orderId}`)
}

// ── DELETE ───────────────────────────────────────────────────

export async function deleteOfferAction(offerId: string): Promise<ActionState> {
  await requirePermission(Resource.OFFER, Action.DELETE)
  requireTestDeleteEnabled()
  const { userId, userEmail } = await getActor()

  try {
    await deleteOffer(offerId, userId, userEmail)
    revalidatePath('/offers')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Löschen' }
  }
}
