'use server'
// app/(dashboard)/invoices/actions.ts
// Nutzt:
//   createInvoiceDraft, finalizeInvoice, cancelInvoice  (invoice.service.ts — Phase 2)
//   InvoiceDraftSchema (invoice.schema.ts — Phase 9)
//   requirePermission, Resource, Action (permissions.ts — Phase 2)

import { revalidatePath }   from 'next/cache'
import { redirect }         from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { InvoiceDraftSchema } from '@/lib/validators/invoice.schema'
import {
  createInvoiceDraft,
  finalizeInvoice,
  cancelInvoice,
} from '@/lib/services/invoice.service'
import { prisma } from '@/lib/db/prisma'
import { InvoiceStatus, isInvoiceTransitionAllowed } from '@/types/enums'
import { BusinessRuleError, NotFoundError } from '@/lib/auth/permissions'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { AuditAction } from '@/types/enums'

export interface ActionState {
  success?:     boolean
  error?:       string
  fieldErrors?: Record<string, string[]>
}

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  const u = session.user as { id: string; email: string }
  return { userId: u.id, userEmail: u.email }
}

function parseItems(formData: FormData) {
  const raw = formData.get('itemsJson')
  if (!raw || typeof raw !== 'string') return []
  try { return JSON.parse(raw) as unknown[] } catch { return [] }
}

// ── CREATE DRAFT ──────────────────────────────────────────────

export async function createInvoiceDraftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.CREATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    customerId:          formData.get('customerId'),
    orderId:             formData.get('orderId')   || null,
    invoiceDate:         formData.get('invoiceDate'),
    dueDate:             formData.get('dueDate')   || null,
    deliveryDate:        formData.get('deliveryDate')       || null,
    deliveryPeriodStart: formData.get('deliveryPeriodStart')|| null,
    deliveryPeriodEnd:   formData.get('deliveryPeriodEnd')  || null,
    paymentTermDays:     formData.get('paymentTermDays')    || null,
    introText:           formData.get('introText')  || null,
    outroText:           formData.get('outroText')  || null,
    items:               parseItems(formData),
  }

  const result = InvoiceDraftSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder ausfüllen.',
    }
  }

  let invoiceId: string
  try {
    invoiceId = await createInvoiceDraft(
      {
        ...result.data,
        // Coerce nullables
        orderId:             result.data.orderId             ?? undefined,
        dueDate:             result.data.dueDate             ?? undefined,
        deliveryDate:        result.data.deliveryDate        ?? undefined,
        deliveryPeriodStart: result.data.deliveryPeriodStart ?? undefined,
        deliveryPeriodEnd:   result.data.deliveryPeriodEnd   ?? undefined,
        paymentTermDays:     result.data.paymentTermDays     ?? undefined,
        introText:           result.data.introText           ?? undefined,
        outroText:           result.data.outroText           ?? undefined,
      },
      userId,
      userEmail,
    )
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Anlegen' }
  }

  revalidatePath('/invoices')
  redirect(`/invoices/${invoiceId}`)
}

// ── UPDATE DRAFT ──────────────────────────────────────────────
// Nutzt direktes Prisma-Update (kein Duplikat von invoice.service — dort nur create/finalize/cancel)

export async function updateInvoiceDraftAction(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    customerId:          formData.get('customerId'),
    orderId:             formData.get('orderId')   || null,
    invoiceDate:         formData.get('invoiceDate'),
    dueDate:             formData.get('dueDate')   || null,
    deliveryDate:        formData.get('deliveryDate')       || null,
    deliveryPeriodStart: formData.get('deliveryPeriodStart')|| null,
    deliveryPeriodEnd:   formData.get('deliveryPeriodEnd')  || null,
    paymentTermDays:     formData.get('paymentTermDays')    || null,
    introText:           formData.get('introText')  || null,
    outroText:           formData.get('outroText')  || null,
    items:               parseItems(formData),
  }

  const result = InvoiceDraftSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder ausfüllen.',
    }
  }

  try {
    // Guard: nur DRAFT editierbar
    const existing = await prisma.invoice.findUnique({
      where:  { id: invoiceId },
      select: { status: true },
    })
    if (!existing) throw new NotFoundError('Rechnung nicht gefunden')
    if (existing.status !== InvoiceStatus.DRAFT) {
      throw new BusinessRuleError('Nur Rechnungsentwürfe können bearbeitet werden.')
    }

    const items = result.data.items
    let totalNet = 0, totalTax = 0
    for (const item of items) {
      const net = item.quantity * item.unitPrice
      totalNet += net
      totalTax += net * item.taxRate / 100
    }
    totalNet   = Math.round(totalNet * 100) / 100
    totalTax   = Math.round(totalTax * 100) / 100
    const totalGross = Math.round((totalNet + totalTax) * 100) / 100

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId } })
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          customerId:          result.data.customerId,
          orderId:             result.data.orderId             ?? null,
          invoiceDate:         result.data.invoiceDate,
          dueDate:             result.data.dueDate             ?? null,
          deliveryDate:        result.data.deliveryDate        ?? null,
          deliveryPeriodStart: result.data.deliveryPeriodStart ?? null,
          deliveryPeriodEnd:   result.data.deliveryPeriodEnd   ?? null,
          paymentTermDays:     result.data.paymentTermDays     ?? null,
          introText:           result.data.introText           ?? null,
          outroText:           result.data.outroText           ?? null,
          totalNet,
          totalTax,
          totalGross,
          items: {
            create: items.map((item) => ({
              position:    item.position,
              description: item.description,
              quantity:    item.quantity,
              unit:        item.unit ?? 'Stk.',
              unitPrice:   item.unitPrice,
              taxRate:     item.taxRate,
              netAmount:   Math.round(item.quantity * item.unitPrice * 100) / 100,
              taxAmount:   Math.round(item.quantity * item.unitPrice * item.taxRate / 100 * 100) / 100,
              grossAmount: Math.round(item.quantity * item.unitPrice * (1 + item.taxRate / 100) * 100) / 100,
              notes:       item.notes ?? null,
            })),
          },
        },
      })

      await buildAuditLogCreate({
        userId, userEmail,
        action:     AuditAction.UPDATE,
        entityType: 'invoice',
        entityId:   invoiceId,
        newValue:   { totalNet, totalGross, itemCount: items.length },
      })
    })
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Speichern' }
  }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${invoiceId}`)
  redirect(`/invoices/${invoiceId}`)
}

// ── FINALIZE ──────────────────────────────────────────────────

export async function finalizeInvoiceAction(invoiceId: string): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.FINALIZE)
  const { userId, userEmail } = await getActor()

  try {
    const { invoiceNumber } = await finalizeInvoice(invoiceId, userId, userEmail)
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${invoiceId}`)
    return { success: true, error: undefined }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Finalisieren' }
  }
}

// ── CANCEL / STORNO ───────────────────────────────────────────

export async function cancelInvoiceAction(
  invoiceId: string,
  reason: string,
): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.CANCEL)
  const { userId, userEmail } = await getActor()

  try {
    const { cancellationInvoiceId } = await cancelInvoice(invoiceId, reason, userId, userEmail)
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${invoiceId}`)
    // Redirect to cancellation invoice
    redirect(`/invoices/${cancellationInvoiceId}`)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Stornieren' }
  }
}

// ── STATUS CHANGE (SENT / OVERDUE) ───────────────────────────

export async function changeInvoiceStatusAction(
  invoiceId: string,
  toStatus:  InvoiceStatus,
): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  try {
    const invoice = await prisma.invoice.findUnique({
      where:  { id: invoiceId },
      select: { status: true },
    })
    if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')

    if (!isInvoiceTransitionAllowed(invoice.status as InvoiceStatus, toStatus)) {
      throw new BusinessRuleError(`Statuswechsel nach „${toStatus}" nicht erlaubt.`)
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status:  toStatus,
          ...(toStatus === InvoiceStatus.SENT ? { sentAt: new Date() } : {}),
        },
      })
      await buildAuditLogCreate({
        userId, userEmail,
        action:     AuditAction.STATUS_CHANGE,
        entityType: 'invoice',
        entityId:   invoiceId,
        oldValue:   { status: invoice.status },
        newValue:   { status: toStatus },
      })
    })

    revalidatePath(`/invoices/${invoiceId}`)
    revalidatePath('/invoices')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}
