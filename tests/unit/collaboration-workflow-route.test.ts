import { beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({
  createCollaborationTask: vi.fn(),
  setCollaborationTaskStatus: vi.fn(),
  createCollaborationChecklistItem: vi.fn(),
  setCollaborationChecklistCompleted: vi.fn(),
  createCollaborationBlocker: vi.fn(),
  resolveCollaborationBlocker: vi.fn(),
  requestCollaborationApproval: vi.fn(),
  decideCollaborationApproval: vi.fn(),
  transitionCollaborationStage: vi.fn(),
  updateCollaborationTask: vi.fn(),
}))
vi.mock('@/lib/services/collaboration-phase2.service', () => service)

import { POST } from '@/app/api/collaboration/workflow/route'

describe('Collaboration-Workflow-API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('leitet Task-Status serverseitig an den Service weiter', async () => {
    service.setCollaborationTaskStatus.mockResolvedValue({ id: 'task-1', status: 'DONE' })
    const response = await POST(new Request('https://example.test/api/collaboration/workflow', { method: 'POST', body: JSON.stringify({ action: 'task-status', id: 'task-1', status: 'DONE' }) }))
    expect(response.status).toBe(200)
    expect(service.setCollaborationTaskStatus).toHaveBeenCalledWith('task-1', 'DONE')
  })

  it('validiert fehlendes Projekt beim Blocker-Anlegen', async () => {
    const response = await POST(new Request('https://example.test/api/collaboration/workflow', { method: 'POST', body: JSON.stringify({ action: 'create-blocker', id: 'stage-1', data: { title: 'Blocker' } }) }))
    expect(response.status).toBe(400)
    expect(service.createCollaborationBlocker).not.toHaveBeenCalled()
  })

  it('gibt die serverseitige Fehlermeldung als HTTP-Fehler zurück', async () => {
    service.decideCollaborationApproval.mockRejectedValue(new Error('Keine Berechtigung'))
    const response = await POST(new Request('https://example.test/api/collaboration/workflow', { method: 'POST', body: JSON.stringify({ action: 'decide-approval', id: 'approval-1', decision: 'APPROVED' }) }))
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ ok: false, error: 'Keine Berechtigung' })
  })
})
