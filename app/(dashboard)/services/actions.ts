'use server'
// app/(dashboard)/services/actions.ts

import { revalidatePath }   from 'next/cache'
import { redirect }         from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { ServiceReportCreateSchema, ServiceReportUpdateSchema } from '@/lib/validators/service-report.schema'
import {
  createServiceReport,
  updateServiceReport,
  deleteServiceReport,
} from '@/lib/services/service-report.service'
import type { RoleName } from '@/types/enums'

export interface ActionState {
  success?:     boolean
  error?:       string
  fieldErrors?: Record<string, string[]>
}

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  const u = session.user as typeof session.user & { id: string; role: RoleName }
  return { userId: u.id, userEmail: u.email, userRole: u.role }
}

function parseItems(formData: FormData) {
  const raw = formData.get('itemsJson')
  if (!raw || typeof raw !== 'string') return []
  try { return JSON.parse(raw) as unknown[] } catch { return [] }
}

// ── CREATE ────────────────────────────────────────────────────

export async function createServiceReportAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.SERVICE_REPORT, Action.CREATE)
  const { userId, userEmail } = await getActor()

  const raw = {
    orderId:     formData.get('orderId'),
    title:       formData.get('title')       || null,
    description: formData.get('description') || null,
    reportDate:  formData.get('reportDate'),
    items:       parseItems(formData),
  }

  const result = ServiceReportCreateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder ausfüllen.',
    }
  }

  let reportId: string
  try {
    reportId = await createServiceReport(result.data, userId, userEmail)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }

  revalidatePath('/services')
  redirect(`/services/${reportId}`)
}

// ── UPDATE ────────────────────────────────────────────────────

export async function updateServiceReportAction(
  reportId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.SERVICE_REPORT, Action.UPDATE)
  const { userId, userEmail, userRole } = await getActor()

  const raw = {
    orderId:     formData.get('orderId'),
    title:       formData.get('title')       || null,
    description: formData.get('description') || null,
    reportDate:  formData.get('reportDate'),
    items:       parseItems(formData),
  }

  const result = ServiceReportUpdateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder ausfüllen.',
    }
  }

  try {
    await updateServiceReport(reportId, result.data, userId, userEmail, userRole)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }

  revalidatePath('/services')
  revalidatePath(`/services/${reportId}`)
  redirect(`/services/${reportId}`)
}

// ── DELETE ────────────────────────────────────────────────────

export async function deleteServiceReportAction(reportId: string): Promise<ActionState> {
  await requirePermission(Resource.SERVICE_REPORT, Action.DELETE)
  const { userId, userEmail, userRole } = await getActor()

  try {
    await deleteServiceReport(reportId, userId, userEmail, userRole)
    revalidatePath('/services')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler' }
  }
}
