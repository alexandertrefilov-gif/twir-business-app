import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Prüft die GGA-Bestandsaufnahme/Maßnahmenplanung-Erweiterung: Maßnahmen auf
// dem bestehenden CollaborationTask, Checklisten-Vorlagen auf dem
// bestehenden CollaborationChecklistItem, die verfeinerte Control-Tower-
// Aggregation und die zusätzlichen Rollen-/Security-Fälle aus Phase 9.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

describe.skipIf(!RUN_INTEGRATION)('GGA-Bestandsaufnahme/Maßnahmenplanung — Datenbankintegration', () => {
  let db: any
  let cabinetService: typeof import('@/lib/services/gga-cabinet.service')
  let phase2Service: typeof import('@/lib/services/collaboration-phase2.service')
  let documentService: typeof import('@/lib/services/collaboration-document.service')
  const marker = `GGA-INTAKE-${Date.now()}-${Math.random().toString(16).slice(2)}`

  let managerUserId = '', managerEmail = ''
  let plannerUserId = '', plannerEmail = ''
  let operatorUserId = '', operatorEmail = ''
  let externalPlannerUserId = '', externalPlannerEmail = ''
  let viewerUserId = '', viewerEmail = ''

  let projectAId = '', projectBId = ''
  let stageKonzeptId = '', stagePlanungId = ''
  let cabinetAId = ''

  function asUser(id: string, email: string) { auth.getServerSession.mockResolvedValue({ user: { id, email, authScope: 'COLLABORATION' } }) }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const mk = async (label: string) => db.user.create({ data: { email: `${marker}-${label}@example.invalid`, passwordHash: 'not-used', firstName: label, lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })

    const manager = await mk('manager'); managerUserId = manager.id; managerEmail = manager.email
    const planner = await mk('planner'); plannerUserId = planner.id; plannerEmail = planner.email
    const operator = await mk('operator'); operatorUserId = operator.id; operatorEmail = operator.email
    const externalPlanner = await mk('external'); externalPlannerUserId = externalPlanner.id; externalPlannerEmail = externalPlanner.email
    const viewer = await mk('viewer'); viewerUserId = viewer.id; viewerEmail = viewer.email

    const projectA = await db.collaborationProject.create({ data: { projectNumber: `${marker}-A`, name: 'Intake Test Projekt A', active: true } })
    projectAId = projectA.id
    const projectB = await db.collaborationProject.create({ data: { projectNumber: `${marker}-B`, name: 'Intake Test Projekt B', active: true } })
    projectBId = projectB.id

    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: plannerUserId, role: 'INTERNAL_PLANNER' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: operatorUserId, role: 'OPERATOR' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: externalPlannerUserId, role: 'EXTERNAL_PLANNER' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: viewerUserId, role: 'COLLAB_VIEWER' } })

    const stageKonzept = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'KONZEPT', title: 'Konzept', sequence: 1, weight: 10 } })
    stageKonzeptId = stageKonzept.id
    const stagePlanung = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'PLANUNG', title: 'Planung', sequence: 2, weight: 20 } })
    stagePlanungId = stagePlanung.id
    await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'UMSETZUNG', title: 'Umsetzung', sequence: 3, weight: 35 } })
    await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'ABNAHME', title: 'Abnahme', sequence: 4, weight: 25 } })
    // Projekt B bewusst OHNE KONZEPT/PLANUNG/ABNAHME-Stages angelegt, um den
    // "Vorlage kann nicht angewendet werden"-Fall zu prüfen.

    cabinetService = await import('@/lib/services/gga-cabinet.service')
    phase2Service = await import('@/lib/services/collaboration-phase2.service')
    documentService = await import('@/lib/services/collaboration-document.service')

    asUser(plannerUserId, plannerEmail)
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-001`, bezeichnung: 'Intake Test Cabinet' })
    cabinetAId = cabinet.id
  })

  afterAll(async () => {
    if (!db) return
    const allUserIds = [managerUserId, plannerUserId, operatorUserId, externalPlannerUserId, viewerUserId].filter(Boolean)
    await db.auditLog.deleteMany({ where: { userId: { in: allUserIds } } })
    for (const projectId of [projectAId, projectBId].filter(Boolean)) {
      await db.collaborationDocument.deleteMany({ where: { projectId } })
      await db.collaborationApproval.deleteMany({ where: { projectId } })
      await db.collaborationBlocker.deleteMany({ where: { projectId } })
      await db.collaborationChecklistItem.deleteMany({ where: { projectId } })
      await db.collaborationTask.deleteMany({ where: { projectId } })
      await db.ggaCabinet.deleteMany({ where: { projectId } })
      await db.collaborationProjectStage.deleteMany({ where: { projectId } })
      await db.collaborationMembership.deleteMany({ where: { projectId } })
    }
    await db.collaborationProject.deleteMany({ where: { id: { in: [projectAId, projectBId].filter(Boolean) } } })
    await db.user.deleteMany({ where: { id: { in: allUserIds } } })
    await db.$disconnect()
  })

  // ── Phase 4: Maßnahmen auf CollaborationTask ──────────────────
  it('legt eine Maßnahme mit Cabinet-Bezug auf dem bestehenden CollaborationTask an', async () => {
    asUser(plannerUserId, plannerEmail)
    const task = await phase2Service.createCollaborationTask(stagePlanungId, { title: 'Abluftanschluss herstellen', cabinetId: cabinetAId })
    const row = await db.collaborationTask.findUnique({ where: { id: task.id } })
    expect(row.cabinetId).toBe(cabinetAId)
  })

  it('lehnt eine Maßnahme mit cabinetId aus einem fremden Projekt ab', async () => {
    asUser(managerUserId, managerEmail)
    // Manager gehört nur zu Projekt A und legt dort testweise ein zweites Cabinet an, das "fremd" simuliert wird, indem
    // wir versuchen, eine Stage aus Projekt A mit einem (nicht existenten) Cabinet aus Projekt B zu verknüpfen.
    const foreignProjectManager = await db.collaborationMembership.create({ data: { projectId: projectBId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    const foreignCabinet = await cabinetService.createGgaCabinet(projectBId, { kennung: `${marker}-FOREIGN`, bezeichnung: 'Fremdes Cabinet' })
    await expect(phase2Service.createCollaborationTask(stagePlanungId, { title: 'Angriff', cabinetId: foreignCabinet.id })).rejects.toThrow('nicht gefunden')
    await db.collaborationMembership.delete({ where: { id: foreignProjectManager.id } })
  })

  // ── Phase 5: Checklisten-Vorlagen ─────────────────────────────
  it('wendet die Bestandsaufnahme-Checklisten-Vorlage an und erzeugt alle Punkte unerledigt', async () => {
    asUser(plannerUserId, plannerEmail)
    const result = await cabinetService.applyGgaCabinetChecklistTemplate(cabinetAId, 'BESTANDSAUFNAHME')
    expect(result.created).toBe(8)
    const items = await db.collaborationChecklistItem.findMany({ where: { cabinetId: cabinetAId, stageId: stageKonzeptId } })
    expect(items).toHaveLength(8)
    expect(items.every((item: any) => item.completed === false)).toBe(true)
  })

  it('wendet dieselbe Vorlage ein zweites Mal an, ohne Duplikate zu erzeugen', async () => {
    asUser(plannerUserId, plannerEmail)
    const result = await cabinetService.applyGgaCabinetChecklistTemplate(cabinetAId, 'BESTANDSAUFNAHME')
    expect(result.created).toBe(0)
    const items = await db.collaborationChecklistItem.findMany({ where: { cabinetId: cabinetAId, stageId: stageKonzeptId } })
    expect(items).toHaveLength(8)
  })

  it('lehnt eine Vorlage ab, wenn das Projekt die passende Phase nicht besitzt', async () => {
    asUser(managerUserId, managerEmail)
    const membership = await db.collaborationMembership.create({ data: { projectId: projectBId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    const cabinetInB = await cabinetService.createGgaCabinet(projectBId, { kennung: `${marker}-NOSTAGE`, bezeichnung: 'Ohne Phasen' })
    await expect(cabinetService.applyGgaCabinetChecklistTemplate(cabinetInB.id, 'PLANUNG')).rejects.toThrow('keine Phase')
    await db.collaborationMembership.delete({ where: { id: membership.id } })
  })

  // ── Phase 7: Control-Tower-Aggregation ────────────────────────
  it('bestandsaufnahmeAm über update-cabinet gesetzt spiegelt sich sofort im Control-Tower wider', async () => {
    asUser(plannerUserId, plannerEmail)
    const before = await cabinetService.getGgaCabinetControlTowerSummary(projectAId)
    expect(before!.bestandsaufnahmeOffen).toBeGreaterThan(0)
    await cabinetService.updateGgaCabinet(cabinetAId, { bestandsaufnahmeAm: new Date() as never })
    const after = await cabinetService.getGgaCabinetControlTowerSummary(projectAId)
    expect(after!.bestandsaufnahmeOffen).toBe(before!.bestandsaufnahmeOffen - 1)
  })

  // ── Phase 9: Security ──────────────────────────────────────────
  it('lehnt eine Stammdatenänderung durch OPERATOR ab', async () => {
    asUser(operatorUserId, operatorEmail)
    await expect(cabinetService.updateGgaCabinet(cabinetAId, { bezeichnung: 'Von Operator manipuliert' })).rejects.toThrow('Keine Berechtigung')
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinetAId } })
    expect(row.bezeichnung).not.toBe('Von Operator manipuliert')
  })

  it('EXTERNAL_PLANNER kann Collaboration-Dokumente hochladen, ohne dass interne Document-Zeilen entstehen oder sichtbar werden', async () => {
    asUser(externalPlannerUserId, externalPlannerEmail)
    const internalDocsBefore = await db.document.count()
    const document = await documentService.uploadCollaborationDocument({
      projectId: projectAId,
      cabinetId: cabinetAId,
      documentKind: 'Übersicht',
      originalName: 'uebersicht.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    })
    expect(document.projectId).toBe(projectAId)
    const internalDocsAfter = await db.document.count()
    expect(internalDocsAfter).toBe(internalDocsBefore)
    // listCollaborationDocuments fragt ausschließlich collaboration_documents ab
    const list = await documentService.listCollaborationDocuments({ projectId: projectAId })
    expect(list.some((d) => d.id === document.id)).toBe(true)
  })

  it('Viewer kann keine Maßnahme anlegen', async () => {
    asUser(viewerUserId, viewerEmail)
    await expect(phase2Service.createCollaborationTask(stagePlanungId, { title: 'Viewer-Versuch', cabinetId: cabinetAId })).rejects.toThrow('Keine Berechtigung')
  })

  it('Viewer kann keine Checklisten-Vorlage anwenden', async () => {
    asUser(viewerUserId, viewerEmail)
    await expect(cabinetService.applyGgaCabinetChecklistTemplate(cabinetAId, 'PLANUNG')).rejects.toThrow('Keine Berechtigung')
  })
})
