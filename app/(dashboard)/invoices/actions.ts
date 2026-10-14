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
  updateInvoiceDraft,
  deleteInvoiceDraft,
  finalizeInvoice,
  cancelInvoice,
  changeInvoiceStatus,
} from '@/lib/services/invoice.service'
import type { InvoiceStatus } from '@/types/enums'
import { requireTestDeleteEnabled } from '@/lib/security/test-delete'
import { archiveBusinessDocument } from '@/lib/documents/document-archive.service'
import type { RoleName } from '@/types/enums'

export interface ActionState {
  success?:     boolean
  error?:       string
  fieldErrors?: Record<string, string[]>
}

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  const u = session.user as { id: string; email: string; role: RoleName }
  return { userId: u.id, userEmail: u.email, role: u.role }
}

function parseItems(formData: FormData) {
  const raw = formData.get('itemsJson')
  if (!raw || typeof raw !== 'string') return []
  try { return JSON.parse(raw) as unknown[] } catch { return [] }
}

// REQ-029 P3: Käuferreferenz nur übernehmen, wenn das Feld übermittelt wurde (kein UI-Feld in P3 –
// ein fehlendes Feld darf einen bereits gesetzten Wert nicht löschen).
function readBuyerReference(formData: FormData): FormDataEntryValue | undefined {
  return formData.has('buyerReference') ? formData.get('buyerReference') ?? undefined : undefined
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
    invoiceRecipientSource: formData.get('invoiceRecipientSource') || 'CUSTOMER',
    billingAddressId:       formData.get('billingAddressId') || null,
    recipientName:        formData.get('recipientName')        || null,
    recipientAdditional:  formData.get('recipientAdditional')  || null,
    recipientStreet:      formData.get('recipientStreet')      || null,
    recipientHouseNumber: formData.get('recipientHouseNumber') || null,
    recipientPostalCode:  formData.get('recipientPostalCode')  || null,
    recipientCity:        formData.get('recipientCity')        || null,
    recipientCountry:     formData.get('recipientCountry')     || null,
    recipientContactName: formData.get('recipientContactName') || null,
    recipientEmail:       formData.get('recipientEmail')       || null,
    orderId:             formData.get('orderId')   || null,
    invoiceDate:         formData.get('invoiceDate'),
    dueDate:             formData.get('dueDate')   || null,
    deliveryDate:        formData.get('deliveryDate')       || null,
    deliveryPeriodStart: formData.get('deliveryPeriodStart')|| null,
    deliveryPeriodEnd:   formData.get('deliveryPeriodEnd')  || null,
    paymentTermDays:     formData.get('paymentTermDays')    || null,
    introText:           formData.get('introText')  || null,
    outroText:           formData.get('outroText')  || null,
    buyerReference:      readBuyerReference(formData),
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
        billingAddressId:     result.data.billingAddressId     ?? undefined,
        recipientName:        result.data.recipientName        ?? undefined,
        recipientAdditional:  result.data.recipientAdditional  ?? undefined,
        recipientStreet:      result.data.recipientStreet      ?? undefined,
        recipientHouseNumber: result.data.recipientHouseNumber ?? undefined,
        recipientPostalCode:  result.data.recipientPostalCode  ?? undefined,
        recipientCity:        result.data.recipientCity        ?? undefined,
        recipientCountry:     result.data.recipientCountry     ?? undefined,
        recipientContactName: result.data.recipientContactName ?? undefined,
        recipientEmail:       result.data.recipientEmail       ?? undefined,
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
    await archiveBusinessDocument('invoice', invoiceId, 'DRAFT', await getActor())
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Anlegen' }
  }

  revalidatePath('/invoices')
  redirect(`/invoices/${invoiceId}`)
}

// ── UPDATE DRAFT ──────────────────────────────────────────────
// Seit P4-A über invoice.service.updateInvoiceDraft (Sperre + zentrale Berechnung).

export async function updateInvoiceDraftAction(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.UPDATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    customerId:          formData.get('customerId'),
    invoiceRecipientSource: formData.get('invoiceRecipientSource') || 'CUSTOMER',
    billingAddressId:       formData.get('billingAddressId') || null,
    recipientName:        formData.get('recipientName')        || null,
    recipientAdditional:  formData.get('recipientAdditional')  || null,
    recipientStreet:      formData.get('recipientStreet')      || null,
    recipientHouseNumber: formData.get('recipientHouseNumber') || null,
    recipientPostalCode:  formData.get('recipientPostalCode')  || null,
    recipientCity:        formData.get('recipientCity')        || null,
    recipientCountry:     formData.get('recipientCountry')     || null,
    recipientContactName: formData.get('recipientContactName') || null,
    recipientEmail:       formData.get('recipientEmail')       || null,
    orderId:             formData.get('orderId')   || null,
    invoiceDate:         formData.get('invoiceDate'),
    dueDate:             formData.get('dueDate')   || null,
    deliveryDate:        formData.get('deliveryDate')       || null,
    deliveryPeriodStart: formData.get('deliveryPeriodStart')|| null,
    deliveryPeriodEnd:   formData.get('deliveryPeriodEnd')  || null,
    paymentTermDays:     formData.get('paymentTermDays')    || null,
    introText:           formData.get('introText')  || null,
    outroText:           formData.get('outroText')  || null,
    buyerReference:      readBuyerReference(formData),
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
    // P4-A: Statusprüfung, Sperre, Berechnung und Schreiben liegen vollständig im Service
    // (eine Transaktion, Zeilensperre, Statusbedingung) – die Action prüft nichts mehr selbst.
    await updateInvoiceDraft(
      invoiceId,
      {
        ...result.data,
        orderId:              result.data.orderId              ?? undefined,
        billingAddressId:     result.data.billingAddressId     ?? undefined,
        recipientName:        result.data.recipientName        ?? undefined,
        recipientAdditional:  result.data.recipientAdditional  ?? undefined,
        recipientStreet:      result.data.recipientStreet      ?? undefined,
        recipientHouseNumber: result.data.recipientHouseNumber ?? undefined,
        recipientPostalCode:  result.data.recipientPostalCode  ?? undefined,
        recipientCity:        result.data.recipientCity        ?? undefined,
        recipientCountry:     result.data.recipientCountry     ?? undefined,
        recipientContactName: result.data.recipientContactName ?? undefined,
        recipientEmail:       result.data.recipientEmail       ?? undefined,
        dueDate:              result.data.dueDate              ?? undefined,
        deliveryDate:         result.data.deliveryDate         ?? undefined,
        deliveryPeriodStart:  result.data.deliveryPeriodStart  ?? undefined,
        deliveryPeriodEnd:    result.data.deliveryPeriodEnd    ?? undefined,
        paymentTermDays:      result.data.paymentTermDays      ?? undefined,
        introText:            result.data.introText            ?? undefined,
        outroText:            result.data.outroText            ?? undefined,
      },
      userId,
      userEmail,
    )
    await archiveBusinessDocument('invoice', invoiceId, 'DRAFT', await getActor())
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Speichern' }
  }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${invoiceId}`)
  redirect(`/invoices/${invoiceId}`)
}

// ── DELETE DRAFT ──────────────────────────────────────────────

export async function deleteInvoiceDraftAction(invoiceId: string): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.DELETE)
  requireTestDeleteEnabled()
  const { userId, userEmail } = await getActor()

  try {
    await deleteInvoiceDraft(invoiceId, userId, userEmail)
    revalidatePath('/invoices')
    return { success: true }
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Fehler beim Löschen',
    }
  }
}

// ── FINALIZE ──────────────────────────────────────────────────

export async function finalizeInvoiceAction(invoiceId: string): Promise<ActionState> {
  await requirePermission(Resource.INVOICE, Action.FINALIZE)
  const { userId, userEmail } = await getActor()

  try {
    const { invoiceNumber } = await finalizeInvoice(invoiceId, userId, userEmail)
    const archive = await archiveBusinessDocument('invoice', invoiceId, 'FINAL', await getActor())
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${invoiceId}`)
    return archive.status === 'failed' ? { success: true, error: `Rechnung finalisiert; Archivierung fehlgeschlagen: ${archive.error}` } : { success: true, error: undefined }
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
    // P4-C: Prüfung (Whitelist manueller Übergänge), Sperre, Statusbedingung und Audit liegen im Service.
    await changeInvoiceStatus(invoiceId, toStatus, userId, userEmail)

    revalidatePath(`/invoices/${invoiceId}`)
    revalidatePath('/invoices')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}
