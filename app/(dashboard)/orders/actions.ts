'use server'
// app/(dashboard)/orders/actions.ts

import { revalidatePath }   from 'next/cache'
import { redirect }         from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { OrderCreateSchema, OrderUpdateSchema } from '@/lib/validators/order.schema'
import {
  createOrder,
  updateOrder,
  changeOrderStatus,
  deleteOrder,
  removeOrderContentCard,
  markOrderSent,
} from '@/lib/services/order.service'
import type { OrderContentCard } from '@/lib/offers/rich-text'
import type { OrderStatus, RoleName } from '@/types/enums'
import { requireTestDeleteEnabled } from '@/lib/security/test-delete'
import { archiveBusinessDocument } from '@/lib/documents/document-archive.service'
import { ensureCollaborationForOrder } from '@/lib/services/collaboration-handover.service'

export interface ActionState {
  success?:     boolean
  error?:       string
  fieldErrors?: Record<string, string[]>
}

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  const user = session.user as typeof session.user & { role: RoleName }
  return { userId: user.id, userEmail: user.email, role: user.role }
}

function parseItems(formData: FormData) {
  const raw = formData.get('itemsJson')
  if (!raw || typeof raw !== 'string') return []
  try { return JSON.parse(raw) as unknown[] } catch { return [] }
}

// ── CREATE ────────────────────────────────────────────────────

export async function createOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.ORDER, Action.CREATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    customerId:  formData.get('customerId'),
    title:       formData.get('title'),
    description: formData.get('description') || null,
    orderDate:   formData.get('orderDate'),
    startDate:   formData.get('startDate')   || null,
    endDate:     formData.get('endDate')     || null,
    items:       parseItems(formData),
  }

  const result = OrderCreateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder ausfüllen.',
    }
  }

  let orderId: string
  try {
    orderId = await createOrder(result.data, userId, userEmail)
    await archiveBusinessDocument('order', orderId, 'DRAFT', await getActor())
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }

  // Business → Collaboration Handover V1: der Auftrag ist bereits erfolgreich
  // angelegt — ein Fehlschlag hier darf die bereits erfolgreiche Auftrags-
  // anlage nicht rückwirkend als gescheitert melden (siehe collaboration-
  // handover.service.ts). Fehlschläge werden dort auditiert, nicht hier.
  await ensureCollaborationForOrder(orderId, { userId, userEmail })

  revalidatePath('/orders')
  redirect(`/orders/${orderId}`)
}

// ── UPDATE ────────────────────────────────────────────────────

export async function updateOrderAction(
  orderId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.ORDER, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    customerId:  formData.get('customerId'),
    title:       formData.get('title'),
    description: formData.get('description') || null,
    orderDate:   formData.get('orderDate'),
    startDate:   formData.get('startDate')   || null,
    endDate:     formData.get('endDate')     || null,
    items:       parseItems(formData),
  }

  const result = OrderUpdateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder ausfüllen.',
    }
  }

  try {
    await updateOrder(orderId, result.data, userId, userEmail)
    await archiveBusinessDocument('order', orderId, 'DRAFT', await getActor())
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }

  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  redirect(`/orders/${orderId}`)
}

export async function removeOrderContentCardAction(
  orderId: string,
  card: OrderContentCard,
): Promise<ActionState> {
  await requirePermission(Resource.ORDER, Action.UPDATE)
  const { userId, userEmail } = await getActor()
  try {
    await removeOrderContentCard(orderId, card, userId, userEmail)
    revalidatePath('/orders')
    revalidatePath(`/orders/${orderId}`)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Karte konnte nicht entfernt werden' }
  }
}

// ── STATUS CHANGE ─────────────────────────────────────────────

export async function changeOrderStatusAction(
  orderId:  string,
  toStatus: OrderStatus,
): Promise<ActionState> {
  await requirePermission(Resource.ORDER, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  try {
    await changeOrderStatus(orderId, toStatus, userId, userEmail)
    const archive = toStatus === 'COMPLETED' ? await archiveBusinessDocument('order', orderId, 'FINAL', await getActor()) : null
    revalidatePath(`/orders/${orderId}`)
    revalidatePath('/orders')
    return archive?.status === 'failed' ? { success: true, error: `Auftrag abgeschlossen; Archivierung fehlgeschlagen: ${archive.error}` } : { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}

export async function markOrderSentAction(orderId: string): Promise<ActionState> {
  await requirePermission(Resource.ORDER, Action.UPDATE)
  const { userId, userEmail } = await getActor()
  try {
    await markOrderSent(orderId, userId, userEmail)
    revalidatePath(`/orders/${orderId}`)
    revalidatePath('/orders')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Versandstatus konnte nicht gespeichert werden.' }
  }
}

// ── DELETE ────────────────────────────────────────────────────

export async function deleteOrderAction(orderId: string): Promise<ActionState> {
  await requirePermission(Resource.ORDER, Action.DELETE)
  requireTestDeleteEnabled()
  const { userId, userEmail } = await getActor()

  try {
    await deleteOrder(orderId, userId, userEmail)
    revalidatePath('/orders')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}
