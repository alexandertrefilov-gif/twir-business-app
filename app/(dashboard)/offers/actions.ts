'use server'
// app/(dashboard)/offers/actions.ts

import { revalidatePath }   from 'next/cache'
import { redirect }         from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { OfferCreateSchema, OfferNumberChangeSchema, OfferUpdateSchema } from '@/lib/validators/offer.schema'
import {
  createOffer,
  updateOffer,
  deleteOffer,
  changeOfferStatus,
  convertOfferToOrder,
  changeOfferNumber,
} from '@/lib/services/offer.service'
import type { OfferStatus } from '@/types/enums'
import type { RoleName } from '@/types/enums'
import { requireTestDeleteEnabled } from '@/lib/security/test-delete'
import { archiveBusinessDocument } from '@/lib/documents/document-archive.service'

export interface ActionState {
  success?:     boolean
  error?:       string
  fieldErrors?: Record<string, string[]>
  redirectTo?:  string
  values?: {
    customerId?: string
  }
}

// ── Session helper ───────────────────────────────────────────

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  const user = session.user as typeof session.user & { role: RoleName }
  return { userId: user.id, userEmail: user.email, role: user.role }
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
    areaName:    formData.get('areaName')    || null,
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
      values: {
        customerId: typeof raw.customerId === 'string' ? raw.customerId : undefined,
      },
    }
  }

  let offerId: string
  try {
    offerId = await createOffer(result.data, userId, userEmail)
    await archiveBusinessDocument('offer', offerId, 'DRAFT', await getActor())
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Fehler beim Anlegen',
      values: {
        customerId: typeof raw.customerId === 'string' ? raw.customerId : undefined,
      },
    }
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
    areaName:    formData.get('areaName')    || null,
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
      values: {
        customerId: typeof raw.customerId === 'string' ? raw.customerId : undefined,
      },
    }
  }

  try {
    await updateOffer(offerId, result.data, userId, userEmail)
    await archiveBusinessDocument('offer', offerId, 'DRAFT', await getActor())
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Fehler beim Speichern',
      values: {
        customerId: typeof raw.customerId === 'string' ? raw.customerId : undefined,
      },
    }
  }

  revalidatePath('/offers')
  revalidatePath(`/offers/${offerId}`)
  redirect(`/offers/${offerId}`)
}

export async function changeOfferNumberAction(
  offerId: string,
  offerNumber: string,
): Promise<ActionState> {
  await requirePermission(Resource.OFFER, Action.UPDATE)
  const { userId, userEmail } = await getActor()
  const result = OfferNumberChangeSchema.safeParse({ offerNumber })
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message ?? 'Angebotsnummer ist ungültig.',
      fieldErrors: result.error.flatten().fieldErrors,
    }
  }

  try {
    await changeOfferNumber(offerId, result.data.offerNumber, userId, userEmail)
    revalidatePath('/offers')
    revalidatePath(`/offers/${offerId}`)
    revalidatePath(`/offers/${offerId}/edit`)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Angebotsnummer konnte nicht geändert werden.' }
  }
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
    const archive = toStatus === 'SENT' ? await archiveBusinessDocument('offer', offerId, 'FINAL', await getActor()) : null
    revalidatePath(`/offers/${offerId}`)
    revalidatePath('/offers')
    return archive?.status === 'failed' ? { success: true, error: `Angebot versendet; Archivierung fehlgeschlagen: ${archive.error}` } : { success: true }
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
  redirect(`/orders/${orderId}/edit`)
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
