import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// DELETE-SAFETY-004 — kontrollierter Rückbau Internal Project ↔
// Collaboration: releaseCollaboration() hebt ausschließlich
// CollaborationProject.internalProjectId auf null, ohne Cascade. Dieselbe
// Test-Infrastruktur wie project-delete-db.test.ts.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

describe.skipIf(!RUN_INTEGRATION)('Zusammenarbeit aufheben — Datenbankintegration', () => {
  let db: any
  let services: typeof import('@/lib/services/project.service')
  let actor: { userId: string; userEmail: string }
  let customerId = ''
  const marker = `RELEASE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const createdProjectIds: string[] = []
  const createdCollaborationIds: string[] = []
  const createdOrderIds: string[] = []

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const user = await db.user.create({ data: { email: `${marker}@example.invalid`, passwordHash: 'not-used', firstName: 'Release', lastName: 'Test', roleId: role.id } })
    actor = { userId: user.id, userEmail: user.email }
    const customer = await db.customer.create({ data: { number: `${marker}-K`, name: 'Release Testkunde' } })
    customerId = customer.id
    services = await import('@/lib/services/project.service')
  })

  afterAll(async () => {
    if (!db) return
    for (const collaborationId of createdCollaborationIds) {
      await db.ggaCabinetPruefnachweis.deleteMany({ where: { cabinet: { projectId: collaborationId } } })
      await db.ggaCabinet.deleteMany({ where: { projectId: collaborationId } })
      await db.collaborationDocument.deleteMany({ where: { projectId: collaborationId } })
      await db.collaborationApproval.deleteMany({ where: { projectId: collaborationId } })
      await db.collaborationBlocker.deleteMany({ where: { projectId: collaborationId } })
      await db.collaborationChecklistItem.deleteMany({ where: { projectId: collaborationId } })
      await db.collaborationTask.deleteMany({ where: { projectId: collaborationId } })
      await db.collaborationProjectStage.deleteMany({ where: { projectId: collaborationId } })
    }
    if (createdCollaborationIds.length) await db.collaborationProject.deleteMany({ where: { id: { in: createdCollaborationIds } } })
    if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } })
    if (createdProjectIds.length) await db.project.deleteMany({ where: { id: { in: createdProjectIds } } })
    if (actor?.userId) await db.auditLog.deleteMany({ where: { userId: actor.userId } })
    if (customerId) await db.customer.deleteMany({ where: { id: customerId } })
    if (actor?.userId) await db.user.deleteMany({ where: { id: actor.userId } })
    await db.$disconnect()
  })

  async function makeProjectWithCollaboration(suffix: string) {
    const projectId = await services.createProject({ projectNumber: `${marker}-${suffix}`, name: `Release Projekt ${suffix}`, customerId, status: 'ACTIVE' }, actor)
    createdProjectIds.push(projectId)
    const collaboration = await services.activateCollaboration(projectId, actor)
    createdCollaborationIds.push(collaboration.id)
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, projectNumber: true } })
    return { projectId: project.id, projectNumber: project.projectNumber, collaborationId: collaboration.id }
  }

  it('T4+T13: leere Zusammenarbeit wird nach korrekter Bestätigung aufgehoben — Status danach "Nicht aktiviert"', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('T4-EMPTY')
    expect(await services.getCollaborationReleaseBlockersFor(collaborationId)).toEqual([])

    await services.releaseCollaboration(projectId, projectNumber, actor)

    const project = await services.getProject(projectId)
    expect(project.collaborationProject).toBeNull()

    const collaboration = await db.collaborationProject.findUniqueOrThrow({ where: { id: collaborationId }, select: { internalProjectId: true, active: true, deletedAt: true } })
    expect(collaboration.internalProjectId).toBeNull()
    // Kein Cascade: die Zusammenarbeit selbst bleibt vollständig erhalten.
    expect(collaboration.active).toBe(true)
    expect(collaboration.deletedAt).toBeNull()
  })

  it('T3: falsche Projektnummer verhindert die Aufhebung serverseitig', async () => {
    const { projectId, collaborationId } = await makeProjectWithCollaboration('T3-WRONGNUM')
    await expect(services.releaseCollaboration(projectId, 'FALSCHE-NUMMER', actor)).rejects.toThrow('Projektnummer')
    const collaboration = await db.collaborationProject.findUniqueOrThrow({ where: { id: collaborationId }, select: { internalProjectId: true } })
    expect(collaboration.internalProjectId).toBe(projectId)
  })

  it('T5: internes Projekt bleibt nach Aufhebung bestehen', async () => {
    const { projectId, projectNumber } = await makeProjectWithCollaboration('T5-KEEP')
    await services.releaseCollaboration(projectId, projectNumber, actor)
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { deletedAt: true } })
    expect(project.deletedAt).toBeNull()
  })

  it('T6+T7: Order.projectId sowie Angebot/Auftrag bleiben nach Aufhebung unverändert', async () => {
    const { projectId, projectNumber } = await makeProjectWithCollaboration('T6-ORDER')
    const order = await db.order.create({ data: { orderNumber: `${marker}-T6-ORDER`, customerId, projectId, createdById: actor.userId } })
    createdOrderIds.push(order.id)

    await services.releaseCollaboration(projectId, projectNumber, actor)

    const orderAfter = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { projectId: true, deletedAt: true } })
    expect(orderAfter.projectId).toBe(projectId)
    expect(orderAfter.deletedAt).toBeNull()
  })

  it('T8: Zusammenarbeit mit GGA-Schrank kann nicht aufgehoben werden', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('T8-CABINET')
    await db.ggaCabinet.create({ data: { projectId: collaborationId, kennung: `${marker}-T8-CAB`, bezeichnung: 'Testschrank' } })

    await expect(services.releaseCollaboration(projectId, projectNumber, actor)).rejects.toThrow('GGA-Schrank')
    const collaboration = await db.collaborationProject.findUniqueOrThrow({ where: { id: collaborationId }, select: { internalProjectId: true } })
    expect(collaboration.internalProjectId).toBe(projectId)
  })

  it('T9a: Zusammenarbeit mit Aufgabe kann nicht aufgehoben werden', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('T9A-TASK')
    const stage = await db.collaborationProjectStage.create({ data: { projectId: collaborationId, code: 'KONZEPT', title: 'Konzept', sequence: 1, weight: 10 } })
    await db.collaborationTask.create({ data: { projectId: collaborationId, stageId: stage.id, title: 'Offene Aufgabe' } })

    await expect(services.releaseCollaboration(projectId, projectNumber, actor)).rejects.toThrow('Aufgabe')
  })

  it('T9b: Zusammenarbeit mit offenem Blocker kann nicht aufgehoben werden', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('T9B-BLOCKER')
    await db.collaborationBlocker.create({ data: { projectId: collaborationId, title: 'Offener Mangel', status: 'OPEN' } })

    await expect(services.releaseCollaboration(projectId, projectNumber, actor)).rejects.toThrow('offener Blocker')
  })

  it('T9b-2: ein bereits behobener (RESOLVED) Blocker blockiert die Aufhebung NICHT', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('T9B2-RESOLVED')
    await db.collaborationBlocker.create({ data: { projectId: collaborationId, title: 'Behobener Mangel', status: 'RESOLVED', resolution: 'Erledigt', resolvedAt: new Date() } })

    await expect(services.releaseCollaboration(projectId, projectNumber, actor)).resolves.toBeUndefined()
  })

  it('T9c: Zusammenarbeit mit Dokument kann nicht aufgehoben werden', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('T9C-DOC')
    await db.collaborationDocument.create({ data: { projectId: collaborationId, documentKind: 'FOTO', filename: 'test.jpg', originalName: 'test.jpg', mimeType: 'image/jpeg', fileSize: 100, storagePath: `/test/${marker}-t9c.jpg`, uploadedById: actor.userId } })

    await expect(services.releaseCollaboration(projectId, projectNumber, actor)).rejects.toThrow('Dokument')
  })

  it('T9d: Zusammenarbeit mit Freigabe kann nicht aufgehoben werden', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('T9D-APPROVAL')
    const stage = await db.collaborationProjectStage.create({ data: { projectId: collaborationId, code: 'ABNAHME', title: 'Abnahme', sequence: 1, weight: 10 } })
    await db.collaborationApproval.create({ data: { projectId: collaborationId, stageId: stage.id, requestedById: actor.userId } })

    await expect(services.releaseCollaboration(projectId, projectNumber, actor)).rejects.toThrow('Freigabe')
  })

  it('T11: eine erfolgreiche Aufhebung ist über den bestehenden Audit-Mechanismus nachvollziehbar', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('T11-AUDIT')
    await services.releaseCollaboration(projectId, projectNumber, actor)

    const auditEntry = await db.auditLog.findFirst({ where: { entityType: 'collaboration_project', entityId: collaborationId, action: 'UPDATE', userId: actor.userId } })
    expect(auditEntry).not.toBeNull()
  })

  it('T12: parallele Aufhebungsanfragen führen zu einem konsistenten Ergebnis ohne doppelten Audit-Eintrag', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('T12-DUPLICATE')

    const results = await Promise.allSettled([
      services.releaseCollaboration(projectId, projectNumber, actor),
      services.releaseCollaboration(projectId, projectNumber, actor),
    ])
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(Error)
    }

    const collaboration = await db.collaborationProject.findUniqueOrThrow({ where: { id: collaborationId }, select: { internalProjectId: true } })
    expect(collaboration.internalProjectId).toBeNull()

    const auditCount = await db.auditLog.count({ where: { entityType: 'collaboration_project', entityId: collaborationId, action: 'UPDATE' } })
    expect(auditCount).toBe(1)
  })

  it('T14: nach erfolgreicher Aufhebung ist das Projekt erneut löschbar, aber weiterhin durch übrige ProjectDeleteBlockers geschützt', async () => {
    const { projectId, projectNumber } = await makeProjectWithCollaboration('T14-DELETE')
    const order = await db.order.create({ data: { orderNumber: `${marker}-T14-ORDER`, customerId, projectId, createdById: actor.userId } })
    createdOrderIds.push(order.id)

    await services.releaseCollaboration(projectId, projectNumber, actor)

    // Zusammenarbeit ist aufgehoben, aber der Auftrag blockiert die Löschung weiterhin.
    await expect(services.deleteProject(projectId, projectNumber, actor)).rejects.toThrow('Auftrag')
  })

  it('freigelöste Zusammenarbeit erscheint wieder als verknüpfbar (kein Datenverlust, nur entkoppelt)', async () => {
    const { projectId, projectNumber, collaborationId } = await makeProjectWithCollaboration('LINKABLE')
    await services.releaseCollaboration(projectId, projectNumber, actor)

    const linkable = await services.listLinkableCollaborationProjects()
    expect(linkable.some((c: { id: string }) => c.id === collaborationId)).toBe(true)
  })
})
