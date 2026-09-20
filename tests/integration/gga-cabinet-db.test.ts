import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { BusinessRuleError } from '@/lib/auth/permissions'

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
  let phase2Service: typeof import('@/lib/services/collaboration-phase2.service')
  const marker = `GGA-CAB-${Date.now()}-${Math.random().toString(16).slice(2)}`

  let managerUserId = '', managerEmail = ''
  let plannerUserId = '', plannerEmail = ''
  let viewerUserId = '', viewerEmail = ''
  let outsiderUserId = '', outsiderEmail = ''
  let projectAOperatorUserId = '', projectAOperatorEmail = ''
  // GGA-04.3: COLLAB_MEMBER-Mitglied von Projekt A — Rollenmatrix für
  // getVisibleCollaborationMemberships() deckte diese Rolle bisher nicht ab.
  let collabMemberUserId = '', collabMemberEmail = ''

  let projectAId = '', projectBId = ''
  let stageKonzeptId = '', stagePlanungId = '', stageUmsetzungId = '', stageAbnahmeId = ''
  let stageKonzeptBId = ''
  let membershipManagerId = ''

  function asManager() { auth.getServerSession.mockResolvedValue({ user: { id: managerUserId, email: managerEmail, authScope: 'COLLABORATION' } }) }
  function asPlanner() { auth.getServerSession.mockResolvedValue({ user: { id: plannerUserId, email: plannerEmail, authScope: 'COLLABORATION' } }) }
  function asViewer() { auth.getServerSession.mockResolvedValue({ user: { id: viewerUserId, email: viewerEmail, authScope: 'COLLABORATION' } }) }
  function asOutsider() { auth.getServerSession.mockResolvedValue({ user: { id: outsiderUserId, email: outsiderEmail, authScope: 'COLLABORATION' } }) }
  // GGA-04.1: OPERATOR-Mitglied von Projekt A — für den Security-Regressionstest.
  function asProjectAOperator() { auth.getServerSession.mockResolvedValue({ user: { id: projectAOperatorUserId, email: projectAOperatorEmail, authScope: 'COLLABORATION' } }) }
  function asCollabMember() { auth.getServerSession.mockResolvedValue({ user: { id: collabMemberUserId, email: collabMemberEmail, authScope: 'COLLABORATION' } }) }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })

    const mk = async (label: string) => db.user.create({ data: { email: `${marker}-${label}@example.invalid`, passwordHash: 'not-used', firstName: label, lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
    const manager = await mk('manager'); managerUserId = manager.id; managerEmail = manager.email
    const planner = await mk('planner'); plannerUserId = planner.id; plannerEmail = planner.email
    const viewer = await mk('viewer'); viewerUserId = viewer.id; viewerEmail = viewer.email
    const outsider = await mk('outsider'); outsiderUserId = outsider.id; outsiderEmail = outsider.email
    const projectAOperator = await mk('projA-operator'); projectAOperatorUserId = projectAOperator.id; projectAOperatorEmail = projectAOperator.email
    const collabMember = await mk('collab-member'); collabMemberUserId = collabMember.id; collabMemberEmail = collabMember.email

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
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: projectAOperatorUserId, role: 'OPERATOR' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: collabMemberUserId, role: 'COLLAB_MEMBER' } })

    const stageKonzept = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'KONZEPT', title: 'Konzept', sequence: 1, weight: 10 } })
    stageKonzeptId = stageKonzept.id
    const stagePlanung = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'PLANUNG', title: 'Planung', sequence: 2, weight: 20 } })
    stagePlanungId = stagePlanung.id
    const stageUmsetzung = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'UMSETZUNG', title: 'Umsetzung', sequence: 3, weight: 35 } })
    stageUmsetzungId = stageUmsetzung.id
    const stageAbnahme = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'ABNAHME', title: 'Abnahme', sequence: 4, weight: 25 } })
    stageAbnahmeId = stageAbnahme.id
    // GGA-04.4: Stage in Projekt B — nur zum Anlegen fremder Task-/Checklisten-
    // Fixtures für den projectId-Filter-IDOR-Test benötigt (CollaborationTask/
    // -ChecklistItem verlangen zwingend eine stageId).
    const stageKonzeptB = await db.collaborationProjectStage.create({ data: { projectId: projectBId, code: 'KONZEPT', title: 'Konzept B', sequence: 1, weight: 10 } })
    stageKonzeptBId = stageKonzeptB.id

    cabinetService = await import('@/lib/services/gga-cabinet.service')
    phase2Service = await import('@/lib/services/collaboration-phase2.service')
  })

  afterAll(async () => {
    if (!db) return
    const allUserIds = [managerUserId, plannerUserId, viewerUserId, outsiderUserId, projectAOperatorUserId, collabMemberUserId].filter(Boolean)
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

  // ── REQ-014: Projektübergreifender GGA Control Tower ───────────────────
  it('REQ-014: OPERATOR-Mitgliedschaften werden aus dem internen Control Tower ausgeschlossen; Zugriff bleibt korrekt auf die eigenen Projekte begrenzt', async () => {
    const ctProject = await db.collaborationProject.create({ data: { projectNumber: `${marker}-CT`, name: 'Nur-Betreiber-Projekt', active: true } })
    const operatorMembership = await db.collaborationMembership.create({ data: { projectId: ctProject.id, userId: outsiderUserId, role: 'OPERATOR' } })
    const operatorOnlyCabinet = await db.ggaCabinet.create({ data: { projectId: ctProject.id, kennung: `${marker}-CT-001`, bezeichnung: 'Nur für Betreiber sichtbar' } })

    // outsiderUserId ist COLLAB_MANAGER in Projekt B UND (neu, nur für diesen
    // Test) OPERATOR in ctProject — der interne Control Tower darf für diese
    // OPERATOR-Mitgliedschaft keinerlei Daten liefern.
    asOutsider()
    const operatorOverview = await cabinetService.getGgaControlTowerOverview()
    expect(operatorOverview.projekte.some((p) => p.projectId === ctProject.id)).toBe(false)
    expect(operatorOverview.dringendeSchraenke.some((c) => c.cabinetId === operatorOnlyCabinet.id)).toBe(false)

    // Manager ist ausschließlich Mitglied von Projekt A — Cross-Project-Scoping.
    asManager()
    const managerOverview = await cabinetService.getGgaControlTowerOverview()
    expect(managerOverview.projekte.length).toBeGreaterThan(0)
    expect(managerOverview.projekte.every((p) => p.projectId === projectAId)).toBe(true)
    expect(managerOverview.projekte.some((p) => p.projectId === ctProject.id)).toBe(false)

    await db.ggaCabinet.delete({ where: { id: operatorOnlyCabinet.id } })
    await db.collaborationMembership.delete({ where: { id: operatorMembership.id } })
    await db.collaborationProject.delete({ where: { id: ctProject.id } })
  })

  // GGA-Portal-Weiterentwicklung: ein NICHT_BESTANDEN-Prüfnachweis (real über
  // die bestehende recordGgaCabinetPruefnachweis()-Funktion erfasst) macht das
  // Cabinet im Control Tower real sichtbar als Handlungsbedarf — real gegen
  // die DB geprüft (nicht nur die reine Aggregationsfunktion), da
  // getGgaControlTowerOverview() dafür einen echten, gebündelten
  // Prüfnachweis-Query ausführt.
  it('REQ-014 + GGA-Portal: ein Cabinet mit NICHT_BESTANDEN-Prüfnachweis (VDE) erscheint real im Control Tower als Handlungsbedarf mit dem passenden Grund', async () => {
    asManager()
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-CT-VDE`, bezeichnung: 'VDE nicht bestanden' })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinet.id, 'VDE', 'NICHT_BESTANDEN', {})

    const overview = await cabinetService.getGgaControlTowerOverview()
    const eintrag = overview.dringendeSchraenke.find((c) => c.cabinetId === cabinet.id)
    expect(eintrag).toBeDefined()
    expect(eintrag?.gruende).toContain('VDE_NICHT_BESTANDEN')

    const inWorklist = overview.alleSchraenke.find((c) => c.id === cabinet.id)
    expect(inWorklist?.nichtBestandenePruefarten).toEqual(['VDE'])

    await db.ggaCabinetPruefnachweis.deleteMany({ where: { cabinetId: cabinet.id } })
    await db.collaborationChecklistItem.deleteMany({ where: { cabinetId: cabinet.id } })
    await db.ggaCabinet.delete({ where: { id: cabinet.id } })
  })

  // ── GGA-04.1: Security-Fix — OPERATOR darf keine internen Projekt-/GGA-Lesedaten erhalten ──
  describe('GGA-04.1: OPERATOR-Ausschluss von internen Lesezugriffen', () => {
    it('A) eine berechtigte interne Rolle (COLLAB_MANAGER) erhält weiterhin das volle interne Projektdetail', async () => {
      asManager()
      const project = await phase2Service.getCollaborationPhase2Project(projectAId)
      expect(project.id).toBe(projectAId)
      expect(project.role).toBe('COLLAB_MANAGER')
    })

    it('B) OPERATOR (Mitglied von Projekt A) erhält 403 beim Versuch, das interne Projektdetail direkt zu lesen', async () => {
      asProjectAOperator()
      await expect(phase2Service.getCollaborationPhase2Project(projectAId)).rejects.toThrow('Kein Zugriff auf den internen Projektbereich')
    })

    it('B) OPERATOR erhält 403 bei den REQ-012/013-Lesefunktionen desselben Projekts', async () => {
      asProjectAOperator()
      await expect(cabinetService.getGgaCabinetControlTowerSummary(projectAId)).rejects.toThrow('Kein Zugriff auf den internen Projektbereich')
      await expect(cabinetService.getGgaCabinetProjectWorklist(projectAId)).rejects.toThrow('Kein Zugriff auf den internen Projektbereich')
    })

    it('C) OPERATOR erhält 403 bei der internen Schrank-Audit-Historie', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-SEC-001`, bezeichnung: 'Security-Test' })
      asProjectAOperator()
      await expect(cabinetService.getGgaCabinetAuditHistory(cabinet.id)).rejects.toThrow('Keine Berechtigung für diesen Schrank')
    })

    it('F) OPERATOR behält weiterhin Zugriff auf die gemeinsam genutzte Schrank-Detailfunktion (Betreiberportal nicht beschädigt)', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-SEC-002`, bezeichnung: 'Security-Test Betreiber' })
      asProjectAOperator()
      const detail = await cabinetService.getGgaCabinetDetail(cabinet.id)
      expect(detail.id).toBe(cabinet.id)
      expect(detail.role).toBe('OPERATOR')
    })

    it('G) Cross-Project-IDOR bleibt verboten: OPERATOR aus Projekt A kommt an Projekt B nicht heran (NotFoundError, nicht 403)', async () => {
      asProjectAOperator()
      await expect(phase2Service.getCollaborationPhase2Project(projectBId)).rejects.toThrow('nicht gefunden')
    })

    it('H) eine interne Rolle ohne jede Mitgliedschaft in Projekt A bleibt weiterhin verboten', async () => {
      asOutsider() // COLLAB_MANAGER, aber nur in Projekt B
      await expect(phase2Service.getCollaborationPhase2Project(projectAId)).rejects.toThrow('nicht gefunden')
    })
  })

  // ── GGA-04.2: P0-A/P0-B — OPERATOR-/VIEWER-Schreibzugriffe geschlossen ──
  describe('GGA-04.2: OPERATOR-/VIEWER-Schreibzugriffe im internen Collaboration-/GGA-Workflow', () => {
    it('A) OPERATOR kann keine interne Aufgabe anlegen', async () => {
      asProjectAOperator()
      await expect(phase2Service.createCollaborationTask(stagePlanungId, { title: 'Illegitime Aufgabe (OPERATOR)' })).rejects.toThrow('Keine Berechtigung für diese Projektstufe')
    })

    it('B) OPERATOR kann eine bestehende interne Aufgabe nicht ändern', async () => {
      asPlanner()
      const task = await phase2Service.createCollaborationTask(stagePlanungId, { title: `${marker}-Task-B` })
      asProjectAOperator()
      await expect(phase2Service.updateCollaborationTask(task.id, { title: 'Manipuliert (OPERATOR)' })).rejects.toThrow('Keine Berechtigung für diese Projektstufe')
    })

    it('C) OPERATOR kann keinen internen Checklistenpunkt anlegen', async () => {
      asProjectAOperator()
      await expect(phase2Service.createCollaborationChecklistItem(stagePlanungId, { title: 'Illegitimer Punkt (OPERATOR)' })).rejects.toThrow('Keine Berechtigung für diese Projektstufe')
    })

    it('D) OPERATOR kann einen stufengebundenen Blocker nicht auflösen', async () => {
      asPlanner()
      const blocker = await phase2Service.createCollaborationBlocker(projectAId, { title: `${marker}-Blocker-D`, stageId: stagePlanungId })
      asProjectAOperator()
      await expect(phase2Service.resolveCollaborationBlocker(blocker.id, 'Versuch (OPERATOR)')).rejects.toThrow('Keine Berechtigung für diese Projektstufe')
    })

    it('E) OPERATOR kann keine interne Freigabe anfordern', async () => {
      asProjectAOperator()
      await expect(phase2Service.requestCollaborationApproval(stageAbnahmeId)).rejects.toThrow('Keine Berechtigung für diese Projektstufe')
    })

    it('F) OPERATOR kann keinen internen GGA-Prüfpunkt setzen', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-042-F`, bezeichnung: 'Inspektionstest' })
      asProjectAOperator()
      await expect(cabinetService.setGgaCabinetInspectionItem(cabinet.id, 'Elektro/VDE geprüft', true)).rejects.toThrow('Keine Berechtigung für diesen Schrank')
    })

    it('G) COLLAB_VIEWER kann einen projektweiten Blocker ohne stageId nicht auflösen', async () => {
      asManager()
      const projectWideBlocker = await phase2Service.createCollaborationBlocker(projectAId, { title: `${marker}-Blocker-G` })
      expect(projectWideBlocker.stageId).toBeNull()
      asViewer()
      await expect(phase2Service.resolveCollaborationBlocker(projectWideBlocker.id, 'Versuch (COLLAB_VIEWER)')).rejects.toThrow('Keine Berechtigung für Blocker')
    })

    it('H) eine interne Editor-Rolle kann einen projektweiten Blocker ohne stageId weiterhin auflösen', async () => {
      asPlanner()
      const projectWideBlocker = await phase2Service.createCollaborationBlocker(projectAId, { title: `${marker}-Blocker-H` })
      const resolved = await phase2Service.resolveCollaborationBlocker(projectWideBlocker.id, 'Behoben (INTERNAL_PLANNER)')
      expect(resolved.status).toBe('RESOLVED')
    })

    it('I) die REQ-011-Mangelbehebung (Blocker mit stageId + cabinetId) funktioniert für interne Editor-Rollen unverändert', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-042-I`, bezeichnung: 'Mangeltest' })
      const cabinetBlocker = await phase2Service.createCollaborationBlocker(projectAId, { title: `${marker}-Blocker-I`, stageId: stageAbnahmeId, cabinetId: cabinet.id })
      const resolved = await phase2Service.resolveCollaborationBlocker(cabinetBlocker.id, 'Dichtung ersetzt und Tür neu justiert.')
      expect(resolved.status).toBe('RESOLVED')
      expect(resolved.resolution).toBe('Dichtung ersetzt und Tür neu justiert.')
    })

    it('J) OPERATOR kann weiterhin seine eigene Betreiberfreigabe entscheiden (legitimer Betreiberprozess bleibt unverändert)', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-042-J`, bezeichnung: 'Betreiberentscheidungstest' })
      // REQ-015 / GGA-05.2: Betreiberfreigabe ist jetzt serverseitig an eine
      // bereits bestandene interne Prüfung gekoppelt (vorher nur UI-Gate,
      // siehe cabinet-workflow.ts → ggaCabinetBereitFuerBetreiberfreigabe) —
      // dieser bereits bestehende Test muss diese Voraussetzung jetzt real
      // herstellen, statt sie (wie vor REQ-015 möglich) zu überspringen.
      for (const title of cabinetService.GGA_CABINET_CHECKLIST_TEMPLATES.ABNAHME.items) {
        await cabinetService.setGgaCabinetInspectionItem(cabinet.id, title, true)
      }
      const internal = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)
      await phase2Service.decideCollaborationApproval(internal.id, 'APPROVED')
      const approvalRequest = await cabinetService.requestGgaCabinetOperatorApproval(cabinet.id)
      asProjectAOperator()
      const decided = await cabinetService.decideGgaCabinetOperatorApproval(approvalRequest.id, { decision: 'APPROVED', unterlagenGeprueft: true })
      expect(decided.status).toBe('APPROVED')
    })

    it('L) eine Rolle ohne jede Mitgliedschaft in Projekt A kann dort keine interne Aufgabe anlegen (Cross-Project-Mutation bleibt verboten)', async () => {
      asOutsider() // COLLAB_MANAGER, aber nur Mitglied von Projekt B
      await expect(phase2Service.createCollaborationTask(stagePlanungId, { title: 'Cross-Project-Angriff' })).rejects.toThrow('nicht gefunden')
    })
  })

  // ── GGA-04.3: getVisibleCollaborationMemberships() — projectId-Filter-IDOR geschlossen ──
  describe('GGA-04.3: Mitgliedschafts-IDOR über projectId-Filter geschlossen', () => {
    it('1) Same-project: ein Mitglied von Projekt A sieht die Mitgliederliste von Projekt A', async () => {
      asManager()
      const memberships = await phase2Service.getVisibleCollaborationMemberships({ projectId: projectAId })
      expect(memberships.length).toBeGreaterThan(0)
      expect(memberships.every((m) => m.project.id === projectAId)).toBe(true)
    })

    it('2) Cross-Project-IDOR: ein Nutzer aus Projekt B kann die Mitgliederliste von Projekt A nicht über die projectId lesen', async () => {
      asOutsider() // COLLAB_MANAGER, aber nur Mitglied von Projekt B
      await expect(phase2Service.getVisibleCollaborationMemberships({ projectId: projectAId })).rejects.toThrow('nicht gefunden')
    })

    it('3) unbekannte projectId: dieselbe NotFoundError wie bei einem fremden, aber existierenden Projekt — kein Leak über Existenz', async () => {
      asManager()
      await expect(phase2Service.getVisibleCollaborationMemberships({ projectId: 'does-not-exist' })).rejects.toThrow('nicht gefunden')
    })

    it('4) OPERATOR kann weiterhin die Mitgliederliste des eigenen Projekts lesen (bereits autorisierte Aufrufstelle cabinets/[id] darf nicht brechen)', async () => {
      asProjectAOperator()
      const memberships = await phase2Service.getVisibleCollaborationMemberships({ projectId: projectAId })
      expect(memberships.every((m) => m.project.id === projectAId)).toBe(true)
    })

    it('5) COLLAB_VIEWER kann die Mitgliederliste des eigenen Projekts lesen', async () => {
      asViewer()
      const memberships = await phase2Service.getVisibleCollaborationMemberships({ projectId: projectAId })
      expect(memberships.every((m) => m.project.id === projectAId)).toBe(true)
    })

    it('6) COLLAB_MEMBER kann die Mitgliederliste des eigenen Projekts lesen', async () => {
      asCollabMember()
      const memberships = await phase2Service.getVisibleCollaborationMemberships({ projectId: projectAId })
      expect(memberships.every((m) => m.project.id === projectAId)).toBe(true)
    })

    it('7) ein interner Editor (INTERNAL_PLANNER) kann die Mitgliederliste des eigenen Projekts lesen', async () => {
      asPlanner()
      const memberships = await phase2Service.getVisibleCollaborationMemberships({ projectId: projectAId })
      expect(memberships.every((m) => m.project.id === projectAId)).toBe(true)
    })

    it('8) Aufruf ohne projectId behält sein bisheriges Scoping auf die eigenen Mitgliedschaften (Projekt B des Outsiders, nicht Projekt A)', async () => {
      asOutsider()
      const memberships = await phase2Service.getVisibleCollaborationMemberships()
      expect(memberships.length).toBeGreaterThan(0)
      expect(memberships.every((m) => m.project.id === projectBId)).toBe(true)
    })

    it('9) projectId-Filter liefert ausschließlich Memberships dieses einen Projekts, keine aus anderen sichtbaren Projekten', async () => {
      asManager()
      const memberships = await phase2Service.getVisibleCollaborationMemberships({ projectId: projectAId })
      expect(memberships.some((m) => m.project.id === projectBId)).toBe(false)
    })
  })

  // ── GGA-04.4: getVisibleCollaborationTasks/-ChecklistItems/-Blockers — projectId-Filter-IDOR geschlossen ──
  describe('GGA-04.4: Tasks/Checklisten/Blocker-IDOR über projectId-Filter geschlossen', () => {
    let taskAId = '', checklistAId = '', blockerAId = ''
    let taskBId = '', checklistBId = '', blockerBId = ''

    beforeAll(async () => {
      const taskA = await db.collaborationTask.create({ data: { projectId: projectAId, stageId: stagePlanungId, title: `${marker}-044-TaskA` } })
      taskAId = taskA.id
      const checklistA = await db.collaborationChecklistItem.create({ data: { projectId: projectAId, stageId: stagePlanungId, title: `${marker}-044-ChecklistA` } })
      checklistAId = checklistA.id
      const blockerA = await db.collaborationBlocker.create({ data: { projectId: projectAId, title: `${marker}-044-BlockerA` } })
      blockerAId = blockerA.id

      const taskB = await db.collaborationTask.create({ data: { projectId: projectBId, stageId: stageKonzeptBId, title: `${marker}-044-TaskB` } })
      taskBId = taskB.id
      const checklistB = await db.collaborationChecklistItem.create({ data: { projectId: projectBId, stageId: stageKonzeptBId, title: `${marker}-044-ChecklistB` } })
      checklistBId = checklistB.id
      const blockerB = await db.collaborationBlocker.create({ data: { projectId: projectBId, title: `${marker}-044-BlockerB` } })
      blockerBId = blockerB.id
    })

    afterAll(async () => {
      await db.collaborationTask.deleteMany({ where: { id: { in: [taskAId, taskBId].filter(Boolean) } } })
      await db.collaborationChecklistItem.deleteMany({ where: { id: { in: [checklistAId, checklistBId].filter(Boolean) } } })
      await db.collaborationBlocker.deleteMany({ where: { id: { in: [blockerAId, blockerBId].filter(Boolean) } } })
    })

    const scenarios = [
      {
        name: 'getVisibleCollaborationTasks',
        call: (filters?: { projectId?: string }) => phase2Service.getVisibleCollaborationTasks(filters),
        ownId: () => taskAId, foreignId: () => taskBId,
      },
      {
        name: 'getVisibleCollaborationChecklistItems',
        call: (filters?: { projectId?: string }) => phase2Service.getVisibleCollaborationChecklistItems(filters),
        ownId: () => checklistAId, foreignId: () => checklistBId,
      },
      {
        name: 'getVisibleCollaborationBlockers',
        call: (filters?: { projectId?: string }) => phase2Service.getVisibleCollaborationBlockers(filters),
        ownId: () => blockerAId, foreignId: () => blockerBId,
      },
    ]

    for (const { name, call, ownId, foreignId } of scenarios) {
      describe(name, () => {
        it('1) eigenes Projekt erlaubt', async () => {
          asManager()
          const rows = await call({ projectId: projectAId }) as { id: string }[]
          expect(rows.some((r) => r.id === ownId())).toBe(true)
        })

        it('2) fremdes Projekt verboten (Cross-Project-IDOR)', async () => {
          asManager()
          await expect(call({ projectId: projectBId })).rejects.toThrow('nicht gefunden')
        })

        it('3) unbekannte projectId verboten (kein Existenz-Leak)', async () => {
          asManager()
          await expect(call({ projectId: 'does-not-exist' })).rejects.toThrow('nicht gefunden')
        })

        it('4) OPERATOR erhält für das eigene Projekt weiterhin Daten (konsistent mit unverändertem ungefiltertem Scoping)', async () => {
          asProjectAOperator()
          const rows = await call({ projectId: projectAId }) as { project: { id: string } }[]
          expect(rows.every((r) => r.project.id === projectAId)).toBe(true)
        })

        it('5) COLLAB_VIEWER erhält für das eigene Projekt Daten', async () => {
          asViewer()
          const rows = await call({ projectId: projectAId }) as { project: { id: string } }[]
          expect(rows.every((r) => r.project.id === projectAId)).toBe(true)
        })

        it('6) COLLAB_MEMBER erhält für das eigene Projekt Daten', async () => {
          asCollabMember()
          const rows = await call({ projectId: projectAId }) as { project: { id: string } }[]
          expect(rows.every((r) => r.project.id === projectAId)).toBe(true)
        })

        it('7) INTERNAL_PLANNER (interner Editor) erhält für das eigene Projekt Daten', async () => {
          asPlanner()
          const rows = await call({ projectId: projectAId }) as { project: { id: string } }[]
          expect(rows.every((r) => r.project.id === projectAId)).toBe(true)
        })

        it('8) Aufruf ohne projectId behält sein bisheriges Scoping (nur Projekt B des Outsiders)', async () => {
          asOutsider()
          const rows = await call() as { project: { id: string } }[]
          expect(rows.every((r) => r.project.id === projectBId)).toBe(true)
        })

        it('9) projectId-Filter liefert ausschließlich Daten dieses einen Projekts', async () => {
          asManager()
          const rows = await call({ projectId: projectAId }) as { id: string }[]
          expect(rows.some((r) => r.id === foreignId())).toBe(false)
        })
      })
    }

    it('kombinierter Regressionstest: ein Benutzer aus Projekt A erhält über keinen der drei Query-Parameter Daten aus Projekt B', async () => {
      asManager()
      await expect(phase2Service.getVisibleCollaborationTasks({ projectId: projectBId })).rejects.toThrow('nicht gefunden')
      await expect(phase2Service.getVisibleCollaborationChecklistItems({ projectId: projectBId })).rejects.toThrow('nicht gefunden')
      await expect(phase2Service.getVisibleCollaborationBlockers({ projectId: projectBId })).rejects.toThrow('nicht gefunden')
    })
  })

  // ── REQ-015 / GGA-05.2: Freigabe-Kette — serverseitige Readiness-Gates ──
  // Vorher: interne Freigabe hatte KEIN Gate (weder UI noch Server);
  // Betreiberfreigabe hatte nur ein UI-Gate. Beide Aufrufe hier gehen direkt
  // gegen die Service-Funktionen — exakt der Pfad, den ein direkter API-
  // Aufruf (app/api/collaboration/workflow/route.ts) ebenfalls nimmt und
  // damit kein UI-Gate umgehen kann, weil serverseitig gar kein UI existiert.
  describe('REQ-015: Freigabe-Kette-Readiness (interne Freigabe + Betreiberfreigabe)', () => {
    async function markAbnahmeChecklistComplete(cabinetId: string) {
      for (const title of cabinetService.GGA_CABINET_CHECKLIST_TEMPLATES.ABNAHME.items) {
        await cabinetService.setGgaCabinetInspectionItem(cabinetId, title, true)
      }
    }

    it('1) interne Freigabe zu früh (ABNAHME-Checkliste leer) → serverseitig BLOCKED', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-1`, bezeichnung: 'Zu früh (intern)' })
      await expect(phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)).rejects.toThrow('ABNAHME-Checkliste')
      const approvalCount = await db.collaborationApproval.count({ where: { cabinetId: cabinet.id } })
      expect(approvalCount).toBe(0)
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('2) interne Freigabe bei vollständiger ABNAHME-Checkliste (erfüllte Voraussetzungen) → ALLOWED', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-2`, bezeichnung: 'Bereit (intern)' })
      await markAbnahmeChecklistComplete(cabinet.id)
      const approval = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)
      expect(approval.status).toBe('REQUESTED')
      await db.collaborationApproval.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.collaborationChecklistItem.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('3) Betreiberfreigabe zu früh (keine bestandene interne Prüfung) → serverseitig BLOCKED', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-3`, bezeichnung: 'Zu früh (Betreiber)' })
      await expect(cabinetService.requestGgaCabinetOperatorApproval(cabinet.id)).rejects.toThrow('interne Prüfung')
      const approvalCount = await db.collaborationApproval.count({ where: { cabinetId: cabinet.id, approvalType: 'OPERATOR_ACCEPTANCE' } })
      expect(approvalCount).toBe(0)
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('4) Betreiberfreigabe nach bestandener interner Prüfung (erfüllte Voraussetzungen) → ALLOWED', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-4`, bezeichnung: 'Bereit (Betreiber)' })
      await markAbnahmeChecklistComplete(cabinet.id)
      const internal = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)
      await phase2Service.decideCollaborationApproval(internal.id, 'APPROVED')
      const operatorApproval = await cabinetService.requestGgaCabinetOperatorApproval(cabinet.id)
      expect(operatorApproval.status).toBe('REQUESTED')
      await db.collaborationApproval.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.collaborationChecklistItem.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('5) direkter Service-Aufruf kann das (nur clientseitig existierende) UI-Gate nicht umgehen — derselbe Server-Guard gilt unabhängig vom Aufrufpfad', async () => {
      // Es gibt serverseitig keinen separaten "UI-Pfad" — jede Aufrufstelle
      // (Wizard-Fetch, direkter API-Aufruf, dieser Test) landet in exakt
      // derselben requestCollaborationApproval()/requestGgaCabinetOperatorApproval()
      // -Funktion. Dieser Test bestätigt das explizit für beide Freigabearten
      // in einem Aufruf ohne jede vorbereitende UI-Interaktion.
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-5`, bezeichnung: 'Direkter Aufruf' })
      await expect(phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)).rejects.toBeInstanceOf(BusinessRuleError)
      await expect(cabinetService.requestGgaCabinetOperatorApproval(cabinet.id)).rejects.toBeInstanceOf(BusinessRuleError)
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('6) falsche Rolle (COLLAB_VIEWER) bleibt BLOCKED — unabhängig vom fachlichen Zustand, Rollenprüfung hat Vorrang', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-6`, bezeichnung: 'Falsche Rolle' })
      await markAbnahmeChecklistComplete(cabinet.id) // fachlich bereit — Rollenfehler muss trotzdem zuerst greifen
      asViewer()
      await expect(phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)).rejects.toThrow('Keine Berechtigung für diese Projektstufe')
      const approvalCount = await db.collaborationApproval.count({ where: { cabinetId: cabinet.id } })
      expect(approvalCount).toBe(0)
      await db.collaborationChecklistItem.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('7) gültige Rolle + ungültiger fachlicher Zustand bleibt BLOCKED (interne Freigabe, Checkliste unvollständig)', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-7`, bezeichnung: 'Ungültiger Zustand' })
      // Vollständige Vorlage anwenden (8 Pflichtpunkte), aber nur einen davon
      // abhaken — der Nenner muss die volle Vorlage sein, sonst wäre "1 von 1
      // angelegtem Punkt" fälschlich bereits 100 %.
      await cabinetService.applyGgaCabinetChecklistTemplate(cabinet.id, 'ABNAHME')
      await cabinetService.setGgaCabinetInspectionItem(cabinet.id, 'Abluft geprüft', true) // nur 1 von 8 Pflichtpunkten
      await expect(phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)).rejects.toThrow('ABNAHME-Checkliste')
      await db.collaborationChecklistItem.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('8) gültige Rolle + gültiger fachlicher Zustand → ALLOWED (beide Freigabearten im selben Ablauf)', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-8`, bezeichnung: 'Gültiger Zustand' })
      await markAbnahmeChecklistComplete(cabinet.id)
      const internal = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)
      expect(internal.status).toBe('REQUESTED')
      const decided = await phase2Service.decideCollaborationApproval(internal.id, 'APPROVED')
      expect(decided.status).toBe('APPROVED')
      const operatorApproval = await cabinetService.requestGgaCabinetOperatorApproval(cabinet.id)
      expect(operatorApproval.status).toBe('REQUESTED')
      await db.collaborationApproval.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.collaborationChecklistItem.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('9) bestehender korrekter Freigabeprozess bleibt regressionsfrei — REQ-011-Mangelbehebung + Ablehnung/Nacharbeit weiterhin unverändert möglich', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-9`, bezeichnung: 'Regressionstest' })
      await markAbnahmeChecklistComplete(cabinet.id)
      const firstRequest = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)
      // Eine Ablehnung darf trotz vollständiger Checkliste weiterhin möglich
      // sein — REJECTED wird nie durch das neue Gate blockiert (siehe Kommentar
      // in decideCollaborationApproval).
      const rejected = await phase2Service.decideCollaborationApproval(firstRequest.id, 'REJECTED', 'Bitte Dokumentation nachbessern')
      expect(rejected.status).toBe('REJECTED')
      // Nach Nacharbeit erneut anforderbar und genehmigbar — unverändertes
      // Verhalten aus GGA-05.2/vor REQ-015.
      const secondRequest = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)
      const approved = await phase2Service.decideCollaborationApproval(secondRequest.id, 'APPROVED')
      expect(approved.status).toBe('APPROVED')
      await db.collaborationApproval.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.collaborationChecklistItem.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('10) Entscheidungsweg: eine Regression zwischen Anforderung und Entscheidung (Checklistenpunkt nachträglich zurückgesetzt) blockiert APPROVED, erlaubt aber weiterhin REJECTED', async () => {
      asPlanner()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-015-10`, bezeichnung: 'Regression nach Anforderung' })
      await markAbnahmeChecklistComplete(cabinet.id)
      const request = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)
      // Nach der Anforderung wird ein Pflichtpunkt versehentlich zurückgesetzt.
      await cabinetService.setGgaCabinetInspectionItem(cabinet.id, 'Abluft geprüft', false)
      await expect(phase2Service.decideCollaborationApproval(request.id, 'APPROVED')).rejects.toThrow('ABNAHME-Checkliste')
      const rejected = await phase2Service.decideCollaborationApproval(request.id, 'REJECTED', 'Nachträglich unvollständig festgestellt')
      expect(rejected.status).toBe('REJECTED')
      await db.collaborationApproval.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.collaborationChecklistItem.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })

    it('11) andere Phasen (PLANUNG) mit requiresApproval bleiben vom ABNAHME-spezifischen Gate unberührt', async () => {
      // GGA_FIVE_PHASE_PLAN definiert requiresApproval auch für PLANUNG —
      // dieselbe requestCollaborationApproval()-Funktion wird hier ohne
      // cabinetId aufgerufen und darf durch das neue, ABNAHME-spezifische
      // Gate nicht beeinträchtigt werden.
      asPlanner()
      const approval = await phase2Service.requestCollaborationApproval(stagePlanungId)
      expect(approval.status).toBe('REQUESTED')
      await db.collaborationApproval.deleteMany({ where: { id: approval.id } })
    })
  })

  // ── GGA-Portal Produktblock 4: "Meine Arbeit" — verantwortlichUserId real ──
  // getVisibleCollaborationTasks()/getVisibleCollaborationBlockers() wurden
  // additiv um responsibleMembership.userId erweitert (zuvor nur der
  // Anzeigename). Real gegen die DB geprüft, weil sich hier das tatsächliche
  // Service-/Select-Verhalten geändert hat (Abschnitt 19).
  describe('GGA-Portal Produktblock 4: getVisibleCollaborationTasks/-Blockers liefern responsibleMembership.userId real aus der DB', () => {
    it('eine cabinet-gebundene, dem Manager zugewiesene Aufgabe/Blocker liefert userId === managerUserId, unzugewiesene bleiben null', async () => {
      asManager()
      const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-PB4-01`, bezeichnung: 'Meine Arbeit Testschrank' })
      const zugewiesen = await db.collaborationTask.create({
        data: { projectId: projectAId, stageId: stagePlanungId, cabinetId: cabinet.id, title: `${marker}-PB4-Task-zugewiesen`, isRequired: true, status: 'TODO', responsibleMembershipId: membershipManagerId },
      })
      const unzugewiesen = await db.collaborationTask.create({
        data: { projectId: projectAId, stageId: stagePlanungId, cabinetId: cabinet.id, title: `${marker}-PB4-Task-frei`, isRequired: true, status: 'TODO' },
      })
      const blockerZugewiesen = await db.collaborationBlocker.create({
        data: { projectId: projectAId, cabinetId: cabinet.id, title: `${marker}-PB4-Blocker-zugewiesen`, status: 'OPEN', responsibleMembershipId: membershipManagerId },
      })

      const tasks = await phase2Service.getVisibleCollaborationTasks({ projectId: projectAId })
      const gefundenZugewiesen = tasks.find((t) => t.id === zugewiesen.id)
      const gefundenUnzugewiesen = tasks.find((t) => t.id === unzugewiesen.id)
      expect(gefundenZugewiesen?.responsibleMembership?.userId).toBe(managerUserId)
      expect(gefundenZugewiesen?.project.projectNumber).toBe(`${marker}-A`)
      expect(gefundenUnzugewiesen?.responsibleMembership).toBeNull()

      const blockers = await phase2Service.getVisibleCollaborationBlockers({ projectId: projectAId, status: 'OPEN' })
      const gefundenerBlocker = blockers.find((b) => b.id === blockerZugewiesen.id)
      expect(gefundenerBlocker?.responsibleMembership?.userId).toBe(managerUserId)
      expect(gefundenerBlocker?.cabinetId).toBe(cabinet.id)

      await db.collaborationBlocker.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.collaborationTask.deleteMany({ where: { cabinetId: cabinet.id } })
      await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
    })
  })
})
