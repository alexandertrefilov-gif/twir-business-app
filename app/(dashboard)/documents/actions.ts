'use server'
// app/(dashboard)/documents/actions.ts

import { revalidatePath }   from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { deleteDocument }   from '@/lib/services/document.service'

export interface ActionState {
  success?: boolean
  error?:   string
}

async function getActor() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Nicht angemeldet')
  return { userId: session.user.id, userEmail: session.user.email }
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
