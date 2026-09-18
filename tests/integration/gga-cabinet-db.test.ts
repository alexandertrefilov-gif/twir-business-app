import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Volle GGA-Cabinet-Foundation gegen eine echte Test-DB: Unique-Constraints,
// IDOR-Schutz (cabinetId -> projectId serverseitig aufgelöst), Rollenmatrix
// und die Manipulation von cabinetId auf Task/Checklist/Blocker/Approval
// lassen sich gegen den globalen Prisma-Mock nicht ehrlich prüfen.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

describe.skipIf(!RUN_INTEGRATION)('GGA-Cabinet-Foundation — Datenbankintegration', () => {
  let db: any
  let cabinetService: typeof import('@/lib/services/gga-cabinet.service')
  const marker = `GGA-CAB-${Date.now()}-${Math.random().toString(16).slice(2)}`

  let managerUserId = '', managerEmail = ''
  let plannerUserId = '', plannerEmail = ''
  let viewerUserId = '', viewerEmail = ''
  let outsiderUserId = '', outsiderEmail = ''

  let projectAId = '', projectBId = ''
  let stageKonzeptId = '', stagePlanungId = '', stageUmsetzungId = '', stageAbnahmeId = ''
  let membershipManagerId = ''

  function asManager() { auth.getServerSession.mockResolvedValue({ user: { id: managerUserId, email: managerEmail, authScope: 'COLLABORATION' } }) }
  function asPlanner() { auth.getServerSession.mockResolvedValue({ user: { id: plannerUserId, email: plannerEmail, authScope: 'COLLABORATION' } }) }
  function asViewer() { auth.getServerSession.mockResolvedValue({ user: { id: viewerUserId, email: viewerEmail, authScope: 'COLLABORATION' } }) }
  function asOutsider() { auth.getServerSession.mockResolvedValue({ user: { id: outsiderUserId, email: outsiderEmail, authScope: 'COLLABORATION' } }) }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })

    const mk = async (label: string) => db.user.create({ data: { email: `${marker}-${label}@example.invalid`, passwordHash: 'not-used', firstName: label, lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
    const manager = await mk('manager'); managerUserId = manager.id; managerEmail = manager.email
    const planner = await mk('planner'); plannerUserId = planner.id; plannerEmail = planner.email
    const viewer = await mk('viewer'); viewerUserId = viewer.id; viewerEmail = viewer.email
    const outsider = await mk('outsider'); outsiderUserId = outsider.id; outsiderEmail = outsider.email

    const projectA = await db.collaborationProject.create({ data: { projectNumber: `${marker}-A`, name: 'GGA Cabinet Test Projekt A', active: true } })
    projectAId = projectA.id
    const projectB = await db.collaborationProject.create({ data: { projectNumber: `${marker}-B`, name: 'GGA Cabinet Test Projekt B', active: true } })
    projectBId = projectB.id

    const mgrMembership = await db.collaborationMembership.create({ data: { projectId: projectAId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    membershipManagerId = mgrMembership.id
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: plannerUserId, role: 'INTERNAL_PLANNER' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: viewerUserId, role: 'COLLAB_VIEWER' } })
    // outsider ist NUR Mitglied von Projekt B, nicht A
    await db.collaborationMembership.create({ data: { projectId: projectBId, userId: outsiderUserId, role: 'COLLAB_MANAGER' } })

    const stageKonzept = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'KONZEPT', title: 'Konzept', sequence: 1, weight: 10 } })
    stageKonzeptId = stageKonzept.id
    const stagePlanung = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'PLANUNG', title: 'Planung', sequence: 2, weight: 20 } })
    stagePlanungId = stagePlanung.id
    const stageUmsetzung = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'UMSETZUNG', title: 'Umsetzung', sequence: 3, weight: 35 } })
    stageUmsetzungId = stageUmsetzung.id
    const stageAbnahme = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'ABNAHME', title: 'Abnahme', sequence: 4, weight: 25 } })
    stageAbnahmeId = stageAbnahme.id

    cabinetService = await import('@/lib/services/gga-cabinet.service')
  })

  afterAll(async () => {
    if (!db) return
    const allUserIds = [managerUserId, plannerUserId, viewerUserId, outsiderUserId].filter(Boolean)
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

  // ── CRUD, Rollenmatrix ─────────────────────────────────────
  it('lehnt das Anlegen eines Schranks für COLLAB_VIEWER ab', async () => {
    asViewer()
    await expect(cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-X`, bezeichnung: 'Test' })).rejects.toThrow('Keine Berechtigung')
  })

  it('erlaubt INTERNAL_PLANNER das Anlegen eines Schranks', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-001`, bezeichnung: 'Gefahrstoffschrank Halle 2' })
    expect(cabinet.kennung).toBe(`${marker}-001`)
    expect(cabinet.projectId).toBe(projectAId)
  })

  it('setzt exAssessmentStatus standardmäßig auf NOT_ASSESSED (nie automatisch "Nein")', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-002`, bezeichnung: 'Ex-Test ohne Angabe' })
    expect(cabinet.exAssessmentStatus).toBe('NOT_ASSESSED')
  })

  it('persistiert explizite Ex-Schutz-Bewertungen REQUIRED und NOT_REQUIRED korrekt', async () => {
    asPlanner()
    const required = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-003`, bezeichnung: 'Ex erforderlich', exAssessmentStatus: 'REQUIRED', exZoneKlassifikation: 'Zone 2' })
    expect(required.exAssessmentStatus).toBe('REQUIRED')
    const notRequired = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-004`, bezeichnung: 'Ex nicht erforderlich', exAssessmentStatus: 'NOT_REQUIRED' })
    expect(notRequired.exAssessmentStatus).toBe('NOT_REQUIRED')
  })

  it('speichert den Volumenstrom numerisch (Decimal) statt als String', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-005`, bezeichnung: 'Abluft-Test', abluftVolumenstromSollM3h: 180, abluftVolumenstromIstM3h: 184.5 })
    expect(Number(cabinet.abluftVolumenstromSollM3h)).toBe(180)
    expect(Number(cabinet.abluftVolumenstromIstM3h)).toBe(184.5)
  })

  it('lehnt doppelte Kennung im selben Projekt ab', async () => {
    asPlanner()
    await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-DUP`, bezeichnung: 'Original' })
    await expect(cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-DUP`, bezeichnung: 'Duplikat' })).rejects.toThrow('bereits verwendet')
  })

  it('erlaubt dieselbe Kennung in unterschiedlichen Projekten', async () => {
    asPlanner()
    const inA = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-SHARED`, bezeichnung: 'In Projekt A' })
    asOutsider()
    const inB = await cabinetService.createGgaCabinet(projectBId, { kennung: `${marker}-SHARED`, bezeichnung: 'In Projekt B' })
    expect(inA.kennung).toBe(inB.kennung)
    expect(inA.projectId).not.toBe(inB.projectId)
  })

  it('aktualisiert Stammdaten und protokolliert die Änderung im Audit-Log', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-UPD`, bezeichnung: 'Vor Update' })
    const updated = await cabinetService.updateGgaCabinet(cabinet.id, { bezeichnung: 'Nach Update', herstellerName: 'Denios' })
    expect(updated.bezeichnung).toBe('Nach Update')
    const history = await cabinetService.getGgaCabinetAuditHistory(cabinet.id)
    expect(history.some((entry: any) => entry.action === 'UPDATE')).toBe(true)
  })

  it('lehnt Löschen für Nicht-Manager ab, erlaubt es für COLLAB_MANAGER (Soft Delete)', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-DEL`, bezeichnung: 'Zu löschen' })
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, 'Testversuch')).rejects.toThrow('Keine Berechtigung')

    asManager()
    await cabinetService.softDeleteGgaCabinet(cabinet.id, 'Nicht mehr benötigt')
    const row = await db.ggaCabinet.findUnique({ where: { id: cabinet.id } })
    expect(row.deletedAt).not.toBeNull()
  })

  it('ein gelöschter Schrank ist über getGgaCabinetDetail nicht mehr erreichbar', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-DEL2`, bezeichnung: 'Zu löschen 2' })
    asManager()
    await cabinetService.softDeleteGgaCabinet(cabinet.id, 'Test')
    await expect(cabinetService.getGgaCabinetDetail(cabinet.id)).rejects.toThrow('nicht gefunden')
  })

  it('ein gelöschter Schrank taucht nicht mehr in der Liste auf', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-DEL3`, bezeichnung: 'Zu löschen 3' })
    asManager()
    await cabinetService.softDeleteGgaCabinet(cabinet.id, 'Test')
    const list = await cabinetService.getVisibleGgaCabinets({ projectId: projectAId })
    expect(list.some((item) => item.id === cabinet.id)).toBe(false)
  })

  // ── IDOR ─────────────────────────────────────────────────────
  it('IDOR: ein Nutzer aus Projekt B kann einen Schrank aus Projekt A nicht lesen', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-IDOR`, bezeichnung: 'Nur für Projekt A' })
    asOutsider()
    await expect(cabinetService.getGgaCabinetDetail(cabinet.id)).rejects.toThrow('nicht gefunden')
    await expect(cabinetService.updateGgaCabinet(cabinet.id, { bezeichnung: 'Manipuliert' })).rejects.toThrow('nicht gefunden')
    await expect(cabinetService.softDeleteGgaCabinet(cabinet.id, 'Angriff')).rejects.toThrow('nicht gefunden')
  })

  // ── Manipulierte cabinetId auf Task/Checklist/Blocker/Approval ─
  it('setzt cabinetId auf einem Task innerhalb desselben Projekts und protokolliert es', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-TASK`, bezeichnung: 'Für Task-Zuordnung' })
    const task = await db.collaborationTask.create({ data: { projectId: projectAId, stageId: stagePlanungId, title: 'Abluft anschließen' } })
    asManager()
    await cabinetService.setCabinetOnEntity('task', task.id, cabinet.id)
    const updated = await db.collaborationTask.findUnique({ where: { id: task.id } })
    expect(updated.cabinetId).toBe(cabinet.id)
  })

  it('lehnt eine cabinetId aus einem fremden Projekt für Task/Checklist/Blocker/Approval ab', async () => {
    asOutsider()
    const foreignCabinet = await cabinetService.createGgaCabinet(projectBId, { kennung: `${marker}-FOREIGN`, bezeichnung: 'Gehört zu Projekt B' })

    asPlanner()
    const task = await db.collaborationTask.create({ data: { projectId: projectAId, stageId: stagePlanungId, title: 'Task A' } })
    await expect(cabinetService.setCabinetOnEntity('task', task.id, foreignCabinet.id)).rejects.toThrow('nicht gefunden')

    const checklistItem = await db.collaborationChecklistItem.create({ data: { projectId: projectAId, stageId: stagePlanungId, title: 'Check A' } })
    await expect(cabinetService.setCabinetOnEntity('checklist-item', checklistItem.id, foreignCabinet.id)).rejects.toThrow('nicht gefunden')

    const blocker = await db.collaborationBlocker.create({ data: { projectId: projectAId, title: 'Blocker A' } })
    await expect(cabinetService.setCabinetOnEntity('blocker', blocker.id, foreignCabinet.id)).rejects.toThrow('nicht gefunden')

    const approval = await db.collaborationApproval.create({ data: { projectId: projectAId, stageId: stageAbnahmeId, requestedById: plannerUserId } })
    await expect(cabinetService.setCabinetOnEntity('approval', approval.id, foreignCabinet.id)).rejects.toThrow('nicht gefunden')

    // Verify none of them got the foreign cabinet attached
    expect((await db.collaborationTask.findUnique({ where: { id: task.id } })).cabinetId).toBeNull()
  })

  it('ein Nutzer ohne Zugriff auf das Projekt kann keine cabinetId auf einem Task setzen', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-TASK2`, bezeichnung: 'Für Angriffstest' })
    const task = await db.collaborationTask.create({ data: { projectId: projectAId, stageId: stagePlanungId, title: 'Task für Angriff' } })
    asOutsider()
    await expect(cabinetService.setCabinetOnEntity('task', task.id, cabinet.id)).rejects.toThrow('nicht gefunden')
  })

  // ── Statusableitung über echte, verknüpfte Daten ─────────────
  it('leitet den Planungsfortschritt aus real verknüpften Tasks ab, ohne einen Statuswert zu speichern', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-STATUS`, bezeichnung: 'Statusableitung' })
    const task = await db.collaborationTask.create({ data: { projectId: projectAId, stageId: stagePlanungId, title: 'Planung Task', cabinetId: cabinet.id, status: 'DONE' } })
    const list = await cabinetService.getVisibleGgaCabinets({ projectId: projectAId })
    const found = list.find((item) => item.id === cabinet.id)
    expect(found?.planungsfortschritt).toBe(100)
    // Kein Statusfeld wird tatsächlich in gga_cabinets gespeichert:
    const columns = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'gga_cabinets'`)
    const columnNames = columns.map((c: any) => c.column_name)
    expect(columnNames).not.toContain('planungsfortschritt')
    expect(columnNames).not.toContain('status')
    await db.collaborationTask.delete({ where: { id: task.id } })
  })

  // ── Control-Tower-Aggregation ─────────────────────────────────
  it('aggregiert die Schränke-Kachel für das Control-Tower rein berechnet', async () => {
    asManager()
    const summary = await cabinetService.getGgaCabinetControlTowerSummary(projectAId)
    expect(summary).not.toBeNull()
    expect(summary!.gesamt).toBeGreaterThan(0)
  })

  // REQ-012: ein Projekt ohne GGA-Schränke lieferte vor diesem Checkpoint
  // `null` zurück — die Projektseite musste den Leerfall gesondert behandeln
  // und zeigte in diesem Fall gar keine Kachel. Jetzt: konsistente Nullwerte.
  it('liefert bei einem Projekt ohne GGA-Schränke konsistente Nullwerte statt null', async () => {
    const emptyProject = await db.collaborationProject.create({ data: { projectNumber: `${marker}-EMPTY`, name: 'Projekt ohne GGA-Schränke', active: true } })
    const membership = await db.collaborationMembership.create({ data: { projectId: emptyProject.id, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    asManager()
    const summary = await cabinetService.getGgaCabinetControlTowerSummary(emptyProject.id)
    expect(summary).not.toBeNull()
    expect(summary!.gesamt).toBe(0)
    expect(summary!.abgeschlossen).toBe(0)
    expect(summary!.mitBlocker).toBe(0)
    expect(summary!.freigabeOffen).toBe(0)
    expect(summary!.nachpruefungErforderlich).toBe(0)
    expect(summary!.aufmerksamkeitErforderlich).toBe(0)
    expect(summary!.cabinets).toEqual([])
    await db.collaborationMembership.delete({ where: { id: membership.id } })
    await db.collaborationProject.delete({ where: { id: emptyProject.id } })
  })

  // ── REQ-013: Projekt-Arbeitsliste "Fristen & nächste Aktionen" ────────
  it('REQ-013: eine erledigte Maßnahme mit vergangener Frist erscheint nicht in der Arbeitsliste, eine offene mit künftiger Frist schon', async () => {
    asPlanner()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-WORKLIST-1`, bezeichnung: 'Arbeitsliste Test' })
    const erledigt = await db.collaborationTask.create({ data: { projectId: projectAId, stageId: stagePlanungId, cabinetId: cabinet.id, title: 'Erledigte Maßnahme', isRequired: true, status: 'DONE', dueDate: new Date('2020-01-01') } })
    const offen = await db.collaborationTask.create({ data: { projectId: projectAId, stageId: stagePlanungId, cabinetId: cabinet.id, title: 'Offene Maßnahme', isRequired: true, status: 'TODO', dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) } })

    const worklist = await cabinetService.getGgaCabinetProjectWorklist(projectAId)
    const titles = worklist.filter((entry) => entry.cabinetId === cabinet.id).map((entry) => entry.title)
    expect(titles).toContain('Offene Maßnahme')
    expect(titles).not.toContain('Erledigte Maßnahme')

    await db.collaborationTask.deleteMany({ where: { id: { in: [erledigt.id, offen.id] } } })
  })

  it('REQ-013: die Arbeitsliste enthält ausschließlich Einträge des angefragten Projekts — keine Daten aus einem fremden Projekt', async () => {
    // outsider ist ausschließlich COLLAB_MANAGER in Projekt B (siehe Setup oben).
    asOutsider()
    const foreignCabinet = await cabinetService.createGgaCabinet(projectBId, { kennung: `${marker}-WORKLIST-FOREIGN`, bezeichnung: 'Fremdes Projekt' })
    await db.collaborationBlocker.create({ data: { projectId: projectBId, cabinetId: foreignCabinet.id, title: 'Fremder Mangel' } })

    asManager()
    const worklistA = await cabinetService.getGgaCabinetProjectWorklist(projectAId)
    expect(worklistA.some((entry) => entry.cabinetId === foreignCabinet.id)).toBe(false)
    expect(worklistA.some((entry) => entry.title === 'Fremder Mangel')).toBe(false)
  })
})
