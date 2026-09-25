import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Härtung von deleteCollaborationProject() (bisher ohne jeden Abhängigkeits-
// Check): reuse derselben Prüfung wie releaseCollaboration()
// (getCollaborationReleaseBlockersFor), zuzüglich eines eigenen Blockers,
// wenn das Projekt noch mit einem internen Projekt verknüpft ist
// (CollaborationProject.internalProjectId ist @unique — eine Deaktivierung
// ohne vorherige Freigabe würde diese Verknüpfung dauerhaft einfrieren).
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

describe.skipIf(!RUN_INTEGRATION)('Collaboration-Projekt entfernen — Dependency-Härtung (Datenbankintegration)', () => {
  let db: any
  let phase2Service: typeof import('@/lib/services/collaboration-phase2.service')
  const marker = `COLLABDEL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  let managerUserId = '', managerEmail = ''
  let plannerUserId = '', plannerEmail = ''
  const createdProjectIds: string[] = []

  function asManager() { auth.getServerSession.mockResolvedValue({ user: { id: managerUserId, email: managerEmail, authScope: 'COLLABORATION' } }) }
  function asPlanner() { auth.getServerSession.mockResolvedValue({ user: { id: plannerUserId, email: plannerEmail, authScope: 'COLLABORATION' } }) }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const mk = async (label: string) => db.user.create({ data: { email: `${marker}-${label}@example.invalid`, passwordHash: 'not-used', firstName: label, lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
    const manager = await mk('manager'); managerUserId = manager.id; managerEmail = manager.email
    const planner = await mk('planner'); plannerUserId = planner.id; plannerEmail = planner.email
    phase2Service = await import('@/lib/services/collaboration-phase2.service')
  })

  afterAll(async () => {
    if (!db) return
    const userIds = [managerUserId, plannerUserId].filter(Boolean)
    await db.auditLog.deleteMany({ where: { userId: { in: userIds } } })
    for (const projectId of createdProjectIds) {
      await db.collaborationBlocker.deleteMany({ where: { projectId } })
      await db.collaborationChecklistItem.deleteMany({ where: { projectId } })
      await db.collaborationTask.deleteMany({ where: { projectId } })
      await db.collaborationMembership.deleteMany({ where: { projectId } })
    }
    if (createdProjectIds.length) await db.collaborationProject.deleteMany({ where: { id: { in: createdProjectIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.$disconnect()
  })

  async function makeProject(suffix: string) {
    const project = await db.collaborationProject.create({ data: { projectNumber: `${marker}-${suffix}`, name: `Delete Test ${suffix}`, active: true } })
    createdProjectIds.push(project.id)
    await db.collaborationMembership.create({ data: { projectId: project.id, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    await db.collaborationMembership.create({ data: { projectId: project.id, userId: plannerUserId, role: 'INTERNAL_PLANNER' } })
    return project
  }

  it('leeres Projekt: COLLAB_MANAGER kann es nach korrekter Bestätigung entfernen', async () => {
    const project = await makeProject('EMPTY')
    asManager()
    expect(await phase2Service.getCollaborationProjectDeleteBlockersFor(project.id)).toEqual([])
    await phase2Service.deleteCollaborationProject(project.id, project.projectNumber)
    const row = await db.collaborationProject.findUniqueOrThrow({ where: { id: project.id }, select: { active: true, deletedAt: true } })
    expect(row.active).toBe(false)
    expect(row.deletedAt).not.toBeNull()
  })

  it('falsche Projektnummer verhindert die Entfernung serverseitig', async () => {
    const project = await makeProject('WRONGNUM')
    asManager()
    await expect(phase2Service.deleteCollaborationProject(project.id, 'FALSCH')).rejects.toThrow('Projektnummer')
    const row = await db.collaborationProject.findUniqueOrThrow({ where: { id: project.id }, select: { active: true } })
    expect(row.active).toBe(true)
  })

  it('Nicht-Manager (INTERNAL_PLANNER) wird serverseitig abgewiesen', async () => {
    const project = await makeProject('PERM')
    asPlanner()
    await expect(phase2Service.deleteCollaborationProject(project.id, project.projectNumber)).rejects.toThrow('Keine Berechtigung')
  })

  it('mit GGA-Schrank verknüpftes Projekt kann nicht entfernt werden (dieselbe Prüfung wie beim Rückbau)', async () => {
    const project = await makeProject('CABINET')
    await db.ggaCabinet.create({ data: { projectId: project.id, kennung: `${marker}-CAB`, bezeichnung: 'Testschrank' } })
    asManager()
    await expect(phase2Service.deleteCollaborationProject(project.id, project.projectNumber)).rejects.toThrow('GGA-Schrank')
    const row = await db.collaborationProject.findUniqueOrThrow({ where: { id: project.id }, select: { active: true } })
    expect(row.active).toBe(true)
    await db.ggaCabinet.deleteMany({ where: { projectId: project.id } })
  })

  it('mit internem Projekt verknüpftes Collaboration-Projekt kann nicht entfernt werden (internalProjectId ist @unique)', async () => {
    const customer = await db.customer.create({ data: { number: `${marker}-K`, name: 'Delete Test Kunde' } })
    const internalProject = await db.project.create({ data: { projectNumber: `${marker}-INTERNAL`, name: 'Internes Testprojekt', customerId: customer.id, status: 'ACTIVE' } })
    const project = await makeProject('LINKED')
    await db.collaborationProject.update({ where: { id: project.id }, data: { internalProjectId: internalProject.id } })

    asManager()
    await expect(phase2Service.deleteCollaborationProject(project.id, project.projectNumber)).rejects.toThrow('verknüpft')
    const row = await db.collaborationProject.findUniqueOrThrow({ where: { id: project.id }, select: { active: true, internalProjectId: true } })
    expect(row.active).toBe(true)
    expect(row.internalProjectId).toBe(internalProject.id)

    await db.project.deleteMany({ where: { id: internalProject.id } })
    await db.customer.deleteMany({ where: { id: customer.id } })
  })

  it('erfolgreiche Entfernung ist über den bestehenden Audit-Mechanismus nachvollziehbar', async () => {
    const project = await makeProject('AUDIT')
    asManager()
    await phase2Service.deleteCollaborationProject(project.id, project.projectNumber)
    const auditEntry = await db.auditLog.findFirst({ where: { entityType: 'collaboration_project', entityId: project.id, action: 'UPDATE', userId: managerUserId } })
    expect(auditEntry).not.toBeNull()
  })

  it('parallele Entfernungsanfragen führen zu einem konsistenten Zustand ohne doppelten Audit-Eintrag', async () => {
    const project = await makeProject('DUPLICATE')
    asManager()
    const results = await Promise.allSettled([
      phase2Service.deleteCollaborationProject(project.id, project.projectNumber),
      phase2Service.deleteCollaborationProject(project.id, project.projectNumber),
    ])
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(Error)
    }
    const row = await db.collaborationProject.findUniqueOrThrow({ where: { id: project.id }, select: { active: true } })
    expect(row.active).toBe(false)
    const auditCount = await db.auditLog.count({ where: { entityType: 'collaboration_project', entityId: project.id, action: 'UPDATE' } })
    expect(auditCount).toBe(1)
  })
})
