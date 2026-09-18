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

  describe('resolve-blocker — Behebungsbeschreibung ist Pflichtfeld (REQ-011)', () => {
    it('lehnt einen fehlenden Resolution-Wert ab, ohne den Service aufzurufen', async () => {
      const response = await POST(new Request('https://example.test/api/collaboration/workflow', { method: 'POST', body: JSON.stringify({ action: 'resolve-blocker', id: 'blocker-1' }) }))
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ ok: false, error: 'Eine Behebungsbeschreibung ist erforderlich' })
      expect(service.resolveCollaborationBlocker).not.toHaveBeenCalled()
    })

    it('lehnt einen leeren Resolution-Text ab, ohne den Service aufzurufen', async () => {
      const response = await POST(new Request('https://example.test/api/collaboration/workflow', { method: 'POST', body: JSON.stringify({ action: 'resolve-blocker', id: 'blocker-1', resolution: '' }) }))
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ ok: false, error: 'Eine Behebungsbeschreibung ist erforderlich' })
      expect(service.resolveCollaborationBlocker).not.toHaveBeenCalled()
    })

    it('lehnt einen Resolution-Text aus ausschließlich Leerzeichen/Whitespace ab, ohne den Service aufzurufen', async () => {
      const response = await POST(new Request('https://example.test/api/collaboration/workflow', { method: 'POST', body: JSON.stringify({ action: 'resolve-blocker', id: 'blocker-1', resolution: '   \n\t  ' }) }))
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ ok: false, error: 'Eine Behebungsbeschreibung ist erforderlich' })
      expect(service.resolveCollaborationBlocker).not.toHaveBeenCalled()
    })

    it('ruft den Service bei gültigem Resolution-Text genau einmal mit dem getrimmten Text auf und gibt Resolution/resolvedAt unverändert zurück', async () => {
      const resolvedAt = new Date('2026-09-18T10:00:00.000Z')
      service.resolveCollaborationBlocker.mockResolvedValue({ id: 'blocker-1', status: 'RESOLVED', resolution: 'Dichtung ersetzt und Tür neu justiert.', resolvedAt })
      const response = await POST(new Request('https://example.test/api/collaboration/workflow', { method: 'POST', body: JSON.stringify({ action: 'resolve-blocker', id: 'blocker-1', resolution: '  Dichtung ersetzt und Tür neu justiert.  ' }) }))
      expect(response.status).toBe(200)
      expect(service.resolveCollaborationBlocker).toHaveBeenCalledTimes(1)
      expect(service.resolveCollaborationBlocker).toHaveBeenCalledWith('blocker-1', 'Dichtung ersetzt und Tür neu justiert.')
      const body = await response.json()
      expect(body).toMatchObject({ ok: true, result: { status: 'RESOLVED', resolution: 'Dichtung ersetzt und Tür neu justiert.' } })
    })

    it('gibt einen Concurrency-Konflikt aus dem Service unverändert als Fehler zurück, ohne einen zweiten Versuch zu unternehmen', async () => {
      service.resolveCollaborationBlocker.mockRejectedValue(new Error('Dieser Blocker wurde zwischenzeitlich bereits bearbeitet.'))
      const response = await POST(new Request('https://example.test/api/collaboration/workflow', { method: 'POST', body: JSON.stringify({ action: 'resolve-blocker', id: 'blocker-1', resolution: 'Behoben' }) }))
      expect(response.status).toBe(500)
      expect(await response.json()).toMatchObject({ ok: false, error: 'Dieser Blocker wurde zwischenzeitlich bereits bearbeitet.' })
      expect(service.resolveCollaborationBlocker).toHaveBeenCalledTimes(1)
    })
  })
})
