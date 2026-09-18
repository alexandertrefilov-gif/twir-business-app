import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

import { prisma } from '@/lib/db/prisma'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/auth/permissions'
import {
  requireCollaborationCabinetAccess,
  requireCollaborationManager,
  requireCollaborationProjectAccess,
  requireCollaborationSession,
  requireCollaborationStageAccess,
  requireInternalCollaborationProjectAccess,
  internalCollaborationRoles,
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

// GGA-04.1: requireCollaborationProjectAccess() selbst ist absichtlich
// rollenagnostisch (siehe Kommentar dort — Dokumente/Betreiber-Freigabe
// brauchen weiterhin jede Rolle inkl. OPERATOR). requireInternalCollaboration-
// ProjectAccess() ist der zusätzliche Guard für ausschließlich intern
// genutzte Lesezugriffe (Projektdetail, Aktivitäten, GGA-Kennzahlen/
// -Arbeitsliste) und schließt OPERATOR serverseitig aus.
describe('requireInternalCollaborationProjectAccess (GGA-04.1)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('A) erlaubt jede interne Collaboration-Rolle', async () => {
    const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
    for (const role of internalCollaborationRoles) {
      findFirst.mockResolvedValueOnce({ id: 'm1', role, project: { id: 'p1', name: 'Projekt A' } } as never)
      await expect(requireInternalCollaborationProjectAccess('u1', 'p1')).resolves.toMatchObject({ role })
    }
  })

  it('B) lehnt eine OPERATOR-Mitgliedschaft mit ForbiddenError ab, obwohl die Projektmitgliedschaft selbst gültig ist', async () => {
    const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
    findFirst.mockResolvedValueOnce({ id: 'm1', role: 'OPERATOR', project: { id: 'p1', name: 'Projekt A' } } as never)
    await expect(requireInternalCollaborationProjectAccess('operator-user', 'p1')).rejects.toBeInstanceOf(ForbiddenError)
    // Die zugrunde liegende Mitgliedschaftsprüfung bleibt unverändert (IDOR-Schutz):
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'operator-user', projectId: 'p1', active: true }),
    }))
  })

  it('H) eine interne Rolle ohne jede Projektmitgliedschaft bleibt weiterhin verboten (NotFoundError, nicht ForbiddenError)', async () => {
    const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
    findFirst.mockResolvedValueOnce(null)
    await expect(requireInternalCollaborationProjectAccess('u1', 'fremdes-projekt')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('C) derselbe OPERATOR-Ausschluss gilt für interne Schrank-Ressourcen (requireCollaborationCabinetAccess mit internalCollaborationRoles)', async () => {
    const findFirst = vi.mocked(prisma.ggaCabinet.findFirst)
    findFirst.mockResolvedValueOnce({
      id: 'cabinet-1', projectId: 'p1', kennung: 'K-001', bezeichnung: 'Schrank',
      project: { memberships: [{ id: 'm1', role: 'OPERATOR' }] },
    } as never)
    await expect(requireCollaborationCabinetAccess('operator-user', 'cabinet-1', internalCollaborationRoles as unknown as string[])).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('F) OPERATOR-Zugriff auf die gemeinsam genutzte Schrank-Detailfunktion (getGgaCabinetDetail, ohne allowedRoles) bleibt erlaubt — Betreiberportal darf nicht brechen', async () => {
    const findFirst = vi.mocked(prisma.ggaCabinet.findFirst)
    findFirst.mockResolvedValueOnce({
      id: 'cabinet-1', projectId: 'p1', kennung: 'K-001', bezeichnung: 'Schrank',
      project: { memberships: [{ id: 'm1', role: 'OPERATOR' }] },
    } as never)
    await expect(requireCollaborationCabinetAccess('operator-user', 'cabinet-1')).resolves.toMatchObject({ membership: { role: 'OPERATOR' } })
  })

  it('G) Cross-Project-IDOR bleibt für OPERATOR wie für jede andere Rolle verboten (NotFoundError statt Daten aus einem fremden Projekt)', async () => {
    const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
    findFirst.mockResolvedValueOnce(null) // OPERATOR ist nicht Mitglied von Projekt B
    await expect(requireInternalCollaborationProjectAccess('operator-user', 'projekt-b')).rejects.toBeInstanceOf(NotFoundError)
  })
})

// GGA-04.2 (P0-A): statische Regressionssicherung gegen ein versehentliches
// erneutes Hinzufügen von 'OPERATOR' zu editorRoles — die vollständige
// Verhaltensprüfung (kann OPERATOR tatsächlich keine internen Mutationen
// mehr ausführen) läuft als Integrationstest gegen eine echte DB, siehe
// tests/integration/gga-cabinet-db.test.ts → "GGA-04.2".
describe('editorRoles (GGA-04.2: P0-A)', () => {
  it('enthält OPERATOR nicht — der einzige legitime OPERATOR-Schreibpfad ist vollständig getrennt (decideGgaCabinetOperatorApproval, [\'OPERATOR\'])', async () => {
    const { editorRoles } = await import('@/lib/services/collaboration-phase2.service')
    expect(editorRoles).not.toContain('OPERATOR')
    expect(editorRoles).toEqual(['COLLAB_MANAGER', 'INTERNAL_PLANNER', 'EXTERNAL_PLANNER', 'PARTNER'])
  })
})

// GGA-04.3: getVisibleCollaborationMemberships() prüfte bei explizitem
// projectId-Filter bislang nicht, ob der aktuelle Nutzer Mitglied dieses
// Projekts ist — /collaboration/team?project=<fremde-id> konnte damit Namen/
// Rollen eines fremden Projekts offenlegen. Die volle Rollenmatrix
// (OPERATOR/VIEWER/MEMBER/interner Editor, same-project, cross-project,
// unbekannte projectId, ohne projectId) läuft als Integrationstest gegen
// eine echte DB, siehe tests/integration/gga-cabinet-db.test.ts → "GGA-04.3".
describe('getVisibleCollaborationMemberships (GGA-04.3)', () => {
  beforeEach(() => vi.clearAllMocks())

  function asUser(userId: string) {
    auth.getServerSession.mockResolvedValue({ user: { id: userId, email: `${userId}@example.test`, authScope: 'COLLABORATION' } })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: userId, status: 'ACTIVE', deletedAt: null } as never)
  }

  it('same-project: prüft Mitgliedschaft am gefilterten Projekt, bevor die Liste geladen wird', async () => {
    asUser('u1')
    const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
    findFirst.mockResolvedValueOnce({ id: 'm1', role: 'COLLAB_MEMBER', project: { id: 'p1', name: 'Projekt A' } } as never)
    const findMany = vi.mocked(prisma.collaborationMembership.findMany)
    findMany.mockResolvedValueOnce([{ id: 'm1', role: 'COLLAB_MEMBER', project: { id: 'p1', name: 'Projekt A' }, user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'u1@example.test' } }] as never)
    const { getVisibleCollaborationMemberships } = await import('@/lib/services/collaboration-phase2.service')
    await expect(getVisibleCollaborationMemberships({ projectId: 'p1' })).resolves.toHaveLength(1)
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', projectId: 'p1', active: true }) }))
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ projectId: 'p1' }) }))
  })

  it('cross-project IDOR: NotFoundError statt Mitgliederliste eines fremden Projekts — kein findMany-Aufruf danach', async () => {
    asUser('u1')
    vi.mocked(prisma.collaborationMembership.findFirst).mockResolvedValueOnce(null)
    const findMany = vi.mocked(prisma.collaborationMembership.findMany)
    const { getVisibleCollaborationMemberships } = await import('@/lib/services/collaboration-phase2.service')
    await expect(getVisibleCollaborationMemberships({ projectId: 'fremdes-projekt' })).rejects.toBeInstanceOf(NotFoundError)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('unbekannte projectId: dieselbe NotFoundError wie bei einem fremden, existierenden Projekt (kein Existenz-Leak)', async () => {
    asUser('u1')
    vi.mocked(prisma.collaborationMembership.findFirst).mockResolvedValueOnce(null)
    const { getVisibleCollaborationMemberships } = await import('@/lib/services/collaboration-phase2.service')
    await expect(getVisibleCollaborationMemberships({ projectId: 'nicht-existent' })).rejects.toThrow('Projekt nicht gefunden')
  })

  it('ohne projectId: unverändertes Scoping auf die eigenen Mitgliedschaften — kein zusätzlicher Access-Check', async () => {
    asUser('u1')
    const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
    const findMany = vi.mocked(prisma.collaborationMembership.findMany)
    findMany.mockResolvedValueOnce([{ project: { id: 'p1' } }] as never)
    findMany.mockResolvedValueOnce([] as never)
    const { getVisibleCollaborationMemberships } = await import('@/lib/services/collaboration-phase2.service')
    await expect(getVisibleCollaborationMemberships()).resolves.toEqual([])
    expect(findFirst).not.toHaveBeenCalled()
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ projectId: { in: ['p1'] } }) }))
  })
})

// GGA-04.4: getVisibleCollaborationTasks/-ChecklistItems/-Blockers hatten
// denselben projectId-Filter-IDOR wie getVisibleCollaborationMemberships
// (GGA-04.3) — bestätigt in drei weiteren Funktionen mit identischem Muster
// (siehe PROJECT_MAP → Invariante 12). Dieselbe rollenagnostische Begründung:
// requireCollaborationProjectAccess() genügt, weil auch der ungefilterte
// Zweig bereits auf alle eigenen Mitgliedschaften unabhängig von der Rolle
// scoped. Volle Rollenmatrix + kombinierter Cross-Function-Regressionstest
// laufen als Integrationstest gegen eine echte DB, siehe
// tests/integration/gga-cabinet-db.test.ts → "GGA-04.4".
describe('getVisibleCollaborationTasks/-ChecklistItems/-Blockers (GGA-04.4)', () => {
  beforeEach(() => vi.clearAllMocks())

  function asUser(userId: string) {
    auth.getServerSession.mockResolvedValue({ user: { id: userId, email: `${userId}@example.test`, authScope: 'COLLABORATION' } })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: userId, status: 'ACTIVE', deletedAt: null } as never)
  }

  const cases = [
    { name: 'getVisibleCollaborationTasks', model: 'collaborationTask' as const },
    { name: 'getVisibleCollaborationChecklistItems', model: 'collaborationChecklistItem' as const },
    { name: 'getVisibleCollaborationBlockers', model: 'collaborationBlocker' as const },
  ]

  for (const { name, model } of cases) {
    it(`${name}: prüft Mitgliedschaft am gefilterten Projekt, bevor Daten geladen werden`, async () => {
      asUser('u1')
      const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
      findFirst.mockResolvedValueOnce({ id: 'm1', role: 'COLLAB_MEMBER', project: { id: 'p1', name: 'Projekt A' } } as never)
      const modelFindMany = vi.mocked(prisma[model].findMany)
      modelFindMany.mockResolvedValueOnce([] as never)
      const membershipFindMany = vi.mocked(prisma.collaborationMembership.findMany)
      membershipFindMany.mockResolvedValueOnce([{ project: { id: 'p1' } }] as never)
      const service = await import('@/lib/services/collaboration-phase2.service')
      const fn = service[name as keyof typeof service] as (filters?: { projectId?: string }) => Promise<unknown>
      await expect(fn({ projectId: 'p1' })).resolves.toEqual([])
      expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', projectId: 'p1', active: true }) }))
    })

    it(`${name}: cross-project IDOR — NotFoundError statt Daten eines fremden Projekts, kein Daten-findMany danach`, async () => {
      asUser('u1')
      vi.mocked(prisma.collaborationMembership.findFirst).mockResolvedValueOnce(null)
      const modelFindMany = vi.mocked(prisma[model].findMany)
      const service = await import('@/lib/services/collaboration-phase2.service')
      const fn = service[name as keyof typeof service] as (filters?: { projectId?: string }) => Promise<unknown>
      await expect(fn({ projectId: 'fremdes-projekt' })).rejects.toBeInstanceOf(NotFoundError)
      expect(modelFindMany).not.toHaveBeenCalled()
    })

    it(`${name}: unbekannte projectId — dieselbe NotFoundError, kein Existenz-Leak`, async () => {
      asUser('u1')
      vi.mocked(prisma.collaborationMembership.findFirst).mockResolvedValueOnce(null)
      const service = await import('@/lib/services/collaboration-phase2.service')
      const fn = service[name as keyof typeof service] as (filters?: { projectId?: string }) => Promise<unknown>
      await expect(fn({ projectId: 'nicht-existent' })).rejects.toThrow('Projekt nicht gefunden')
    })

    it(`${name}: ohne projectId — unverändertes Scoping, kein zusätzlicher Access-Check`, async () => {
      asUser('u1')
      const findFirst = vi.mocked(prisma.collaborationMembership.findFirst)
      const membershipFindMany = vi.mocked(prisma.collaborationMembership.findMany)
      membershipFindMany.mockResolvedValueOnce([{ project: { id: 'p1' } }] as never)
      const modelFindMany = vi.mocked(prisma[model].findMany)
      modelFindMany.mockResolvedValueOnce([] as never)
      const service = await import('@/lib/services/collaboration-phase2.service')
      const fn = service[name as keyof typeof service] as (filters?: { projectId?: string }) => Promise<unknown>
      await expect(fn()).resolves.toEqual([])
      expect(findFirst).not.toHaveBeenCalled()
    })
  }
})
