'use server'
// app/(dashboard)/payments/actions.ts

import { revalidatePath }   from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { PaymentCreateSchema } from '@/lib/validators/payment.schema'
import { addPayment, removePayment } from '@/lib/services/payment.service'
import { createDunningNotice, markDunningNoticeSent } from '@/lib/services/dunning.service'
import { z } from 'zod'

export interface ActionState {
  success?: boolean
  error?:   string
  fieldErrors?: Record<string, string[]>
}

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  return { userId: session.user.id, userEmail: session.user.email }
}

// ── ADD PAYMENT ───────────────────────────────────────────────

export async function addPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.PAYMENT, Action.CREATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    invoiceId:   formData.get('invoiceId'),
    amount:      parseFloat(formData.get('amount') as string),
    paymentDate: formData.get('paymentDate'),
    method:      formData.get('method')    || null,
    reference:   formData.get('reference') || null,
    notes:       formData.get('notes')     || null,
  }

  const result = PaymentCreateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder ausfüllen.',
    }
  }

  try {
    await addPayment(result.data, userId, userEmail)
    revalidatePath(`/invoices/${result.data.invoiceId}`)
    revalidatePath('/payments')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}

// ── REMOVE PAYMENT ────────────────────────────────────────────

export async function removePaymentAction(
  paymentId: string,
  reason:    string,
): Promise<ActionState> {
  await requirePermission(Resource.PAYMENT, Action.DELETE)
  const { userId, userEmail } = await getActor()

  try {
    await removePayment(paymentId, reason, userId, userEmail)
    revalidatePath('/payments')
    revalidatePath('/invoices')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}

// ── CREATE DUNNING ────────────────────────────────────────────

const DunningSchema = z.object({
  invoiceId: z.string().uuid(),
  level:     z.coerce.number().int().min(1).max(3) as z.ZodType<1 | 2 | 3>,
  dueDate:   z.coerce.date(),
  fee:       z.coerce.number().optional().nullable(),
})

export async function createDunningAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    invoiceId: formData.get('invoiceId'),
    level:     formData.get('level'),
    dueDate:   formData.get('dueDate'),
    fee:       formData.get('fee') || null,
  }

  const result = DunningSchema.safeParse(raw)
  if (!result.success) {
    return { success: false, error: 'Ungültige Eingaben für Mahnung.' }
  }

  try {
    await createDunningNotice(result.data, userId, userEmail)
    revalidatePath(`/invoices/${result.data.invoiceId}`)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}

// ── MARK DUNNING SENT ─────────────────────────────────────────

export async function markDunningNoticeSentAction(
  noticeId: string,
  pdfPath:  string | null,
): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  try {
    await markDunningNoticeSent(noticeId, pdfPath, userId, userEmail)
    revalidatePath('/invoices')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}
