import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireCollaborationManager, requireCollaborationProjectAccess, requireCollaborationSession, requireCollaborationStageAccess, requireInternalCollaborationProjectAccess } from '@/lib/auth/collaboration-guards'
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/auth/permissions'
import { buildAuditLogCreate, writeAuditLog } from '@/lib/services/audit.service'
import { calculateProjectHealth, calculateProjectProgress, deriveNextAction, deriveStageStatuses, getStageCompletionBlocker, isCollaborationStageTransitionAllowed } from '@/lib/collaboration/project-workflow'

// GGA-04.2: 'OPERATOR' stand hier ursprünglich mit in der Liste, obwohl
// KEINER der ca. 14 Aufrufer dieser Konstante (Task-/Checklisten-/Blocker-
// CRUD, Stage-Übergänge, Freigabe-Anforderung, GGA-Checklisten-Vorlage/
// -Prüfpunkt, Cabinet-Zuordnung, Dokument-Upload/-Löschen) einen legitimen
// Betreiberprozess abbildet — der einzige echte OPERATOR-Schreibpfad ist
// vollständig getrennt und nutzt bereits ausschließlich ['OPERATOR']
// (decideGgaCabinetOperatorApproval, siehe unten in gga-cabinet.service.ts).
// Dieselbe Rolle taucht in collaboration-document.service.ts bereits als
// EXTERNAL_ONLY_VISIBILITY_ROLES (nur lesen) auf — Schreibrechte über
// editorRoles widersprachen dieser bereits bestehenden Trennung. Audit und
// Call-Site-Bestätigung: Checkpoint GGA-04.2.
export const editorRoles = ['COLLAB_MANAGER', 'INTERNAL_PLANNER', 'EXTERNAL_PLANNER', 'PARTNER'] as const
export const approverRoles = ['COLLAB_MANAGER', 'INTERNAL_PLANNER'] as const
const taskStatus = z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'SKIPPED'])
const blockerStatus = z.enum(['OPEN', 'RESOLVED'])

const taskInputSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(5000).optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'), dueDate: z.coerce.date().nullable().optional(), sequence: z.number().int().nonnegative().default(0), isRequired: z.boolean().default(true), responsibleMembershipId: z.string().min(1).nullable().optional(), cabinetId: z.string().min(1).nullable().optional() })
const checklistInputSchema = z.object({ title: z.string().trim().min(1).max(200), sequence: z.number().int().nonnegative().default(0), isRequired: z.boolean().default(true), responsibleMembershipId: z.string().min(1).nullable().optional() })
const blockerInputSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(5000).optional(), cause: z.string().max(2000).optional(), stageId: z.string().min(1).optional(), taskId: z.string().min(1).optional(), responsibleMembershipId: z.string().min(1).optional(), cabinetId: z.string().min(1).nullable().optional() })

export async function getCollaborationPhase2Project(projectId: string) {
  const { userId } = await requireCollaborationSession()
  const membership = await requireInternalCollaborationProjectAccess(userId, projectId)
  const project = await prisma.collaborationProject.findFirst({
    where: { id: projectId, active: true, deletedAt: null },
    select: {
      id: true, name: true, projectNumber: true, status: true,
      memberships: { where: { active: true }, select: { id: true, role: true, user: { select: { firstName: true, lastName: true } } } },
      blockers: { where: { status: 'OPEN' }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true, status: true } },
      stages: { orderBy: { sequence: 'asc' }, select: {
        id: true, title: true, code: true, sequence: true, status: true, requiresApproval: true, weight: true, isRequired: true, plannedEnd: true, blockedReason: true,
        tasks: { orderBy: { sequence: 'asc' }, select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, sequence: true, isRequired: true, completedAt: true } },
        checklistItems: { orderBy: { sequence: 'asc' }, select: { id: true, title: true, sequence: true, isRequired: true, completed: true, completedAt: true, responsibleMembershipId: true } },
        blockers: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true, description: true, status: true, cause: true, resolution: true, stageId: true, taskId: true } },
        approvals: { orderBy: { requestedAt: 'desc' }, select: { id: true, status: true, requestedAt: true, decidedAt: true, decisionNote: true, requestedById: true, decidedById: true } },
        dependencies: { select: { dependsOnStageId: true, requiredStatus: true } },
      } },
    },
  })
  if (!project) throw new NotFoundError('Projekt nicht gefunden')
  const snapshots = project.stages.map((stage) => ({ ...stage, weight: Number(stage.weight), dependencies: stage.dependencies, blockers: stage.blockers, tasks: stage.tasks, checklistItems: stage.checklistItems, approvals: stage.approvals }))
  const stages = deriveStageStatuses(snapshots)
  return { ...project, role: membership.role, stages, healthStatus: project.blockers[0] ? 'RED' as const : calculateProjectHealth(snapshots), progressPercent: calculateProjectProgress(snapshots), nextAction: project.blockers[0]?.title ?? deriveNextAction(stages) }
}

export async function getVisibleCollaborationTasks(filters?: { projectId?: string; status?: string; priority?: string; overdue?: boolean; mine?: boolean }) {
  const { userId } = await requireCollaborationSession()
  const projects = await prisma.collaborationMembership.findMany({
    where: { userId, active: true, project: { active: true, deletedAt: null } },
    select: { project: { select: { id: true, name: true } } },
  })
  const projectIds = projects.map(({ project }) => project.id)
  return prisma.collaborationTask.findMany({ where: { projectId: filters?.projectId ? { equals: filters.projectId } : { in: projectIds }, ...(filters?.status ? { status: filters.status } : {}), ...(filters?.priority ? { priority: filters.priority } : {}), ...(filters?.mine ? { responsibleMembership: { userId } } : {}), ...(filters?.overdue ? { dueDate: { lt: new Date() }, status: { notIn: ['DONE', 'SKIPPED'] } } : {}) } as never, orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }], include: { project: { select: { id: true, name: true } }, stage: { select: { title: true } }, responsibleMembership: { select: { user: { select: { firstName: true, lastName: true } } } } } })
}

export async function getVisibleCollaborationApprovals() {
  const { userId } = await requireCollaborationSession()
  return prisma.collaborationApproval.findMany({ where: { project: { active: true, deletedAt: null, memberships: { some: { userId, active: true } } } }, orderBy: { requestedAt: 'desc' }, include: { project: { select: { id: true, name: true, memberships: { where: { userId, active: true }, select: { role: true } } } }, stage: { select: { title: true } }, requestedBy: { select: { firstName: true, lastName: true, email: true } }, decidedBy: { select: { firstName: true, lastName: true } } } })
}

function assertEditor(role: string) {
  if (!(editorRoles as readonly string[]).includes(role)) throw new ForbiddenError('Keine Berechtigung für Projektänderungen')
}
function assertApprover(role: string) {
  if (!(approverRoles as readonly string[]).includes(role)) throw new ForbiddenError('Keine Berechtigung für Freigaben')
}

export async function createCollaborationTask(stageId: string, input: unknown) {
  const { userId, userEmail } = await requireCollaborationSession()
  const data = taskInputSchema.parse(input)
  const access = await requireCollaborationStageAccess(userId, stageId, editorRoles)
  // Maßnahme mit Cabinet-Bezug (GGA-Bestandsaufnahme/Planung): Cabinet muss
  // serverseitig zum selben Projekt gehören wie die Stage — kein zweites
  // Maßnahmensystem, cabinetId ist ein additives Feld auf CollaborationTask.
  if (data.cabinetId) {
    const cabinet = await prisma.ggaCabinet.findFirst({ where: { id: data.cabinetId, projectId: access.projectId, deletedAt: null } })
    if (!cabinet) throw new NotFoundError('Schrank nicht gefunden')
  }
  const task = await prisma.collaborationTask.create({ data: { ...data, stageId, projectId: access.projectId, dueDate: data.dueDate ?? null } })
  await writeAuditLog({ userId, userEmail, action: 'CREATE', entityType: 'collaboration_task', entityId: task.id, newValue: { title: task.title, stageId, cabinetId: data.cabinetId ?? null } })
  return task
}

export async function createCollaborationChecklistItem(stageId: string, input: unknown) {
  const { userId, userEmail } = await requireCollaborationSession()
  const data = checklistInputSchema.parse(input)
  const access = await requireCollaborationStageAccess(userId, stageId, editorRoles)
  const item = await prisma.collaborationChecklistItem.create({ data: { ...data, stageId, projectId: access.projectId, responsibleMembershipId: data.responsibleMembershipId ?? null } })
  await writeAuditLog({ userId, userEmail, action: 'CREATE', entityType: 'collaboration_checklist_item', entityId: item.id, newValue: { title: item.title, stageId } })
  return item
}

export async function createCollaborationBlocker(projectId: string, input: unknown) {
  const { userId, userEmail } = await requireCollaborationSession()
  const data = blockerInputSchema.parse(input)
  const membership = await requireCollaborationProjectAccess(userId, projectId)
  if (!editorRoles.includes(membership.role as typeof editorRoles[number])) throw new ForbiddenError('Keine Berechtigung für Blocker')
  if (data.taskId) {
    const task = await prisma.collaborationTask.findFirst({ where: { id: data.taskId, projectId }, select: { id: true, stageId: true } })
    if (!task) throw new NotFoundError('Aufgabe nicht gefunden')
  }
  if (data.stageId) {
    const stage = await prisma.collaborationProjectStage.findFirst({ where: { id: data.stageId, projectId }, select: { id: true } })
    if (!stage) throw new NotFoundError('Projektstufe nicht gefunden')
  }
  if (data.cabinetId) {
    const cabinet = await prisma.ggaCabinet.findFirst({ where: { id: data.cabinetId, projectId, deletedAt: null } })
    if (!cabinet) throw new NotFoundError('Schrank nicht gefunden')
  }
  const blocker = await prisma.collaborationBlocker.create({ data: { ...data, projectId, createdById: userId } })
  await writeAuditLog({ userId, userEmail, action: 'CREATE', entityType: 'collaboration_blocker', entityId: blocker.id, newValue: { title: blocker.title, projectId } })
  return blocker
}

export async function setCollaborationTaskStatus(taskId: string, status: string) {
  const { userId, userEmail } = await requireCollaborationSession()
  const task = await prisma.collaborationTask.findUnique({ where: { id: taskId }, select: { id: true, stageId: true, projectId: true, status: true } })
  if (!task) throw new NotFoundError('Aufgabe nicht gefunden')
  const access = await requireCollaborationStageAccess(userId, task.stageId, editorRoles)
  if (access.projectId !== task.projectId) throw new NotFoundError('Aufgabe nicht gefunden')
  const next = taskStatus.parse(status)
  // Optimistische Bedingung auf den Ausgangsstatus: verhindert doppelte
  // Statuswechsel bei parallelen Requests (gleiches Muster wie bei Freigaben).
  const result = await prisma.collaborationTask.updateMany({ where: { id: taskId, status: task.status }, data: { status: next, completedAt: ['DONE', 'SKIPPED'].includes(next) ? new Date() : null } })
  if (result.count === 0) throw new ConflictError('Der Status wurde zwischenzeitlich bereits geändert.')
  const updated = await prisma.collaborationTask.findUniqueOrThrow({ where: { id: taskId } })
  await writeAuditLog({ userId, userEmail, action: 'STATUS_CHANGE', entityType: 'collaboration_task', entityId: taskId, oldValue: { status: task.status }, newValue: { status: next } })
  return updated
}

export async function updateCollaborationTask(taskId: string, input: unknown) {
  const { userId, userEmail } = await requireCollaborationSession()
  const task = await prisma.collaborationTask.findUnique({ where: { id: taskId }, select: { id: true, stageId: true, projectId: true } })
  if (!task) throw new NotFoundError('Aufgabe nicht gefunden')
  const access = await requireCollaborationStageAccess(userId, task.stageId, editorRoles)
  if (access.projectId !== task.projectId) throw new NotFoundError('Aufgabe nicht gefunden')
  const data = taskInputSchema.partial().parse(input)
  const updated = await prisma.collaborationTask.update({ where: { id: taskId }, data: { ...data, dueDate: data.dueDate === undefined ? undefined : data.dueDate } })
  await writeAuditLog({ userId, userEmail, action: 'UPDATE', entityType: 'collaboration_task', entityId: taskId, newValue: data })
  return updated
}

// Wird von gga-cabinet.service.ts synchronisiert — ein interner Nutzer darf
// diesen Punkt nicht manuell setzen und dadurch den echten Betreiber-
// Approval-Prozess umgehen (keine parallelen Wahrheiten).
const SYSTEM_MANAGED_CHECKLIST_TITLES = new Set(['Betreiberfreigabe erforderlich/geklärt'])

export async function setCollaborationChecklistCompleted(itemId: string, completed: boolean) {
  const { userId, userEmail } = await requireCollaborationSession()
  const item = await prisma.collaborationChecklistItem.findUnique({ where: { id: itemId }, select: { id: true, stageId: true, projectId: true, cabinetId: true, title: true, completed: true } })
  if (!item) throw new NotFoundError('Checklistenpunkt nicht gefunden')
  if (item.cabinetId && SYSTEM_MANAGED_CHECKLIST_TITLES.has(item.title)) {
    throw new BusinessRuleError('Dieser Punkt wird automatisch aus der Betreiberfreigabe abgeleitet und kann nicht manuell gesetzt werden.')
  }
  const access = await requireCollaborationStageAccess(userId, item.stageId, editorRoles)
  if (access.projectId !== item.projectId) throw new NotFoundError('Checklistenpunkt nicht gefunden')
  // Optimistische Bedingung auf den Ausgangswert: verhindert, dass zwei
  // parallele Requests sich beim Setzen von completedByMembershipId
  // gegenseitig widersprüchlich überschreiben.
  const result = await prisma.collaborationChecklistItem.updateMany({ where: { id: itemId, completed: item.completed }, data: { completed, completedAt: completed ? new Date() : null, completedByMembershipId: completed ? access.membership.id : null } })
  if (result.count === 0) throw new ConflictError('Dieser Punkt wurde zwischenzeitlich bereits geändert.')
  const updated = await prisma.collaborationChecklistItem.findUniqueOrThrow({ where: { id: itemId } })
  await writeAuditLog({ userId, userEmail, action: 'UPDATE', entityType: 'collaboration_checklist_item', entityId: itemId, oldValue: { completed: item.completed }, newValue: { completed } })
  return updated
}

export async function resolveCollaborationBlocker(blockerId: string, resolution: string) {
  const { userId, userEmail } = await requireCollaborationSession()
  const blocker = await prisma.collaborationBlocker.findUnique({ where: { id: blockerId }, select: { id: true, projectId: true, stageId: true, status: true } })
  if (!blocker) throw new NotFoundError('Blocker nicht gefunden')
  // GGA-04.2: beide Zweige verlangen dieselbe Rollenprüfung (editorRoles) —
  // ein projektweiter Blocker ohne stageId darf COLLAB_VIEWER (oder jeder
  // anderen nicht-editierenden Rolle) genauso wenig auflösbar sein wie ein
  // stufengebundener. Vorher prüfte dieser Zweig ausschließlich Mitgliedschaft.
  if (!blocker.stageId) {
    const membership = await requireCollaborationProjectAccess(userId, blocker.projectId)
    if (!(editorRoles as readonly string[]).includes(membership.role)) throw new ForbiddenError('Keine Berechtigung für Blocker')
  } else {
    const access = await requireCollaborationStageAccess(userId, blocker.stageId, editorRoles)
    if (access.projectId !== blocker.projectId) throw new NotFoundError('Blocker nicht gefunden')
  }
  // Optimistische Bedingung auf den Ausgangsstatus: verhindert, dass zwei
  // parallele Auflösungen desselben Blockers sich gegenseitig überschreiben.
  const result = await prisma.collaborationBlocker.updateMany({ where: { id: blockerId, status: blocker.status }, data: { status: 'RESOLVED', resolution, resolvedAt: new Date(), resolvedById: userId } })
  if (result.count === 0) throw new ConflictError('Dieser Blocker wurde zwischenzeitlich bereits bearbeitet.')
  const updated = await prisma.collaborationBlocker.findUniqueOrThrow({ where: { id: blockerId } })
  await writeAuditLog({ userId, userEmail, action: 'UPDATE', entityType: 'collaboration_blocker', entityId: blockerId, oldValue: { status: blocker.status }, newValue: { status: 'RESOLVED', resolution } })
  return updated
}

export async function requestCollaborationApproval(stageId: string, cabinetId?: string | null) {
  const { userId, userEmail } = await requireCollaborationSession()
  const access = await requireCollaborationStageAccess(userId, stageId, editorRoles)
  if (cabinetId) {
    const cabinet = await prisma.ggaCabinet.findFirst({ where: { id: cabinetId, projectId: access.projectId, deletedAt: null } })
    if (!cabinet) throw new NotFoundError('Schrank nicht gefunden')
  }
  const approval = await prisma.collaborationApproval.create({ data: { projectId: access.projectId, stageId, requestedById: userId, cabinetId: cabinetId ?? null } })
  await writeAuditLog({ userId, userEmail, action: 'CREATE', entityType: 'collaboration_approval', entityId: approval.id, newValue: { stageId, status: 'REQUESTED', cabinetId: cabinetId ?? null } })
  return approval
}

export async function decideCollaborationApproval(approvalId: string, decision: 'APPROVED' | 'REJECTED', decisionNote?: string) {
  const { userId, userEmail } = await requireCollaborationSession()
  const approval = await prisma.collaborationApproval.findUnique({ where: { id: approvalId }, select: { id: true, stageId: true, projectId: true, status: true } })
  if (!approval) throw new NotFoundError('Freigabe nicht gefunden')
  const access = await requireCollaborationStageAccess(userId, approval.stageId, approverRoles)
  if (access.projectId !== approval.projectId) throw new NotFoundError('Freigabe nicht gefunden')
  if (approval.status !== 'REQUESTED') throw new ValidationError('Diese Freigabe ist bereits entschieden')
  if (decision === 'REJECTED' && !decisionNote?.trim()) throw new ValidationError('Eine Ablehnung erfordert eine Begründung')
  const updated = await prisma.$transaction(async (tx) => {
    // Optimistische Bedingung auf den Ausgangsstatus: verhindert, dass zwei
    // parallele Entscheidungen dieselbe Freigabe beide "erfolgreich" entscheiden.
    const result = await tx.collaborationApproval.updateMany({ where: { id: approvalId, status: 'REQUESTED' }, data: { status: decision, decisionNote, decidedAt: new Date(), decidedById: userId } })
    if (result.count === 0) throw new ConflictError('Diese Freigabe wurde zwischenzeitlich bereits entschieden.')
    const value = await tx.collaborationApproval.findUniqueOrThrow({ where: { id: approvalId } })
    await buildAuditLogCreate(tx, { userId, userEmail, action: 'STATUS_CHANGE', entityType: 'collaboration_approval', entityId: approvalId, oldValue: { status: approval.status }, newValue: { status: decision } })
    return value
  })
  return updated
}

export async function transitionCollaborationStage(stageId: string, target: string) {
  const { userId, userEmail } = await requireCollaborationSession()
  const access = await requireCollaborationStageAccess(userId, stageId, editorRoles)
  const stage = await prisma.collaborationProjectStage.findUnique({ where: { id: stageId }, select: {
    id: true, projectId: true, status: true, requiresApproval: true,
    dependencies: { select: { dependsOnStageId: true, requiredStatus: true, dependsOnStage: { select: { status: true } } } },
    tasks: { select: { status: true, isRequired: true } },
    checklistItems: { select: { completed: true, isRequired: true } },
    blockers: { where: { status: 'OPEN' }, select: { id: true } },
    approvals: { where: { status: 'APPROVED' }, select: { id: true } },
  } })
  if (!stage || stage.projectId !== access.projectId) throw new NotFoundError('Projektstufe nicht gefunden')
  if (!isCollaborationStageTransitionAllowed(stage.status, target as never)) throw new ValidationError(`Übergang von ${stage.status} nach ${target} ist nicht erlaubt`)
  if (target === 'IN_PROGRESS' && stage.dependencies.some((dependency) => {
    const completed = dependency.dependsOnStage.status === 'COMPLETED' || dependency.dependsOnStage.status === 'SKIPPED'
    return dependency.requiredStatus === 'COMPLETED' || dependency.requiredStatus === 'SKIPPED' ? !completed : dependency.dependsOnStage.status !== dependency.requiredStatus
  })) throw new ValidationError('Vorgelagerte Projektphasen sind noch nicht abgeschlossen')
  if (target === 'COMPLETED') {
    const blocker = getStageCompletionBlocker({
      ...stage,
      code: '',
      title: '',
      sequence: 0,
      weight: 0,
      isRequired: true,
      plannedEnd: null,
      blockedReason: null,
      dependencies: [],
      tasks: stage.tasks.map((task, index) => ({ id: String(index), title: '', priority: 'MEDIUM' as const, dueDate: null, sequence: index, ...task })),
      checklistItems: stage.checklistItems.map((item, index) => ({ id: String(index), title: '', sequence: index, completedAt: null, ...item })),
      blockers: stage.blockers.map((item) => ({ id: item.id, title: '', status: 'OPEN' as const })),
      approvals: stage.approvals.map((item) => ({ id: item.id, status: 'APPROVED' as const, requestedAt: new Date(0), decidedAt: null })),
    })
    if (blocker) throw new ValidationError(blocker)
  }
  const updated = await prisma.$transaction(async (tx) => {
    // Optimistische Bedingung auf den Ausgangsstatus: verhindert doppelte
    // Phasenübergänge bei parallelen Requests.
    const result = await tx.collaborationProjectStage.updateMany({ where: { id: stageId, status: stage.status }, data: { status: target as never, ...(target === 'COMPLETED' ? { completedAt: new Date() } : {}) } })
    if (result.count === 0) throw new ConflictError('Die Projektstufe wurde zwischenzeitlich bereits geändert.')
    const value = await tx.collaborationProjectStage.findUniqueOrThrow({ where: { id: stageId } })
    await buildAuditLogCreate(tx, { userId, userEmail, action: 'STATUS_CHANGE', entityType: 'collaboration_project_stage', entityId: stageId, oldValue: { status: stage.status }, newValue: { status: target } })
    return value
  })
  return updated
}

// ── Cross-Projekt-Sichten (Checklisten, Blocker, Team) ─────────
// Dasselbe Muster wie getVisibleCollaborationTasks/-Approvals: nur
// Projekte, in denen der aktuelle Benutzer Mitglied ist.
export async function getVisibleCollaborationChecklistItems(filters?: { projectId?: string; completed?: boolean; mine?: boolean }) {
  const { userId } = await requireCollaborationSession()
  const memberships = await prisma.collaborationMembership.findMany({ where: { userId, active: true, project: { active: true, deletedAt: null } }, select: { project: { select: { id: true } } } })
  const projectIds = memberships.map(({ project }) => project.id)
  return prisma.collaborationChecklistItem.findMany({
    where: { projectId: filters?.projectId ? { equals: filters.projectId } : { in: projectIds }, ...(filters?.completed !== undefined ? { completed: filters.completed } : {}), ...(filters?.mine ? { responsibleMembership: { userId } } : {}) },
    orderBy: [{ completed: 'asc' }, { sequence: 'asc' }],
    include: { project: { select: { id: true, name: true } }, stage: { select: { title: true } }, responsibleMembership: { select: { user: { select: { firstName: true, lastName: true } } } } },
  })
}

export async function getVisibleCollaborationBlockers(filters?: { projectId?: string; status?: string }) {
  const { userId } = await requireCollaborationSession()
  const memberships = await prisma.collaborationMembership.findMany({ where: { userId, active: true, project: { active: true, deletedAt: null } }, select: { project: { select: { id: true } } } })
  const projectIds = memberships.map(({ project }) => project.id)
  return prisma.collaborationBlocker.findMany({
    where: { projectId: filters?.projectId ? { equals: filters.projectId } : { in: projectIds }, ...(filters?.status ? { status: filters.status } : {}) } as never,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { project: { select: { id: true, name: true } }, stage: { select: { title: true } } },
  })
}

export async function getVisibleCollaborationMemberships(filters?: { projectId?: string }) {
  const { userId } = await requireCollaborationSession()
  const memberships = await prisma.collaborationMembership.findMany({ where: { userId, active: true, project: { active: true, deletedAt: null } }, select: { project: { select: { id: true } } } })
  const projectIds = memberships.map(({ project }) => project.id)
  return prisma.collaborationMembership.findMany({
    where: { active: true, projectId: filters?.projectId ? { equals: filters.projectId } : { in: projectIds } },
    orderBy: [{ role: 'asc' }],
    include: { project: { select: { id: true, name: true } }, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  })
}

// ── Letzte Aktivitäten (abgeleitet, keine eigene Tabelle) ──────
export async function getRecentCollaborationActivity(projectId: string, limit = 10) {
  const { userId } = await requireCollaborationSession()
  await requireInternalCollaborationProjectAccess(userId, projectId)

  const [tasks, checklistItems, blockers, approvals, stages] = await Promise.all([
    prisma.collaborationTask.findMany({ where: { projectId, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: limit, select: { id: true, title: true, status: true, completedAt: true, stage: { select: { title: true } } } }),
    prisma.collaborationChecklistItem.findMany({ where: { projectId, completed: true, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: limit, select: { id: true, title: true, completedAt: true, stage: { select: { title: true } } } }),
    prisma.collaborationBlocker.findMany({ where: { projectId, status: 'RESOLVED', resolvedAt: { not: null } }, orderBy: { resolvedAt: 'desc' }, take: limit, select: { id: true, title: true, resolvedAt: true, stage: { select: { title: true } } } }),
    prisma.collaborationApproval.findMany({ where: { projectId, decidedAt: { not: null } }, orderBy: { decidedAt: 'desc' }, take: limit, select: { id: true, status: true, decidedAt: true, stage: { select: { title: true } } } }),
    prisma.collaborationProjectStage.findMany({ where: { projectId, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: limit, select: { id: true, title: true, completedAt: true } }),
  ])

  const events = [
    ...tasks.map((task) => ({ id: `task-${task.id}`, at: task.completedAt as Date, label: `Aufgabe „${task.title}“ ${task.status === 'SKIPPED' ? 'übersprungen' : 'erledigt'}`, stage: task.stage.title })),
    ...checklistItems.map((item) => ({ id: `check-${item.id}`, at: item.completedAt as Date, label: `Checklistenpunkt „${item.title}“ erledigt`, stage: item.stage.title })),
    ...blockers.map((blocker) => ({ id: `blocker-${blocker.id}`, at: blocker.resolvedAt as Date, label: `Blocker „${blocker.title}“ gelöst`, stage: blocker.stage?.title ?? null })),
    ...approvals.map((approval) => ({ id: `approval-${approval.id}`, at: approval.decidedAt as Date, label: `Freigabe ${approval.status === 'APPROVED' ? 'genehmigt' : 'abgelehnt'}`, stage: approval.stage.title })),
    ...stages.map((stage) => ({ id: `stage-${stage.id}`, at: stage.completedAt as Date, label: `Phase „${stage.title}“ abgeschlossen`, stage: stage.title })),
  ]
  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit)
}

// ── Kontrollierte Stage-Überführung (Section 3) ─────────────────
// Ersetzt die vorhandenen Stages eines CollaborationProject durch
// einen neuen Plan. Bricht sicher ab, sobald irgendeine bestehende
// Stage bereits Tasks/Checklisten/Blocker/Freigaben besitzt — dann
// ist eine reine Lösch-Neuanlage nicht mehr zulässig und ein Daten-
// migrationspfad müsste zuerst separat entworfen werden.
const stagePlanInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(120),
  weight: z.number().min(0).max(100),
  requiresApproval: z.boolean().default(false),
})

export const GGA_FIVE_PHASE_PLAN = [
  { code: 'KONZEPT', title: 'Konzept', weight: 10, requiresApproval: false },
  { code: 'PLANUNG', title: 'Planung', weight: 20, requiresApproval: true },
  { code: 'UMSETZUNG', title: 'Umsetzung', weight: 35, requiresApproval: false },
  { code: 'ABNAHME', title: 'Abnahme', weight: 25, requiresApproval: true },
  { code: 'ABSCHLUSS', title: 'Abschluss', weight: 10, requiresApproval: false },
] as const

export async function restructureCollaborationProjectStages(projectId: string, plan: Array<{ code: string; title: string; weight: number; requiresApproval?: boolean }>) {
  const { userId, userEmail } = await requireCollaborationSession()
  await requireCollaborationManager(userId, projectId)
  const parsedPlan = z.array(stagePlanInputSchema).min(1).parse(plan)
  const codes = new Set(parsedPlan.map((item) => item.code))
  if (codes.size !== parsedPlan.length) throw new ValidationError('Stage-Codes müssen eindeutig sein')

  return prisma.$transaction(async (tx) => {
    const existingStages = await tx.collaborationProjectStage.findMany({
      where: { projectId },
      select: { id: true, code: true, title: true, _count: { select: { tasks: true, checklistItems: true, blockers: true, approvals: true } } },
    })
    const withDependents = existingStages.filter((stage) => stage._count.tasks + stage._count.checklistItems + stage._count.blockers + stage._count.approvals > 0)
    if (withDependents.length > 0) throw new BusinessRuleError(`Überführung abgebrochen: Phase(n) ${withDependents.map((stage) => stage.title).join(', ')} besitzen bereits Aufgaben, Checklisten, Blocker oder Freigaben.`)

    const oldSummary = existingStages.map((stage) => ({ code: stage.code, title: stage.title }))
    await tx.collaborationProjectStage.deleteMany({ where: { projectId } })

    const created: { id: string; code: string }[] = []
    for (const [index, stage] of parsedPlan.entries()) {
      const row = await tx.collaborationProjectStage.create({ data: { projectId, code: stage.code, title: stage.title, sequence: index + 1, weight: stage.weight, requiresApproval: stage.requiresApproval ?? false } })
      created.push({ id: row.id, code: row.code })
    }
    for (let index = 1; index < created.length; index++) {
      await tx.collaborationProjectStageDependency.create({ data: { stageId: created[index].id, dependsOnStageId: created[index - 1].id, requiredStatus: 'COMPLETED' } })
    }

    await buildAuditLogCreate(tx, { userId, userEmail, action: 'UPDATE', entityType: 'collaboration_project', entityId: projectId, oldValue: { stages: oldSummary }, newValue: { stages: parsedPlan.map((item) => ({ code: item.code, title: item.title })) }, metadata: { reason: 'Überführung auf 5-Phasen-Modell' } })

    return created
  })
}
