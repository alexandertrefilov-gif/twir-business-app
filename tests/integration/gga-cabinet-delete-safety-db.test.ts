import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// DELETE-SAFETY-002: GGA-Schrank-Löschung — Kennungs-Bestätigung +
// serverseitiger Abhängigkeits-Check (getGgaCabinetDeleteBlockersFor /
// softDeleteGgaCabinet). Volle Rollenmatrix/IDOR-Abdeckung bleibt in
// tests/integration/gga-cabinet-db.test.ts — diese Datei prüft ausschließlich
// die in DELETE-SAFETY-002 neu eingeführte Sicherheitsschicht.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

describe.skipIf(!RUN_INTEGRATION)('GGA-Schrank-Löschung — Delete-Safety-Härtung (DELETE-SAFETY-002)', () => {
  let db: any
  let cabinetService: typeof import('@/lib/services/gga-cabinet.service')
  // Kennung ist auf 50 Zeichen begrenzt (cabinetInputSchema) — kurzer,
  // base36-basierter Marker statt Date.now(), damit auch die längsten
  // Suffixe (z.B. "-T7B-TASK") sicher darunter bleiben.
  const marker = `GGADS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  let managerUserId = '', managerEmail = ''
  let plannerUserId = '', plannerEmail = ''
  let projectId = ''
  let stageKonzeptId = '', stageAbnahmeId = ''

  function asManager() { auth.getServerSession.mockResolvedValue({ user: { id: managerUserId, email: managerEmail, authScope: 'COLLABORATION' } }) }
  function asPlanner() { auth.getServerSession.mockResolvedValue({ user: { id: plannerUserId, email: plannerEmail, authScope: 'COLLABORATION' } }) }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })

    const mk = async (label: string) => db.user.create({ data: { email: `${marker}-${label}@example.invalid`, passwordHash: 'not-used', firstName: label, lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
    const manager = await mk('manager'); managerUserId = manager.id; managerEmail = manager.email
    const planner = await mk('planner'); plannerUserId = planner.id; plannerEmail = planner.email

    const project = await db.collaborationProject.create({ data: { projectNumber: `${marker}-P`, name: 'GGA Delete-Safety Testprojekt', active: true } })
    projectId = project.id
    await db.collaborationMembership.create({ data: { projectId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    await db.collaborationMembership.create({ data: { projectId, userId: plannerUserId, role: 'INTERNAL_PLANNER' } })

    const stageKonzept = await db.collaborationProjectStage.create({ data: { projectId, code: 'KONZEPT', title: 'Konzept', sequence: 1, weight: 10 } })
    stageKonzeptId = stageKonzept.id
    const stageAbnahme = await db.collaborationProjectStage.create({ data: { projectId, code: 'ABNAHME', title: 'Abnahme', sequence: 2, weight: 20 } })
    stageAbnahmeId = stageAbnahme.id

    cabinetService = await import('@/lib/services/gga-cabinet.service')
  })

  afterAll(async () => {
    if (!db) return
    await db.auditLog.deleteMany({ where: { userId: { in: [managerUserId, plannerUserId].filter(Boolean) } } })
    await db.ggaCabinetPruefnachweis.deleteMany({ where: { cabinet: { projectId } } })
    await db.collaborationDocument.deleteMany({ where: { projectId } })
    await db.collaborationApproval.deleteMany({ where: { projectId } })
    await db.collaborationBlocker.deleteMany({ where: { projectId } })
    await db.collaborationChecklistItem.deleteMany({ where: { projectId } })
    await db.collaborationTask.deleteMany({ where: { projectId } })
    await db.ggaCabinet.deleteMany({ where: { projectId } })
    await db.collaborationProjectStage.deleteMany({ where: { projectId } })
    await db.collaborationMembership.deleteMany({ where: { projectId } })
    if (projectId) await db.collaborationProject.deleteMany({ where: { id: projectId } })
    await db.user.deleteMany({ where: { id: { in: [managerUserId, plannerUserId].filter(Boolean) } } })
    await db.$disconnect()
  })

  async function makeCabinet(suffix: string) {
    asPlanner()
    return cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-${suffix}`, bezeichnung: `Testschrank ${suffix}` })
  }

  it('T1: ein Schrank ohne Abhängigkeiten kann nach korrekter Kennungs-Bestätigung gelöscht werden', async () => {
    const cabinet = await makeCabinet('T1-EMPTY')
    expect(await cabinetService.getGgaCabinetDeleteBlockersFor(cabinet.id)).toEqual([])

    asManager()
    await cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung)
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(row.deletedAt).not.toBeNull()
  })

  it('T2: eine falsche Kennung verhindert die Löschung serverseitig', async () => {
    const cabinet = await makeCabinet('T2-WRONGKEY')
    asManager()
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, 'FALSCHE-KENNUNG')).rejects.toThrow('Kennung')
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T3: fehlende Berechtigung (kein COLLAB_MANAGER) blockiert die Löschung serverseitig', async () => {
    const cabinet = await makeCabinet('T3-PERM')
    asPlanner()
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung)).rejects.toThrow('Keine Berechtigung')
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T4: ein Schrank mit Prüfnachweisen kann nicht gelöscht werden', async () => {
    const cabinet = await makeCabinet('T4-PRUEF')
    await db.ggaCabinetPruefnachweis.create({ data: { cabinetId: cabinet.id, pruefart: 'LUEFTUNG', ergebnis: 'BESTANDEN', recordedById: plannerUserId } })

    asManager()
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung)).rejects.toThrow('Prüfnachweis')
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T5: ein Schrank mit einer Freigabe kann nicht gelöscht werden', async () => {
    const cabinet = await makeCabinet('T5-FREIGABE')
    await db.collaborationApproval.create({ data: { projectId, stageId: stageAbnahmeId, cabinetId: cabinet.id, requestedById: plannerUserId } })

    asManager()
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung)).rejects.toThrow('Freigabe')
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T6: ein Schrank mit einem Dokument kann nicht gelöscht werden', async () => {
    const cabinet = await makeCabinet('T6-DOKUMENT')
    await db.collaborationDocument.create({ data: { projectId, cabinetId: cabinet.id, documentKind: 'FOTO', filename: 'test.jpg', originalName: 'test.jpg', mimeType: 'image/jpeg', fileSize: 1024, storagePath: `/test/${marker}-T6.jpg`, uploadedById: plannerUserId } })

    asManager()
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung)).rejects.toThrow('Dokument')
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T7: ein Schrank mit einem offenen Blocker/Mangel kann nicht gelöscht werden', async () => {
    const cabinet = await makeCabinet('T7-BLOCKER')
    await db.collaborationBlocker.create({ data: { projectId, cabinetId: cabinet.id, title: 'Tür klemmt', status: 'OPEN' } })

    asManager()
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung)).rejects.toThrow('Blocker')
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T7b: ein Schrank mit Aufgaben oder Checklistenpunkten kann ebenfalls nicht gelöscht werden', async () => {
    const cabinet = await makeCabinet('T7B-TASK')
    await db.collaborationTask.create({ data: { projectId, stageId: stageKonzeptId, cabinetId: cabinet.id, title: 'Abluft anschließen' } })

    asManager()
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung)).rejects.toThrow('Aufgabe')
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T8: eine erfolgreiche Löschung ist über den bestehenden Audit-Mechanismus nachvollziehbar', async () => {
    const cabinet = await makeCabinet('T8-AUDIT')
    asManager()
    await cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung, 'Doppelt angelegt')

    const auditEntry = await db.auditLog.findFirst({ where: { entityType: 'gga_cabinet', entityId: cabinet.id, action: 'DELETE' } })
    expect(auditEntry).not.toBeNull()
    expect(auditEntry.userId).toBe(managerUserId)
  })

  it('kein stiller Cascade-Datenverlust: eine blockierte Löschung lässt Abhängigkeiten unangetastet', async () => {
    const cabinet = await makeCabinet('NOCASCADE')
    const blocker = await db.collaborationBlocker.create({ data: { projectId, cabinetId: cabinet.id, title: 'Bleibt erhalten', status: 'OPEN' } })

    asManager()
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung)).rejects.toThrow('Blocker')

    const stillThere = await db.collaborationBlocker.findUnique({ where: { id: blocker.id } })
    expect(stillThere).not.toBeNull()
    expect(stillThere.cabinetId).toBe(cabinet.id)
    const cabinetRow = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(cabinetRow.deletedAt).toBeNull()
  })

  it('doppelte Löschanfrage (parallel) führt zu einem kontrollierten Ergebnis ohne doppelten Audit-Eintrag', async () => {
    const cabinet = await makeCabinet('DUPLICATE')
    asManager()
    const results = await Promise.allSettled([
      cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung),
      cabinetService.softDeleteGgaCabinet(cabinet.id, cabinet.kennung),
    ])
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(Error)
    }
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id }, select: { deletedAt: true } })
    expect(row.deletedAt).not.toBeNull()
    const auditCount = await db.auditLog.count({ where: { entityType: 'gga_cabinet', entityId: cabinet.id, action: 'DELETE' } })
    expect(auditCount).toBe(1)
  })
})
