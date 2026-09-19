import { beforeEach, describe, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))
import { prisma } from '@/lib/db/prisma'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/auth/permissions'
import { decideCollaborationApproval, setCollaborationChecklistCompleted, setCollaborationTaskStatus, transitionCollaborationStage } from '@/lib/services/collaboration-phase2.service'

describe('Collaboration-Phase-3-Mutationen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'u1@test', authScope: 'COLLABORATION' } })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', status: 'ACTIVE', deletedAt: null } as never)
    vi.mocked(prisma.collaborationProjectStage.findFirst).mockResolvedValue({ id: 's1', projectId: 'p1', code: 'PLAN', title: 'Plan', project: { memberships: [{ id: 'm1', role: 'INTERNAL_PLANNER' }] } } as never)
  })

  it('verhindert IDOR bei Task-Statusänderung', async () => {
    vi.mocked(prisma.collaborationTask.findUnique).mockResolvedValue({ id: 't1', stageId: 's1', projectId: 'p2', status: 'TODO' } as never)
    await expect(setCollaborationTaskStatus('t1', 'DONE')).rejects.toBeInstanceOf(NotFoundError)
    expect(prisma.collaborationTask.updateMany).not.toHaveBeenCalled()
  })

  it('setzt Checklistenpunkte nachvollziehbar und erlaubt Wiederöffnen', async () => {
    vi.mocked(prisma.collaborationChecklistItem.findUnique).mockResolvedValue({ id: 'c1', stageId: 's1', projectId: 'p1', completed: false } as never)
    vi.mocked(prisma.collaborationChecklistItem.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.collaborationChecklistItem.findUniqueOrThrow).mockResolvedValueOnce({ id: 'c1', completed: true } as never).mockResolvedValueOnce({ id: 'c1', completed: false } as never)
    await expect(setCollaborationChecklistCompleted('c1', true)).resolves.toMatchObject({ completed: true })
    await expect(setCollaborationChecklistCompleted('c1', false)).resolves.toMatchObject({ completed: false })
  })

  it('beschränkt Approval-Entscheidungen auf INTERNAL_PLANNER', async () => {
    vi.mocked(prisma.collaborationProjectStage.findFirst).mockResolvedValue({ id: 's1', projectId: 'p1', code: 'PLAN', title: 'Plan', project: { memberships: [{ id: 'm1', role: 'PARTNER' }] } } as never)
    vi.mocked(prisma.collaborationApproval.findUnique).mockResolvedValue({ id: 'a1', stageId: 's1', projectId: 'p1', status: 'REQUESTED' } as never)
    await expect(decideCollaborationApproval('a1', 'APPROVED')).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('verhindert Stage-Abschluss bei offenen Pflichtaufgaben', async () => {
    vi.mocked(prisma.collaborationProjectStage.findUnique).mockResolvedValue({ id: 's1', projectId: 'p1', status: 'IN_PROGRESS', requiresApproval: false, code: 'PLAN', dependencies: [], tasks: [{ status: 'TODO', isRequired: true }], checklistItems: [], blockers: [], approvals: [] } as never)
    // REQ-015.4: transitionCollaborationStage() lädt bei target COMPLETED
    // zusätzlich die Cabinet-Readiness des Projekts (GgaCabinet.projectId) —
    // dieses Projekt hat keine GGA-Cabinets, daher leere Liste.
    vi.mocked(prisma.ggaCabinet.findMany).mockResolvedValue([])
    await expect(transitionCollaborationStage('s1', 'COMPLETED')).rejects.toBeInstanceOf(ValidationError)
    expect(prisma.collaborationProjectStage.updateMany).not.toHaveBeenCalled()
  })
})
