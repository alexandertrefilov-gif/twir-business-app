import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// GGA-UMSETZUNG, PRÜFUNG, ABNAHME UND SCHRANKAKTE: Approvals/Blocker mit
// Cabinet-Bezug, der geführte Prüfprozess (find-or-create Checklistenpunkte),
// die erweiterte Control-Tower-Aggregation über mehrere Cabinets in
// unterschiedlichen Zuständen, die erweiterte Historie und die
// Schrankakte-Datenaggregation.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

describe.skipIf(!RUN_INTEGRATION)('GGA-Umsetzung/Prüfung/Abnahme/Schrankakte — Datenbankintegration', () => {
  let db: any
  let cabinetService: typeof import('@/lib/services/gga-cabinet.service')
  let phase2Service: typeof import('@/lib/services/collaboration-phase2.service')
  let schrankakteService: typeof import('@/lib/services/gga-cabinet-schrankakte.service')
  const marker = `GGA-INSP-${Date.now()}-${Math.random().toString(16).slice(2)}`

  let managerUserId = '', managerEmail = ''
  let plannerUserId = '', plannerEmail = ''
  let operatorUserId = '', operatorEmail = ''
  let viewerUserId = '', viewerEmail = ''
  let outsiderUserId = '', outsiderEmail = ''

  let projectAId = '', projectBId = ''
  let stagePlanungId = '', stageUmsetzungId = '', stageAbnahmeId = ''

  function asUser(id: string, email: string) { auth.getServerSession.mockResolvedValue({ user: { id, email, authScope: 'COLLABORATION' } }) }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const mk = async (label: string) => db.user.create({ data: { email: `${marker}-${label}@example.invalid`, passwordHash: 'not-used', firstName: label, lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })

    const manager = await mk('manager'); managerUserId = manager.id; managerEmail = manager.email
    const planner = await mk('planner'); plannerUserId = planner.id; plannerEmail = planner.email
    const operator = await mk('operator'); operatorUserId = operator.id; operatorEmail = operator.email
    const viewer = await mk('viewer'); viewerUserId = viewer.id; viewerEmail = viewer.email
    const outsider = await mk('outsider'); outsiderUserId = outsider.id; outsiderEmail = outsider.email

    const projectA = await db.collaborationProject.create({ data: { projectNumber: `${marker}-A`, name: 'Inspection Test Projekt A', active: true } })
    projectAId = projectA.id
    const projectB = await db.collaborationProject.create({ data: { projectNumber: `${marker}-B`, name: 'Inspection Test Projekt B', active: true } })
    projectBId = projectB.id

    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: plannerUserId, role: 'INTERNAL_PLANNER' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: operatorUserId, role: 'OPERATOR' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: viewerUserId, role: 'COLLAB_VIEWER' } })
    await db.collaborationMembership.create({ data: { projectId: projectBId, userId: outsiderUserId, role: 'COLLAB_MANAGER' } })

    await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'KONZEPT', title: 'Konzept', sequence: 1, weight: 10 } })
    const stagePlanung = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'PLANUNG', title: 'Planung', sequence: 2, weight: 20 } })
    stagePlanungId = stagePlanung.id
    const stageUmsetzung = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'UMSETZUNG', title: 'Umsetzung', sequence: 3, weight: 35 } })
    stageUmsetzungId = stageUmsetzung.id
    const stageAbnahme = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'ABNAHME', title: 'Abnahme', sequence: 4, weight: 25 } })
    stageAbnahmeId = stageAbnahme.id

    cabinetService = await import('@/lib/services/gga-cabinet.service')
    phase2Service = await import('@/lib/services/collaboration-phase2.service')
    schrankakteService = await import('@/lib/services/gga-cabinet-schrankakte.service')
  })

  afterAll(async () => {
    if (!db) return
    const allUserIds = [managerUserId, plannerUserId, operatorUserId, viewerUserId, outsiderUserId].filter(Boolean)
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

  // ── Approval/Blocker mit Cabinet-Bezug ────────────────────────
  it('Freigabe mit Cabinet-Bezug: fremde cabinetId wird abgelehnt', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetA = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-APR`, bezeichnung: 'Für Freigabetest' })
    asUser(outsiderUserId, outsiderEmail)
    const cabinetB = await cabinetService.createGgaCabinet(projectBId, { kennung: `${marker}-APR-B`, bezeichnung: 'Fremdes Cabinet' })

    asUser(plannerUserId, plannerEmail)
    await expect(phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinetB.id)).rejects.toThrow('nicht gefunden')
    const approval = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinetA.id)
    expect(approval.cabinetId).toBe(cabinetA.id)
  })

  it('Ablehnung einer Freigabe erfordert eine Begründung', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-REJ`, bezeichnung: 'Ablehnungstest' })
    const approval = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)
    asUser(managerUserId, managerEmail)
    await expect(phase2Service.decideCollaborationApproval(approval.id, 'REJECTED')).rejects.toThrow('Begründung')
    await phase2Service.decideCollaborationApproval(approval.id, 'REJECTED', 'Ist-Volumenstrom weicht zu stark vom Soll ab')
    const row = await db.collaborationApproval.findUnique({ where: { id: approval.id } })
    expect(row.status).toBe('REJECTED')
  })

  it('unberechtigte Freigabe: OPERATOR kann keine Freigabe entscheiden', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-UNAUTH`, bezeichnung: 'Unautorisierte Freigabe' })
    const approval = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinet.id)
    asUser(operatorUserId, operatorEmail)
    await expect(phase2Service.decideCollaborationApproval(approval.id, 'APPROVED')).rejects.toThrow('Keine Berechtigung')
  })

  it('Mangel-Blocker mit Cabinet-Bezug: fremde cabinetId wird abgelehnt', async () => {
    asUser(outsiderUserId, outsiderEmail)
    const foreignCabinet = await cabinetService.createGgaCabinet(projectBId, { kennung: `${marker}-FOREIGN2`, bezeichnung: 'Fremd' })
    asUser(plannerUserId, plannerEmail)
    await expect(phase2Service.createCollaborationBlocker(projectAId, { title: 'Mangel', stageId: stageAbnahmeId, cabinetId: foreignCabinet.id })).rejects.toThrow('nicht gefunden')
  })

  // ── Geführter Prüfprozess: find-or-create Checklistenpunkt ────
  it('setGgaCabinetInspectionItem legt den Prüfpunkt bei Bedarf an und togglet ihn — nie automatisch bestanden', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-INSP`, bezeichnung: 'Prüfpunkt-Test' })
    const before = await db.collaborationChecklistItem.findFirst({ where: { cabinetId: cabinet.id, title: 'Elektro/VDE geprüft' } })
    expect(before).toBeNull()
    await cabinetService.setGgaCabinetInspectionItem(cabinet.id, 'Elektro/VDE geprüft', true)
    const after = await db.collaborationChecklistItem.findFirst({ where: { cabinetId: cabinet.id, title: 'Elektro/VDE geprüft' } })
    expect(after.completed).toBe(true)
  })

  it('Viewer kann keinen Prüfpunkt verändern', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-INSP2`, bezeichnung: 'Viewer-Test' })
    asUser(viewerUserId, viewerEmail)
    await expect(cabinetService.setGgaCabinetInspectionItem(cabinet.id, 'Ex-Anforderungen erfüllt', true)).rejects.toThrow('Keine Berechtigung')
  })

  // ── Historie über verknüpfte Kindobjekte ──────────────────────
  it('Historie enthält Audit-Einträge von verknüpften Tasks/Checklisten/Blockern/Freigaben', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-HIST`, bezeichnung: 'Historientest' })
    await phase2Service.createCollaborationTask(stagePlanungId, { title: 'Historie-Maßnahme', cabinetId: cabinet.id })
    await cabinetService.setGgaCabinetInspectionItem(cabinet.id, 'Kennzeichnung geprüft', true)
    const history = await cabinetService.getGgaCabinetAuditHistory(cabinet.id)
    expect(history.some((h: any) => h.entityType === 'collaboration_task')).toBe(true)
    expect(history.some((h: any) => h.entityType === 'collaboration_checklist_item')).toBe(true)
    expect(history.some((h: any) => h.entityType === 'gga_cabinet')).toBe(true)
  })

  // ── Schrankakte-Datenaggregation ───────────────────────────────
  it('Schrankakte aggregiert alle Abschnitte A–M ohne Fehler', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-AKTE`, bezeichnung: 'Schrankakte-Test' })
    await phase2Service.createCollaborationTask(stagePlanungId, { title: 'Akte-Maßnahme', cabinetId: cabinet.id })
    const data = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinet.id)
    expect(data.sections.map((s) => s.key)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'])
    expect(data.cabinetLabel).toContain(`${marker}-AKTE`)
  })

  it('Schrankakte lehnt IDOR ab: Nutzer aus Projekt B kann Schrankakte aus Projekt A nicht laden', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-AKTE2`, bezeichnung: 'IDOR-Akte-Test' })
    asUser(outsiderUserId, outsiderEmail)
    await expect(schrankakteService.getGgaCabinetSchrankaktePdfData(cabinet.id)).rejects.toThrow('nicht gefunden')
  })

  // ── Control-Tower über mehrere Cabinets in unterschiedlichen Zuständen ─
  it('Control-Tower-Aggregation zählt Bestandsaufnahme/Planung/Umsetzung/Prüfung/Freigabe/Nacharbeit/Abgeschlossen korrekt über mehrere reale Zustände', async () => {
    asUser(plannerUserId, plannerEmail)
    const ctMarker = `CT-${Date.now().toString(36)}`

    // 1) nur Bestand
    await cabinetService.createGgaCabinet(projectAId, { kennung: `${ctMarker}-BESTAND`, bezeichnung: 'Nur Bestand' })

    // 2) Planung offen (Bestand fertig, keine Planungs-Maßnahmen)
    const ctPlanung = await cabinetService.createGgaCabinet(projectAId, { kennung: `${ctMarker}-PLANUNG`, bezeichnung: 'Planung offen' })
    await cabinetService.updateGgaCabinet(ctPlanung.id, { bestandsaufnahmeAm: new Date() as never })

    // 3) Umsetzung läuft (Planung fertig, Umsetzung offen)
    const ctUmsetzung = await cabinetService.createGgaCabinet(projectAId, { kennung: `${ctMarker}-UMSETZ`, bezeichnung: 'Umsetzung läuft' })
    await cabinetService.updateGgaCabinet(ctUmsetzung.id, { bestandsaufnahmeAm: new Date() as never })
    await phase2Service.createCollaborationTask(stagePlanungId, { title: 'Planung fertig', cabinetId: ctUmsetzung.id })
    await db.collaborationTask.updateMany({ where: { cabinetId: ctUmsetzung.id, stageId: stagePlanungId }, data: { status: 'DONE' } })
    await phase2Service.createCollaborationTask(stageUmsetzungId, { title: 'Montage offen', cabinetId: ctUmsetzung.id })

    // 4) Blocker
    const ctBlocker = await cabinetService.createGgaCabinet(projectAId, { kennung: `${ctMarker}-BLOCKER`, bezeichnung: 'Mit Blocker' })
    await phase2Service.createCollaborationBlocker(projectAId, { title: 'Kritischer Mangel', stageId: stageAbnahmeId, cabinetId: ctBlocker.id })

    // 5) Prüfung offen (Bestand/Planung/Umsetzung fertig, keine Freigabe angefragt)
    const ctPruefung = await cabinetService.createGgaCabinet(projectAId, { kennung: `${ctMarker}-PRUEF`, bezeichnung: 'Prüfung offen' })
    await cabinetService.updateGgaCabinet(ctPruefung.id, { bestandsaufnahmeAm: new Date() as never })
    await phase2Service.createCollaborationTask(stagePlanungId, { title: 'Planung fertig (pruef)', cabinetId: ctPruefung.id })
    await phase2Service.createCollaborationTask(stageUmsetzungId, { title: 'Montage fertig (pruef)', cabinetId: ctPruefung.id })
    await db.collaborationTask.updateMany({ where: { cabinetId: ctPruefung.id }, data: { status: 'DONE' } })

    // 6) Prüfung abgelehnt / Nacharbeit
    const ctNacharbeit = await cabinetService.createGgaCabinet(projectAId, { kennung: `${ctMarker}-NACHARB`, bezeichnung: 'Nacharbeit' })
    await cabinetService.updateGgaCabinet(ctNacharbeit.id, { bestandsaufnahmeAm: new Date() as never })
    await phase2Service.createCollaborationTask(stagePlanungId, { title: 'Planung fertig (nacharbeit)', cabinetId: ctNacharbeit.id })
    await phase2Service.createCollaborationTask(stageUmsetzungId, { title: 'Montage fertig (nacharbeit)', cabinetId: ctNacharbeit.id })
    await db.collaborationTask.updateMany({ where: { cabinetId: ctNacharbeit.id }, data: { status: 'DONE' } })
    const nacharbeitApproval = await phase2Service.requestCollaborationApproval(stageAbnahmeId, ctNacharbeit.id)
    asUser(managerUserId, managerEmail)
    await phase2Service.decideCollaborationApproval(nacharbeitApproval.id, 'REJECTED', 'Volumenstrom nicht erreicht')
    asUser(plannerUserId, plannerEmail)

    // 7) vollständig freigegeben / abgeschlossen
    const ctDone = await cabinetService.createGgaCabinet(projectAId, { kennung: `${ctMarker}-DONE`, bezeichnung: 'Abgeschlossen' })
    await cabinetService.updateGgaCabinet(ctDone.id, { bestandsaufnahmeAm: new Date() as never })
    await phase2Service.createCollaborationTask(stagePlanungId, { title: 'Planung fertig (done)', cabinetId: ctDone.id })
    await phase2Service.createCollaborationTask(stageUmsetzungId, { title: 'Montage fertig (done)', cabinetId: ctDone.id })
    await db.collaborationTask.updateMany({ where: { cabinetId: ctDone.id }, data: { status: 'DONE' } })
    const doneApproval = await phase2Service.requestCollaborationApproval(stageAbnahmeId, ctDone.id)
    asUser(managerUserId, managerEmail)
    await phase2Service.decideCollaborationApproval(doneApproval.id, 'APPROVED', undefined)
    asUser(plannerUserId, plannerEmail)

    const summary = await cabinetService.getGgaCabinetControlTowerSummary(projectAId)
    expect(summary).not.toBeNull()
    expect(summary!.gesamt).toBeGreaterThanOrEqual(8)
    expect(summary!.bestandsaufnahmeOffen).toBeGreaterThanOrEqual(1)
    expect(summary!.mitBlocker).toBeGreaterThanOrEqual(1)
    expect(summary!.nacharbeitErforderlich).toBeGreaterThanOrEqual(1)
    expect(summary!.abgeschlossen).toBeGreaterThanOrEqual(1)
    const doneEntry = summary!.cabinets.find((c: any) => c.id === ctDone.id)
    expect(doneEntry?.lifecycleStage).toBe('ABGESCHLOSSEN')
    const nacharbeitEntry = summary!.cabinets.find((c: any) => c.id === ctNacharbeit.id)
    expect(nacharbeitEntry?.lifecycleStage).toBe('PRUEFUNG_ABNAHME')
  })
})
