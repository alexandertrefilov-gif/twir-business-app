import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

import { prisma } from '@/lib/db/prisma'
import { NotFoundError, UnauthorizedError } from '@/lib/auth/permissions'
import {
  requireCollaborationManager,
  requireCollaborationProjectAccess,
  requireCollaborationSession,
  requireCollaborationStageAccess,
} from '@/lib/auth/collaboration-guards'
import {
  COLLABORATION_SESSION_COOKIE,
  INTERNAL_SESSION_COOKIE,
  authCookies,
} from '@/lib/auth/session-cookies'

describe('Collaboration-Mandantentrennung', () => {
  beforeEach(() => vi.clearAllMocks())

  it('verwendet getrennte Session-, Callback- und CSRF-Cookies', () => {
    expect(INTERNAL_SESSION_COOKIE).not.toBe(COLLABORATION_SESSION_COOKIE)
    expect(authCookies('internal').csrfToken.name).not.toBe(authCookies('collaboration').csrfToken.name)
    expect(authCookies('internal').callbackUrl.name).not.toBe(authCookies('collaboration').callbackUrl.name)
  })

  it('akzeptiert nur eine ausdrücklich markierte Collaboration-Session', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', status: 'ACTIVE', deletedAt: null } as never)
    auth.getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.test', authScope: 'INTERNAL' } })
    await expect(requireCollaborationSession()).rejects.toBeInstanceOf(UnauthorizedError)
    auth.getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.test', authScope: 'COLLABORATION' } })
    await expect(requireCollaborationSession()).resolves.toEqual({ userId: 'u1', userEmail: 'a@b.test' })
  })

  it('verweigert Sitzungen für deaktivierte oder gelöschte Benutzer', async () => {
    auth.getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.test', authScope: 'COLLABORATION' } })
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'u1', status: 'INACTIVE', deletedAt: null } as never)
    await expect(requireCollaborationSession()).rejects.toBeInstanceOf(UnauthorizedError)
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'u1', status: 'ACTIVE', deletedAt: new Date() } as never)
    await expect(requireCollaborationSession()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('liefert nur das aktiv freigegebene Projekt und verbirgt fremde IDs', async () => {
    const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
    findFirst.mockResolvedValueOnce({ id: 'm1', role: 'COLLAB_VIEWER', project: { id: 'p1', name: 'Projekt A' } } as never)
    await expect(requireCollaborationProjectAccess('u1', 'p1')).resolves.toMatchObject({ project: { id: 'p1' } })
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'u1', projectId: 'p1', active: true }),
    }))
    findFirst.mockResolvedValueOnce(null)
    await expect(requireCollaborationProjectAccess('u1', 'p2')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('erlaubt Projektverwaltung nur über eine COLLAB_MANAGER-Membership', async () => {
    const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
    findFirst.mockResolvedValueOnce({ id: 'm-admin', role: 'COLLAB_MANAGER', project: { id: 'p1', name: 'Projekt A' } } as never)
    await expect(requireCollaborationManager('admin-user', 'p1')).resolves.toMatchObject({ role: 'COLLAB_MANAGER' })
    expect(findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'admin-user', projectId: 'p1' }),
    }))
  })

  it('prüft Stage-Zugriff über die aktive Projektmitgliedschaft', async () => {
    const findFirst = vi.mocked(prisma.collaborationProjectStage.findFirst)
    findFirst.mockResolvedValueOnce({
      id: 'stage-1',
      projectId: 'p1',
      code: 'PLANUNG',
      title: 'Planung',
      project: { memberships: [{ id: 'm1', role: 'PARTNER' }] },
    } as never)

    await expect(requireCollaborationStageAccess('u1', 'stage-1', ['PARTNER'])).resolves.toMatchObject({
      projectId: 'p1',
      membership: { role: 'PARTNER' },
    })
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'stage-1',
        project: expect.objectContaining({
          memberships: { some: { userId: 'u1', active: true } },
        }),
      }),
    }))
  })
})
