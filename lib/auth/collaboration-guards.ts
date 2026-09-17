import { getServerSession } from 'next-auth'
import { forbidden, notFound, unauthorized } from 'next/navigation'
import { collaborationAuthOptions } from '@/lib/auth/collaboration-options'
import { prisma } from '@/lib/db/prisma'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/auth/permissions'

/**
 * Zentrale Fehlerbehandlung für Collaboration-Seiten: ein aus einem
 * try/catch um einen Service-Aufruf durchgereichter Fehler wird auf den
 * jeweils richtigen Next.js-Interrupt abgebildet (404/403/401), statt als
 * generischer 500-Fehler zu enden. Ersetzt die zuvor pro Seite verstreuten
 * `if (error instanceof NotFoundError) notFound()`-Einzelfälle, die
 * ForbiddenError/UnauthorizedError nicht abdeckten.
 */
export function handleCollaborationPageError(error: unknown): never {
  if (error instanceof NotFoundError) notFound()
  if (error instanceof ForbiddenError) forbidden()
  if (error instanceof UnauthorizedError) unauthorized()
  throw error
}

export async function requireCollaborationSession() {
  const session = await getServerSession(collaborationAuthOptions)
  if (!session?.user?.id || session.user.authScope !== 'COLLABORATION') {
    throw new UnauthorizedError('Nicht im Projektportal angemeldet')
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, status: true, deletedAt: true },
  })
  if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
    throw new UnauthorizedError('Nicht im Projektportal angemeldet')
  }
  return { userId: session.user.id, userEmail: session.user.email }
}

export async function requireCollaborationProjectAccess(userId: string, projectId: string) {
  const membership = await prisma.collaborationMembership.findFirst({
    where: {
      userId,
      projectId,
      active: true,
      project: { active: true, deletedAt: null },
    },
    select: {
      id: true,
      role: true,
      project: { select: { id: true, name: true } },
    },
  })
  if (!membership) throw new NotFoundError('Projekt nicht gefunden')
  return membership
}

export async function requireCurrentCollaborationProjectAccess(projectId: string) {
  const { userId } = await requireCollaborationSession()
  return requireCollaborationProjectAccess(userId, projectId)
}

/**
 * Object-level guard for stage-scoped collaboration mutations and reads.
 * A project membership is required even when a caller knows a stage UUID.
 */
export async function requireCollaborationStageAccess(
  userId: string,
  stageId: string,
  allowedRoles?: readonly string[],
) {
  const stage = await prisma.collaborationProjectStage.findFirst({
    where: {
      id: stageId,
      project: {
        active: true,
        deletedAt: null,
        memberships: {
          some: { userId, active: true },
        },
      },
    },
    select: {
      id: true,
      projectId: true,
      code: true,
      title: true,
      project: {
        select: {
          memberships: {
            where: { userId, active: true },
            select: { id: true, role: true },
          },
        },
      },
    },
  })

  if (!stage) throw new NotFoundError('Projektstufe nicht gefunden')

  const membership = stage.project.memberships[0]
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new ForbiddenError('Keine Berechtigung für diese Projektstufe')
  }

  return {
    id: stage.id,
    projectId: stage.projectId,
    code: stage.code,
    title: stage.title,
    membership,
  }
}

export async function requireCurrentCollaborationStageAccess(
  stageId: string,
  allowedRoles?: readonly string[],
) {
  const { userId } = await requireCollaborationSession()
  return requireCollaborationStageAccess(userId, stageId, allowedRoles)
}

/**
 * Object-level guard for cabinet-scoped collaboration mutations and reads.
 * Resolves cabinetId -> projectId server-side and requires project
 * membership even when a caller knows a cabinet UUID (IDOR protection).
 */
export async function requireCollaborationCabinetAccess(
  userId: string,
  cabinetId: string,
  allowedRoles?: readonly string[],
) {
  const cabinet = await prisma.ggaCabinet.findFirst({
    where: {
      id: cabinetId,
      deletedAt: null,
      project: {
        active: true,
        deletedAt: null,
        memberships: {
          some: { userId, active: true },
        },
      },
    },
    select: {
      id: true,
      projectId: true,
      kennung: true,
      bezeichnung: true,
      project: {
        select: {
          memberships: {
            where: { userId, active: true },
            select: { id: true, role: true },
          },
        },
      },
    },
  })

  if (!cabinet) throw new NotFoundError('Schrank nicht gefunden')

  const membership = cabinet.project.memberships[0]
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new ForbiddenError('Keine Berechtigung für diesen Schrank')
  }

  return {
    id: cabinet.id,
    projectId: cabinet.projectId,
    kennung: cabinet.kennung,
    bezeichnung: cabinet.bezeichnung,
    membership,
  }
}

export async function requireCurrentCollaborationCabinetAccess(
  cabinetId: string,
  allowedRoles?: readonly string[],
) {
  const { userId } = await requireCollaborationSession()
  return requireCollaborationCabinetAccess(userId, cabinetId, allowedRoles)
}

export async function requireCollaborationManager(userId: string, projectId: string) {
  const membership = await requireCollaborationProjectAccess(userId, projectId)
  if (membership.role !== 'COLLAB_MANAGER') {
    throw new ForbiddenError('Keine Berechtigung zur Projektverwaltung')
  }
  return membership
}
