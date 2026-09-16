import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Die globale Unit-Test-Konfiguration mockt Prisma und Audit. Dieser Test
// prüft bewusst die tatsächliche Transaktion, den DB-Unique-Constraint auf
// collaboration_projects.internal_project_id und die Race-Sicherheit auf
// der expliziten Test-DB.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

describe.skipIf(!RUN_INTEGRATION)('Verknüpfung bestehender CollaborationProjects — Datenbankintegration', () => {
  let db: any
  let services: typeof import('@/lib/services/project.service')
  let actor: { userId: string; userEmail: string }
  const marker = `LINK-${Date.now()}-${Math.random().toString(16).slice(2)}`

  let customerId = ''
  let projectAId = ''
  let projectBId = ''
  let cancelledProjectId = ''
  let collabAId = ''
  let collabBId = ''
  let inactiveCollabId = ''
  let deletedCollabId = ''
  let membershipId = ''
  let stageId = ''

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const user = await db.user.create({ data: { email: `${marker}@example.invalid`, passwordHash: 'not-used', firstName: 'Link', lastName: 'Test', roleId: role.id } })
    actor = { userId: user.id, userEmail: user.email }

    const customer = await db.customer.create({ data: { number: `${marker}-KD`, name: 'Link Testkunde' } })
    customerId = customer.id

    services = await import('@/lib/services/project.service')

    projectAId = await services.createProject({ projectNumber: `${marker}-P-A`, name: 'Link Projekt A', customerId, status: 'ACTIVE' }, actor)
    projectBId = await services.createProject({ projectNumber: `${marker}-P-B`, name: 'Link Projekt B', customerId, status: 'ACTIVE' }, actor)
    cancelledProjectId = await services.createProject({ projectNumber: `${marker}-P-C`, name: 'Link Projekt Storniert', customerId, status: 'CANCELLED' }, actor)

    const collabA = await db.collaborationProject.create({ data: { projectNumber: `${marker}-CP-A`, name: 'Collab A — bleibt unverändert', description: 'Original-Beschreibung', location: 'Original-Standort', active: true } })
    collabAId = collabA.id
    const collabB = await db.collaborationProject.create({ data: { projectNumber: `${marker}-CP-B`, name: 'Collab B', active: true } })
    collabBId = collabB.id
    const inactiveCollab = await db.collaborationProject.create({ data: { projectNumber: `${marker}-CP-INACTIVE`, name: 'Collab Inaktiv', active: false } })
    inactiveCollabId = inactiveCollab.id
    const deletedCollab = await db.collaborationProject.create({ data: { projectNumber: `${marker}-CP-DELETED`, name: 'Collab Gelöscht', active: true, deletedAt: new Date() } })
    deletedCollabId = deletedCollab.id

    const membership = await db.collaborationMembership.create({ data: { projectId: collabAId, userId: user.id, role: 'COLLAB_MANAGER' } })
    membershipId = membership.id
    const stage = await db.collaborationProjectStage.create({ data: { projectId: collabAId, code: 'PLANUNG', title: 'Planung', sequence: 1, weight: 100 } })
    stageId = stage.id
  })

  afterAll(async () => {
    if (!db) return
    if (stageId) await db.collaborationProjectStage.deleteMany({ where: { id: stageId } })
    if (membershipId) await db.collaborationMembership.deleteMany({ where: { id: membershipId } })
    const collabIds = [collabAId, collabBId, inactiveCollabId, deletedCollabId].filter(Boolean)
    if (collabIds.length) await db.collaborationProject.deleteMany({ where: { id: { in: collabIds } } })
    if (actor?.userId) await db.auditLog.deleteMany({ where: { userId: actor.userId } })
    const projectIds = [projectAId, projectBId, cancelledProjectId].filter(Boolean)
    if (projectIds.length) await db.project.deleteMany({ where: { id: { in: projectIds } } })
    if (customerId) await db.customer.deleteMany({ where: { id: customerId } })
    if (actor?.userId) await db.user.deleteMany({ where: { id: actor.userId } })
    await db.$disconnect()
  })

  it('T1: verbindet ein unverknüpftes Project mit einem unverknüpften CollaborationProject', async () => {
    const result = await services.linkExistingCollaborationProject(projectAId, collabAId, actor)
    expect(result.id).toBe(collabAId)
    await expect(db.collaborationProject.findUniqueOrThrow({ where: { id: collabAId }, select: { internalProjectId: true } })).resolves.toEqual({ internalProjectId: projectAId })
  })

  it('T2: dieselbe Verbindung erneut aufzurufen ist idempotent', async () => {
    const result = await services.linkExistingCollaborationProject(projectAId, collabAId, actor)
    expect(result.id).toBe(collabAId)
  })

  it('T3: Project A ist bereits verbunden — ein zweites CollaborationProject wird abgelehnt', async () => {
    await expect(services.linkExistingCollaborationProject(projectAId, collabBId, actor)).rejects.toThrow('bereits mit einer anderen Zusammenarbeit')
  })

  it('T4: Collab A ist bereits verbunden — ein zweites Project wird abgelehnt', async () => {
    await expect(services.linkExistingCollaborationProject(projectBId, collabAId, actor)).rejects.toThrow('bereits mit einem anderen internen Projekt')
  })

  it('T5: nicht existierendes Project wird sicher abgelehnt', async () => {
    await expect(services.linkExistingCollaborationProject('00000000-0000-0000-0000-000000000000', collabBId, actor)).rejects.toThrow('Projekt nicht gefunden')
  })

  it('T6: nicht existierendes CollaborationProject wird sicher abgelehnt', async () => {
    await expect(services.linkExistingCollaborationProject(projectBId, '00000000-0000-0000-0000-000000000000', actor)).rejects.toThrow('Collaboration-Projekt nicht gefunden')
  })

  it('T7: storniertes Project wird abgelehnt', async () => {
    await expect(services.linkExistingCollaborationProject(cancelledProjectId, collabBId, actor)).rejects.toThrow('nicht verknüpft werden')
  })

  it('lehnt inaktive und gelöschte CollaborationProjects ab (Invariante E)', async () => {
    await expect(services.linkExistingCollaborationProject(projectBId, inactiveCollabId, actor)).rejects.toThrow('Collaboration-Projekt nicht gefunden')
    await expect(services.linkExistingCollaborationProject(projectBId, deletedCollabId, actor)).rejects.toThrow('Collaboration-Projekt nicht gefunden')
  })

  it('T10: schreibt einen Audit-Log-Eintrag für die Verknüpfung', async () => {
    const logs = await db.auditLog.findMany({ where: { entityType: 'collaboration_project', entityId: collabAId, action: 'UPDATE' } })
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs[0].newValue).toMatchObject({ internalProjectId: projectAId })
    expect(logs[0].userId).toBe(actor.userId)
  })

  it('T11: bestehende Memberships bleiben unverändert', async () => {
    await expect(db.collaborationMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { userId: true, role: true, projectId: true } })).resolves.toEqual({ userId: actor.userId, role: 'COLLAB_MANAGER', projectId: collabAId })
  })

  it('T12: bestehende Stages bleiben unverändert', async () => {
    await expect(db.collaborationProjectStage.findUniqueOrThrow({ where: { id: stageId }, select: { code: true, title: true, sequence: true, projectId: true } })).resolves.toEqual({ code: 'PLANUNG', title: 'Planung', sequence: 1, projectId: collabAId })
  })

  it('T13: Name/Beschreibung/Standort des CollaborationProject bleiben unverändert', async () => {
    await expect(db.collaborationProject.findUniqueOrThrow({ where: { id: collabAId }, select: { name: true, description: true, location: true } })).resolves.toEqual({ name: 'Collab A — bleibt unverändert', description: 'Original-Beschreibung', location: 'Original-Standort' })
  })

  it('T14: konkurrierende Link-Versuche erzeugen keine widersprüchliche Verbindung', async () => {
    // Zwei unabhängige, noch unverknüpfte Projekte/Collaboration-Projekte für einen sauberen Race-Test.
    const raceProjectId = await services.createProject({ projectNumber: `${marker}-P-RACE`, name: 'Race Projekt', customerId, status: 'ACTIVE' }, actor)
    const raceCollabX = await db.collaborationProject.create({ data: { projectNumber: `${marker}-CP-RACE-X`, name: 'Race Collab X', active: true } })
    const raceCollabY = await db.collaborationProject.create({ data: { projectNumber: `${marker}-CP-RACE-Y`, name: 'Race Collab Y', active: true } })

    const attempts = await Promise.allSettled([
      services.linkExistingCollaborationProject(raceProjectId, raceCollabX.id, actor),
      services.linkExistingCollaborationProject(raceProjectId, raceCollabY.id, actor),
    ])

    const fulfilled = attempts.filter(a => a.status === 'fulfilled')
    expect(fulfilled).toHaveLength(1)

    const project = await db.project.findUniqueOrThrow({ where: { id: raceProjectId }, select: { collaborationProject: { select: { id: true } } } })
    expect([raceCollabX.id, raceCollabY.id]).toContain(project.collaborationProject?.id)

    // Aufräumen der race-spezifischen Datensätze (nicht Teil des globalen afterAll).
    await db.collaborationProject.deleteMany({ where: { id: { in: [raceCollabX.id, raceCollabY.id] } } })
    await db.auditLog.deleteMany({ where: { entityId: { in: [raceCollabX.id, raceCollabY.id] } } })
    await db.project.deleteMany({ where: { id: raceProjectId } })
  })
})
