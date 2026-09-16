import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoleName as RoleNameType } from '@/types/enums'
import { RoleName } from '@/types/enums'

const authState = vi.hoisted(() => ({
  role: null as RoleNameType | null,
}))

const service = vi.hoisted(() => ({
  linkExistingCollaborationProject: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => (authState.role ? { user: { id: 'user-1', email: 'actor@twir.de', role: authState.role } } : null)),
}))

vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()
  return {
    ...actual,
    requirePermission: async (resource: typeof actual.Resource[keyof typeof actual.Resource], action: typeof actual.Action[keyof typeof actual.Action]) => {
      if (!authState.role) throw new actual.UnauthorizedError('Nicht angemeldet')
      if (!actual.roleHasPermission(authState.role, resource, action)) throw new actual.ForbiddenError(`Keine Berechtigung: ${resource}:${action} für Rolle ${authState.role}`)
      return { userId: 'user-1', userEmail: 'actor@twir.de', role: authState.role }
    },
  }
})

vi.mock('@/lib/services/project.service', () => ({
  linkExistingCollaborationProject: service.linkExistingCollaborationProject,
}))

// requirePermission-Mock oben ersetzt bereits alles Nötige; kein Unmock erforderlich.

import { linkExistingCollaborationProjectAction } from '@/app/(dashboard)/projects/actions'

describe('linkExistingCollaborationProjectAction — Autorisierung', () => {
  beforeEach(() => {
    authState.role = null
    service.linkExistingCollaborationProject.mockReset()
    service.linkExistingCollaborationProject.mockResolvedValue({ id: 'collab-1' })
  })

  it('T8: lehnt einen internen Benutzer ohne project:update-Berechtigung ab, ohne den Service aufzurufen', async () => {
    authState.role = RoleName.EMPLOYEE
    const result = await linkExistingCollaborationProjectAction('project-1', 'collab-1')
    expect(result.error).toBeTruthy()
    expect(service.linkExistingCollaborationProject).not.toHaveBeenCalled()
  })

  it('T9: lehnt einen Aufruf ohne interne Session ab (z.B. reine Collaboration-Session), ohne den Service aufzurufen', async () => {
    authState.role = null
    const result = await linkExistingCollaborationProjectAction('project-1', 'collab-1')
    expect(result.error).toBeTruthy()
    expect(service.linkExistingCollaborationProject).not.toHaveBeenCalled()
  })

  it('erlaubt einem berechtigten internen Benutzer (PROJECT_MANAGER) die Verknüpfung', async () => {
    authState.role = RoleName.PROJECT_MANAGER
    const result = await linkExistingCollaborationProjectAction('project-1', 'collab-1')
    expect(result.error).toBeUndefined()
    expect(service.linkExistingCollaborationProject).toHaveBeenCalledWith('project-1', 'collab-1', { userId: 'user-1', userEmail: 'actor@twir.de' })
  })
})
