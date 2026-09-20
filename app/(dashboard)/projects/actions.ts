'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { Action, requirePermission, Resource } from '@/lib/auth/permissions'
import { activateCollaboration, assignInvoiceToProject, assignOfferToProject, assignOrderToProject, createProject, deleteProject, getProject, getProjectDeleteBlockers, linkExistingCollaborationProject, updateProject } from '@/lib/services/project.service'
import { ensureActorMembership } from '@/lib/services/collaboration-handover.service'

async function actor() { const session = await getServerSession(authOptions); if (!session?.user) throw new Error('Nicht angemeldet'); return { userId: session.user.id, userEmail: session.user.email } }
const data = (f: FormData) => ({ projectNumber: f.get('projectNumber'), name: f.get('name'), description: f.get('description') || null, customerId: f.get('customerId'), leadUserId: f.get('leadUserId') || null, status: f.get('status'), location: f.get('location') || null, building: f.get('building') || null, floor: f.get('floor') || null, area: f.get('area') || null, plannedStart: f.get('plannedStart') || null, plannedEnd: f.get('plannedEnd') || null, actualStart: f.get('actualStart') || null, actualEnd: f.get('actualEnd') || null })
export async function createProjectAction(_: { error?: string }, formData: FormData) {
  let id: string
  try {
    await requirePermission(Resource.PROJECT, Action.CREATE)
    const who = await actor()
    id = await createProject(data(formData), who)
    const sourceOfferId = formData.get('sourceOfferId')
    const sourceOrderId = formData.get('sourceOrderId')
    const sourceInvoiceId = formData.get('sourceInvoiceId')
    if (typeof sourceOfferId === 'string' && sourceOfferId) await assignOfferToProject(id, sourceOfferId, who)
    if (typeof sourceOrderId === 'string' && sourceOrderId) await assignOrderToProject(id, sourceOrderId, who)
    if (typeof sourceInvoiceId === 'string' && sourceInvoiceId) await assignInvoiceToProject(id, sourceInvoiceId, who)
    revalidatePath('/projects')
    if (typeof sourceOfferId === 'string' && sourceOfferId) revalidatePath(`/offers/${sourceOfferId}`)
    if (typeof sourceOrderId === 'string' && sourceOrderId) revalidatePath(`/orders/${sourceOrderId}`)
    if (typeof sourceInvoiceId === 'string' && sourceInvoiceId) revalidatePath(`/invoices/${sourceInvoiceId}`)
  } catch (e) { return { error: e instanceof Error ? e.message : 'Projekt konnte nicht angelegt werden' } }
  redirect(`/projects/${id}`)
}
export async function updateProjectAction(id: string, _: { error?: string }, formData: FormData) { try { await requirePermission(Resource.PROJECT, Action.UPDATE); await updateProject(id, data(formData), await actor()); revalidatePath('/projects'); revalidatePath(`/projects/${id}`); return {} } catch (e) { return { error: e instanceof Error ? e.message : 'Projekt konnte nicht aktualisiert werden' } } }
// "Für Zusammenarbeit freigeben" (BUSINESS → PROJECT → COLLABORATION
// RELEASE, Abschnitt 6): ausschließlich die bereits bestehende, bereits
// idempotente activateCollaboration() — keine zweite Collaboration-
// Erzeugungslogik. Ergänzt danach dieselbe, einzige Membership-Funktion,
// die auch der automatische Order-Handover verwendet, damit das Project
// für den Actor sofort unter „Zusammenarbeit" sichtbar ist, statt trotz
// erfolgreicher Freigabe unsichtbar zu bleiben.
export async function activateProjectCollaborationAction(projectId: string) {
  await requirePermission(Resource.PROJECT, Action.UPDATE)
  const who = await actor()
  const collaboration = await activateCollaboration(projectId, who)
  await ensureActorMembership(collaboration.id, who)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
}

export async function linkExistingCollaborationProjectAction(projectId: string, collaborationProjectId: string): Promise<{ error?: string }> {
  try {
    await requirePermission(Resource.PROJECT, Action.UPDATE)
    await linkExistingCollaborationProject(projectId, collaborationProjectId, await actor())
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/projects')
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Zusammenarbeit konnte nicht verknüpft werden' } }
}

export async function assignExistingProjectAction(kind: 'offer' | 'order' | 'invoice', targetId: string, projectId: string): Promise<{ error?: string }> {
  try {
    await requirePermission(Resource.PROJECT, Action.UPDATE)
    const who = await actor()
    if (kind === 'offer') await assignOfferToProject(projectId, targetId, who)
    else if (kind === 'order') await assignOrderToProject(projectId, targetId, who)
    else await assignInvoiceToProject(projectId, targetId, who)
    revalidatePath(`/${kind}s/${targetId}`)
    revalidatePath(`/projects/${projectId}`)
    return {}
  } catch (e) { return { error: e instanceof Error ? e.message : 'Zuordnung fehlgeschlagen' } }
}

export interface DeleteProjectActionState { success: boolean; error?: string }

// DELETE-SAFETY-001 — bewusst NICHT hinter requireTestDeleteEnabled():
// im Gegensatz zu den Test-Delete-Pfaden (Customer/Offer/Order/
// ServiceReport/Invoice) ist die Projektlöschung eine echte, dauerhaft
// nutzbare Funktion und nutzt die bereits im PERMISSION_MATRIX definierte
// 'project:delete'-Berechtigung (OFFICE_ROLES).
export async function deleteProjectAction(projectId: string, confirmedProjectNumber: string): Promise<DeleteProjectActionState> {
  try {
    await requirePermission(Resource.PROJECT, Action.DELETE)
    const who = await actor()
    await deleteProject(projectId, confirmedProjectNumber, who)
    revalidatePath('/projects')
    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Projekt konnte nicht gelöscht werden' }
  }
}

export type GetProjectDeleteInfoState = { success: true; blockers: string[] } | { success: false; error: string }

// DELETE-SAFETY-003 — reiner Lese-Wrapper um die bereits bestehenden
// getProject()/getProjectDeleteBlockers() (DELETE-SAFETY-001), für den
// zusätzlichen Löschzugang in der Projektübersicht (/projects). Keine neue
// Dependency-Prüfung: identische Funktionen wie auf /projects/[id],
// lediglich on-demand statt beim Seitenaufbau geladen (vermeidet N+1-Abfragen
// für jede Zeile der Liste).
export async function getProjectDeleteInfoAction(projectId: string): Promise<GetProjectDeleteInfoState> {
  try {
    await requirePermission(Resource.PROJECT, Action.DELETE)
    const project = await getProject(projectId)
    return { success: true, blockers: getProjectDeleteBlockers(project) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Abhängigkeiten konnten nicht geprüft werden' }
  }
}
