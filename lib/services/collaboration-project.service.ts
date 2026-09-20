import { requireCollaborationProjectAccess, requireCollaborationSession } from '@/lib/auth/collaboration-guards'
import { NotFoundError } from '@/lib/auth/permissions'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import {
  calculateProjectHealth,
  calculateProjectProgress,
  deriveNextAction,
  deriveStageStatuses,
  type CollaborationStageSnapshot,
} from '@/lib/collaboration/project-workflow'

const stageSelect = {
  id: true,
  code: true,
  title: true,
  sequence: true,
  status: true,
  weight: true,
  isRequired: true,
  requiresApproval: true,
  plannedEnd: true,
  blockedReason: true,
  dependencies: { select: { dependsOnStageId: true, requiredStatus: true } },
  tasks: { orderBy: { sequence: 'asc' as const }, select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, sequence: true, isRequired: true } },
  checklistItems: { orderBy: { sequence: 'asc' as const }, select: { id: true, title: true, sequence: true, isRequired: true, completed: true, completedAt: true, responsibleMembershipId: true } },
  blockers: { where: { status: 'OPEN' as const }, orderBy: { createdAt: 'asc' as const }, select: { id: true, title: true, description: true, status: true, cause: true, resolution: true, stageId: true, taskId: true } },
  approvals: { orderBy: { requestedAt: 'desc' as const }, select: { id: true, status: true, requestedAt: true, decidedAt: true, decisionNote: true, cabinetId: true } },
} as const

type StageRow = Prisma.CollaborationProjectStageGetPayload<{ select: typeof stageSelect }>

function toStageSnapshot(stage: StageRow): CollaborationStageSnapshot {
  return {
    id: stage.id,
    code: stage.code,
    title: stage.title,
    sequence: stage.sequence,
    status: stage.status,
    weight: Number(stage.weight),
    isRequired: stage.isRequired,
    requiresApproval: stage.requiresApproval,
    plannedEnd: stage.plannedEnd,
    blockedReason: stage.blockedReason,
    dependencies: stage.dependencies,
    tasks: stage.tasks,
    checklistItems: stage.checklistItems,
    blockers: stage.blockers,
    approvals: stage.approvals,
  }
}

const projectSelect = {
  id: true,
  projectNumber: true,
  name: true,
  description: true,
  year: true,
  status: true,
  location: true,
  building: true,
  floor: true,
  area: true,
  plannedStart: true,
  plannedEnd: true,
  stages: { orderBy: { sequence: 'asc' as const }, select: stageSelect },
  blockers: { where: { status: 'OPEN' as const }, orderBy: { createdAt: 'asc' as const }, select: { id: true, title: true, status: true, cabinetId: true } },
} as const

type ProjectRow = Prisma.CollaborationProjectGetPayload<{ select: typeof projectSelect }>

function toProjectView(project: ProjectRow, role?: string) {
  const stages = project.stages.map(toStageSnapshot)
  const derivedStages = deriveStageStatuses(stages)
  const projectBlocker = project.blockers[0]
  return {
    id: project.id,
    projectNumber: project.projectNumber,
    name: project.name,
    description: project.description,
    year: project.year,
    status: project.status,
    healthStatus: projectBlocker ? 'RED' : calculateProjectHealth(stages),
    location: project.location,
    building: project.building,
    floor: project.floor,
    area: project.area,
    plannedStart: project.plannedStart,
    plannedEnd: project.plannedEnd,
    role,
    progressPercent: calculateProjectProgress(stages),
    nextAction: projectBlocker?.title ?? deriveNextAction(derivedStages),
    stages: derivedStages,
    // GGA-Portal Produktblock 1: wie viele der offenen Blocker KEINEM
    // GGA-Schrank zugeordnet sind (cabinetId null) — bereits durch obiges
    // blockers-Select geladen, hier nur zusätzlich gezählt. Damit kann die
    // Projektmatrix einen "Kritisch"-Status ehrlich einem projektweiten
    // Blocker zuschreiben, statt ihn mit einem GGA-Schrank-Grund zu vermischen.
    offeneProjektweiteBlocker: project.blockers.filter((blocker) => !blocker.cabinetId).length,
  }
}

export async function getVisibleCollaborationProjects() {
  const { userId } = await requireCollaborationSession()
  const memberships = await prisma.collaborationMembership.findMany({
    where: { userId, active: true, project: { active: true, deletedAt: null } },
    orderBy: { project: { name: 'asc' } },
    select: { role: true, project: { select: projectSelect } },
  })
  return memberships.map(({ project, role }) => toProjectView(project, role))
}

export async function getVisibleCollaborationProject(projectId: string) {
  const { userId } = await requireCollaborationSession()
  const membership = await requireCollaborationProjectAccess(userId, projectId)
  const project = await prisma.collaborationProject.findFirst({
    where: { id: projectId, active: true, deletedAt: null },
    select: projectSelect,
  })
  if (!project) throw new NotFoundError('Projekt nicht gefunden')
  return toProjectView(project, membership.role)
}
