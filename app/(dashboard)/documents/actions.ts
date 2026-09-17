'use server'
// app/(dashboard)/documents/actions.ts

import { revalidatePath }   from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { deleteDocument }   from '@/lib/services/document.service'
import { archiveBusinessDocument } from '@/lib/documents/document-archive.service'
import type { RoleName } from '@/types/enums'
import { prisma } from '@/lib/db/prisma'

export interface ActionState {
  success?: boolean
  error?:   string
}

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  const user = session.user as typeof session.user & { role: RoleName }
  return { userId: user.id, userEmail: user.email, role: user.role }
}

export async function retryDocumentArchiveAction(documentId: string): Promise<ActionState> {
  await requirePermission(Resource.DOCUMENT, Action.CREATE)
  const actor = await getActor()
  const doc = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null, archiveStatus: 'FAILED' } })
  if (!doc) return { success: false, error: 'Fehlgeschlagener Archiveintrag nicht gefunden.' }
  const target = doc.invoiceId ? ['invoice', doc.invoiceId] : doc.serviceReportId ? ['serviceReport', doc.serviceReportId] : doc.orderId ? ['order', doc.orderId] : doc.offerId ? ['offer', doc.offerId] : null
  if (!target) return { success: false, error: 'Dokument ist keinem unterstützten Vorgang zugeordnet.' }
  const result = await archiveBusinessDocument(target[0] as 'invoice' | 'serviceReport' | 'order' | 'offer', target[1], doc.lifecycle === 'FINAL' ? 'FINAL' : 'DRAFT', actor, true)
  revalidatePath('/documents')
  return result.status === 'failed' ? { success: false, error: result.error } : { success: true }
}

// ── DELETE ────────────────────────────────────────────────────

export async function deleteDocumentAction(
  documentId: string,
  reason:     string,
): Promise<ActionState> {
  await requirePermission(Resource.DOCUMENT, Action.DELETE)
  const { userId, userEmail } = await getActor()

  try {
    await deleteDocument(documentId, reason, userId, userEmail)
    revalidatePath('/documents')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Löschen' }
  }
}
