import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// GGA-Betreiberportal und externe Freigabeprozesse: Dokument-Sichtbarkeit,
// echte typisierte Betreiberfreigabe (OPERATOR_ACCEPTANCE), Checklisten-
// Synchronisation, Concurrency-Schutz und die vollständige Security-Matrix
// (A1–A10, D1–D8) gegen eine echte Test-DB.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

describe.skipIf(!RUN_INTEGRATION)('GGA-Betreiberportal — Datenbankintegration', () => {
  let db: any
  let cabinetService: typeof import('@/lib/services/gga-cabinet.service')
  let phase2Service: typeof import('@/lib/services/collaboration-phase2.service')
  let documentService: typeof import('@/lib/services/collaboration-document.service')
  let schrankakteService: typeof import('@/lib/services/gga-cabinet-schrankakte.service')
  const marker = `GGA-OP-${Date.now().toString(36)}`

  let managerUserId = '', managerEmail = ''
  let plannerUserId = '', plannerEmail = ''
  let operatorUserId = '', operatorEmail = ''
  let viewerUserId = '', viewerEmail = ''
  let outsiderOperatorUserId = '', outsiderOperatorEmail = ''

  let projectAId = '', projectBId = ''
  let stagePlanungId = '', stageUmsetzungId = '', stageAbnahmeId = ''
  let cabinetId = ''

  function asUser(id: string, email: string) { auth.getServerSession.mockResolvedValue({ user: { id, email, authScope: 'COLLABORATION' } }) }

  async function bringCabinetToInternalBestanden(cid: string) {
    await phase2Service.createCollaborationTask(stagePlanungId, { title: 'Planung fertig', cabinetId: cid })
    await phase2Service.createCollaborationTask(stageUmsetzungId, { title: 'Montage fertig', cabinetId: cid })
    await db.collaborationTask.updateMany({ where: { cabinetId: cid }, data: { status: 'DONE' } })
    // REQ-015.1: requestCollaborationApproval() verlangt seit REQ-015
    // serverseitig eine vollständige ABNAHME-Checkliste
    // (ggaCabinetBereitFuerInterneFreigabe) — vorher genügte hier die reine
    // Existenz der ABNAHME-Stage. Ausschließlich über die bestehende
    // produktive setGgaCabinetInspectionItem()-Funktion hergestellt, keine
    // direkte DB-Manipulation. Aufrufer ist an dieser Stelle immer bereits
    // als plannerUserId (INTERNAL_PLANNER, editorRoles) angemeldet.
    for (const title of cabinetService.GGA_CABINET_CHECKLIST_TEMPLATES.ABNAHME.items) {
      await cabinetService.setGgaCabinetInspectionItem(cid, title, true)
    }
    const internalApproval = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cid)
    asUser(managerUserId, managerEmail)
    await phase2Service.decideCollaborationApproval(internalApproval.id, 'APPROVED')
    asUser(plannerUserId, plannerEmail)
  }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const mk = async (label: string) => db.user.create({ data: { email: `${marker}-${label}@example.invalid`, passwordHash: 'not-used', firstName: label, lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })

    const manager = await mk('manager'); managerUserId = manager.id; managerEmail = manager.email
    const planner = await mk('planner'); plannerUserId = planner.id; plannerEmail = planner.email
    const operator = await mk('operator'); operatorUserId = operator.id; operatorEmail = operator.email
    const viewer = await mk('viewer'); viewerUserId = viewer.id; viewerEmail = viewer.email
    const outsiderOperator = await mk('outop'); outsiderOperatorUserId = outsiderOperator.id; outsiderOperatorEmail = outsiderOperator.email

    const projectA = await db.collaborationProject.create({ data: { projectNumber: `${marker}-A`, name: 'Operator Portal Test A', active: true } })
    projectAId = projectA.id
    const projectB = await db.collaborationProject.create({ data: { projectNumber: `${marker}-B`, name: 'Operator Portal Test B', active: true } })
    projectBId = projectB.id

    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: plannerUserId, role: 'INTERNAL_PLANNER' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: operatorUserId, role: 'OPERATOR' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: viewerUserId, role: 'COLLAB_VIEWER' } })
    await db.collaborationMembership.create({ data: { projectId: projectBId, userId: outsiderOperatorUserId, role: 'OPERATOR' } })
    await db.collaborationMembership.create({ data: { projectId: projectBId, userId: managerUserId, role: 'COLLAB_MANAGER' } })

    await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'KONZEPT', title: 'Konzept', sequence: 1, weight: 10 } })
    const stagePlanung = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'PLANUNG', title: 'Planung', sequence: 2, weight: 20 } })
    stagePlanungId = stagePlanung.id
    const stageUmsetzung = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'UMSETZUNG', title: 'Umsetzung', sequence: 3, weight: 35 } })
    stageUmsetzungId = stageUmsetzung.id
    const stageAbnahme = await db.collaborationProjectStage.create({ data: { projectId: projectAId, code: 'ABNAHME', title: 'Abnahme', sequence: 4, weight: 25 } })
    stageAbnahmeId = stageAbnahme.id
    await db.collaborationProjectStage.create({ data: { projectId: projectBId, code: 'ABNAHME', title: 'Abnahme', sequence: 1, weight: 25 } })

    cabinetService = await import('@/lib/services/gga-cabinet.service')
    phase2Service = await import('@/lib/services/collaboration-phase2.service')
    documentService = await import('@/lib/services/collaboration-document.service')
    schrankakteService = await import('@/lib/services/gga-cabinet-schrankakte.service')

    asUser(plannerUserId, plannerEmail)
    const cabinet = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-001`, bezeichnung: 'Operator Portal Cabinet' })
    cabinetId = cabinet.id
    await cabinetService.updateGgaCabinet(cabinetId, { bestandsaufnahmeAm: new Date() as never })
  })

  afterAll(async () => {
    if (!db) return
    const allUserIds = [managerUserId, plannerUserId, operatorUserId, viewerUserId, outsiderOperatorUserId].filter(Boolean)
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

  // ── Vorbereitung: Cabinet bis zur internen BESTANDEN-Prüfung bringen ──
  it('Vorbereitung: Cabinet erreicht internes BESTANDEN, Betreiberfreigabe ist danach anforderbar', async () => {
    asUser(plannerUserId, plannerEmail)
    await bringCabinetToInternalBestanden(cabinetId)
    const detail = await cabinetService.getGgaCabinetDetail(cabinetId)
    expect(detail.status.pruefstatus).toBe('BESTANDEN')
    expect(detail.status.betreiberstatus).toBe('NICHT_ANGEFORDERT')
    expect(detail.status.lifecycleStage).toBe('ABGESCHLOSSEN') // ohne angeforderte Betreiberfreigabe reicht das interne BESTANDEN
  })

  // ── A1–A10: Approval-Security ─────────────────────────────────
  let operatorApprovalId = ''

  it('A1: OPERATOR entscheidet die eigene OPERATOR_ACCEPTANCE — erlaubt, blockiert danach den Abschluss nicht mehr sofort', async () => {
    asUser(plannerUserId, plannerEmail)
    const approval = await cabinetService.requestGgaCabinetOperatorApproval(cabinetId)
    operatorApprovalId = approval.id
    const detailAfterRequest = await cabinetService.getGgaCabinetDetail(cabinetId)
    expect(detailAfterRequest.status.betreiberstatus).toBe('AUSSTEHEND')
    expect(detailAfterRequest.status.lifecycleStage).toBe('PRUEFUNG_ABNAHME') // technisch fertig != Betreiberfreigabe erteilt

    asUser(operatorUserId, operatorEmail)
    const decided = await cabinetService.decideGgaCabinetOperatorApproval(operatorApprovalId, { decision: 'APPROVED', unterlagenGeprueft: true, decisionNote: 'Alles geprüft' })
    expect(decided.status).toBe('APPROVED')

    const detail = await cabinetService.getGgaCabinetDetail(cabinetId)
    expect(detail.status.betreiberstatus).toBe('ERTEILT')
    expect(detail.status.lifecycleStage).toBe('ABGESCHLOSSEN')
  })

  it('A2: OPERATOR kann kein INTERNAL-Approval über den Operator-Entrypoint entscheiden', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet2 = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-A2`, bezeichnung: 'A2' })
    await cabinetService.updateGgaCabinet(cabinet2.id, { bestandsaufnahmeAm: new Date() as never })
    await bringCabinetToInternalBestanden(cabinet2.id)
    const internalApproval = await db.collaborationApproval.findFirst({ where: { cabinetId: cabinet2.id, approvalType: 'INTERNAL' } })

    asUser(operatorUserId, operatorEmail)
    await expect(cabinetService.decideGgaCabinetOperatorApproval(internalApproval.id, { decision: 'APPROVED', unterlagenGeprueft: true })).rejects.toThrow('nicht gefunden')
  })

  it('A3/A9: OPERATOR eines fremden Projekts kann eine Betreiberfreigabe nicht entscheiden', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet3 = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-A3`, bezeichnung: 'A3' })
    await cabinetService.updateGgaCabinet(cabinet3.id, { bestandsaufnahmeAm: new Date() as never })
    await bringCabinetToInternalBestanden(cabinet3.id)
    const approval = await cabinetService.requestGgaCabinetOperatorApproval(cabinet3.id)

    asUser(outsiderOperatorUserId, outsiderOperatorEmail)
    await expect(cabinetService.decideGgaCabinetOperatorApproval(approval.id, { decision: 'APPROVED', unterlagenGeprueft: true })).rejects.toThrow('nicht gefunden')
  })

  it('A4: eine OPERATOR_ACCEPTANCE ohne cabinetId wird über den Operator-Entrypoint abgelehnt', async () => {
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const orphanApproval = await db.collaborationApproval.create({ data: { projectId: projectAId, stageId: stageAbnahmeId, approvalType: 'OPERATOR_ACCEPTANCE', status: 'REQUESTED', requestedById: plannerUserId } })
    asUser(operatorUserId, operatorEmail)
    await expect(cabinetService.decideGgaCabinetOperatorApproval(orphanApproval.id, { decision: 'APPROVED', unterlagenGeprueft: true })).rejects.toThrow('nicht gefunden')
    await db.collaborationApproval.delete({ where: { id: orphanApproval.id } })
    void role
  })

  it('A5: APPROVED ohne "Unterlagen geprüft" wird abgelehnt', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet5 = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-A5`, bezeichnung: 'A5' })
    await cabinetService.updateGgaCabinet(cabinet5.id, { bestandsaufnahmeAm: new Date() as never })
    await bringCabinetToInternalBestanden(cabinet5.id)
    const approval = await cabinetService.requestGgaCabinetOperatorApproval(cabinet5.id)
    asUser(operatorUserId, operatorEmail)
    await expect(cabinetService.decideGgaCabinetOperatorApproval(approval.id, { decision: 'APPROVED', unterlagenGeprueft: false })).rejects.toThrow('bereitgestellten Unterlagen geprüft')
  })

  it('A6: REJECTED ohne Begründung wird abgelehnt (auch bei reiner Whitespace-Begründung)', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet6 = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-A6`, bezeichnung: 'A6' })
    await cabinetService.updateGgaCabinet(cabinet6.id, { bestandsaufnahmeAm: new Date() as never })
    await bringCabinetToInternalBestanden(cabinet6.id)
    const approval = await cabinetService.requestGgaCabinetOperatorApproval(cabinet6.id)
    asUser(operatorUserId, operatorEmail)
    await expect(cabinetService.decideGgaCabinetOperatorApproval(approval.id, { decision: 'REJECTED' })).rejects.toThrow('Begründung')
    await expect(cabinetService.decideGgaCabinetOperatorApproval(approval.id, { decision: 'REJECTED', decisionNote: '   ' })).rejects.toThrow('Begründung')
  })

  it('A7: eine bereits entschiedene Approval-Zeile kann nicht erneut verändert werden', async () => {
    asUser(operatorUserId, operatorEmail)
    await expect(cabinetService.decideGgaCabinetOperatorApproval(operatorApprovalId, { decision: 'APPROVED', unterlagenGeprueft: true })).rejects.toThrow('bereits entschieden')
    await expect(cabinetService.decideGgaCabinetOperatorApproval(operatorApprovalId, { decision: 'REJECTED', decisionNote: 'Versuch' })).rejects.toThrow('bereits entschieden')
  })

  it('A8: eine neue Freigaberunde erzeugt eine neue Zeile — die alte bleibt unverändert (append-only, vollständige Historie)', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet8 = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-A8`, bezeichnung: 'A8' })
    await cabinetService.updateGgaCabinet(cabinet8.id, { bestandsaufnahmeAm: new Date() as never })
    await bringCabinetToInternalBestanden(cabinet8.id)
    const firstApproval = await cabinetService.requestGgaCabinetOperatorApproval(cabinet8.id)
    asUser(operatorUserId, operatorEmail)
    await cabinetService.decideGgaCabinetOperatorApproval(firstApproval.id, { decision: 'REJECTED', decisionNote: 'Kennzeichnung fehlt' })

    asUser(plannerUserId, plannerEmail)
    const secondApproval = await cabinetService.requestGgaCabinetOperatorApproval(cabinet8.id)
    expect(secondApproval.id).not.toBe(firstApproval.id)

    const firstRow = await db.collaborationApproval.findUnique({ where: { id: firstApproval.id } })
    expect(firstRow.status).toBe('REJECTED')
    expect(firstRow.decisionNote).toBe('Kennzeichnung fehlt')
    const allForCabinet = await db.collaborationApproval.findMany({ where: { cabinetId: cabinet8.id, approvalType: 'OPERATOR_ACCEPTANCE' } })
    expect(allForCabinet).toHaveLength(2)
  })

  it('A10: COLLAB_VIEWER kann keine Betreiberfreigabe entscheiden', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinet10 = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-A10`, bezeichnung: 'A10' })
    await cabinetService.updateGgaCabinet(cabinet10.id, { bestandsaufnahmeAm: new Date() as never })
    await bringCabinetToInternalBestanden(cabinet10.id)
    const approval = await cabinetService.requestGgaCabinetOperatorApproval(cabinet10.id)
    asUser(viewerUserId, viewerEmail)
    // Viewer ist Projektmitglied (anders als bei den A3/A9/D2-Fällen), hat aber
    // nicht die Rolle OPERATOR — korrekt 403 statt 404.
    await expect(cabinetService.decideGgaCabinetOperatorApproval(approval.id, { decision: 'APPROVED', unterlagenGeprueft: true })).rejects.toThrow('Keine Berechtigung')
  })

  // ── Concurrency ───────────────────────────────────────────────
  it('Concurrency: eine zweite offene Betreiberfreigabe für dasselbe Cabinet wird abgelehnt', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetC = await cabinetService.createGgaCabinet(projectAId, { kennung: `${marker}-CONC`, bezeichnung: 'Concurrency' })
    await cabinetService.updateGgaCabinet(cabinetC.id, { bestandsaufnahmeAm: new Date() as never })
    await bringCabinetToInternalBestanden(cabinetC.id)
    await cabinetService.requestGgaCabinetOperatorApproval(cabinetC.id)
    await expect(cabinetService.requestGgaCabinetOperatorApproval(cabinetC.id)).rejects.toThrow('bereits eine offene Betreiberfreigabe')
    // Race-Schutz auch auf DB-Ebene: direkter zweiter Insert unter Umgehung des Vorab-Checks
    const dup = db.collaborationApproval.create({ data: { projectId: projectAId, stageId: stageAbnahmeId, cabinetId: cabinetC.id, approvalType: 'OPERATOR_ACCEPTANCE', status: 'REQUESTED', requestedById: plannerUserId } })
    await expect(dup).rejects.toThrow()
  })

  // ── Checklisten-Synchronisation ────────────────────────────────
  it('Checklistenpunkt "Betreiberfreigabe erforderlich/geklärt" wird automatisch synchronisiert und kann nicht manuell gesetzt werden', async () => {
    const item = await db.collaborationChecklistItem.findFirst({ where: { cabinetId, title: 'Betreiberfreigabe erforderlich/geklärt' } })
    expect(item).not.toBeNull()
    expect(item.completed).toBe(true) // A1 hat die Freigabe bereits erteilt

    asUser(plannerUserId, plannerEmail)
    await expect(phase2Service.setCollaborationChecklistCompleted(item.id, false)).rejects.toThrow('automatisch aus der Betreiberfreigabe abgeleitet')
  })

  // ── D1–D8: Dokument-Security ───────────────────────────────────
  let internalDocId = '', externalDocId = ''

  it('legt ein INTERNAL- und ein EXTERNAL-Dokument an (Testdaten)', async () => {
    asUser(plannerUserId, plannerEmail)
    const internalDoc = await documentService.uploadCollaborationDocument({ projectId: projectAId, cabinetId, documentKind: 'Sonstiges', originalName: 'internes-notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('intern') })
    internalDocId = internalDoc.id
    expect(internalDoc.visibility).toBe('INTERNAL')

    const externalDoc = await documentService.uploadCollaborationDocument({ projectId: projectAId, cabinetId, documentKind: 'Pruefbericht', originalName: 'pruefbericht.pdf', mimeType: 'application/pdf', buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) })
    await documentService.setCollaborationDocumentVisibility(externalDoc.id, 'EXTERNAL')
    externalDocId = externalDoc.id
    const reloaded = await db.collaborationDocument.findUnique({ where: { id: externalDocId } })
    expect(reloaded.visibility).toBe('EXTERNAL')
  })

  it('D3/D4: OPERATOR und COLLAB_VIEWER können die Dokumentsichtbarkeit nicht ändern', async () => {
    asUser(operatorUserId, operatorEmail)
    await expect(documentService.setCollaborationDocumentVisibility(internalDocId, 'EXTERNAL')).rejects.toThrow('Keine Berechtigung')
    asUser(viewerUserId, viewerEmail)
    await expect(documentService.setCollaborationDocumentVisibility(internalDocId, 'EXTERNAL')).rejects.toThrow('Keine Berechtigung')
  })

  it('D1/D5: direkter Download eines INTERNAL-Dokuments durch OPERATOR wird abgelehnt', async () => {
    asUser(operatorUserId, operatorEmail)
    await expect(documentService.getCollaborationDocumentForDownload(internalDocId)).rejects.toThrow('nicht gefunden')
  })

  it('OPERATOR kann ein EXTERNAL-Dokument im eigenen Projekt herunterladen', async () => {
    asUser(operatorUserId, operatorEmail)
    const doc = await documentService.getCollaborationDocumentForDownload(externalDocId)
    expect(doc.id).toBe(externalDocId)
  })

  it('D2: OPERATOR eines fremden Projekts kann ein EXTERNAL-Dokument nicht laden (IDOR)', async () => {
    asUser(outsiderOperatorUserId, outsiderOperatorEmail)
    await expect(documentService.getCollaborationDocumentForDownload(externalDocId)).rejects.toThrow('nicht gefunden')
  })

  it('D6: die externe Dokumentliste enthält kein INTERNAL-Dokument', async () => {
    asUser(operatorUserId, operatorEmail)
    const list = await documentService.listCollaborationDocuments({ projectId: projectAId, cabinetId })
    expect(list.some((d) => d.id === internalDocId)).toBe(false)
    expect(list.some((d) => d.id === externalDocId)).toBe(true)
  })

  it('interne Rollen sehen weiterhin alle Dokumente (INTERNAL und EXTERNAL)', async () => {
    asUser(plannerUserId, plannerEmail)
    const list = await documentService.listCollaborationDocuments({ projectId: projectAId, cabinetId })
    expect(list.some((d) => d.id === internalDocId)).toBe(true)
    expect(list.some((d) => d.id === externalDocId)).toBe(true)
  })

  // ── D7/D8: Externe Schrankakte ─────────────────────────────────
  it('D7: die externe Schrankakte enthält kein INTERNAL-Dokument', async () => {
    asUser(operatorUserId, operatorEmail)
    const data = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetId, 'OPERATOR')
    const docSection = data.sections.find((s) => s.key === 'M')!
    expect(docSection.rows.some((r) => r.label === 'internes-notiz.txt')).toBe(false)
    expect(docSection.rows.some((r) => r.label === 'pruefbericht.pdf')).toBe(true)
  })

  it('D8: die externe Schrankakte enthält keine internen E-Mail-Adressen, nur Anzeigenamen', async () => {
    asUser(operatorUserId, operatorEmail)
    const data = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetId, 'OPERATOR')
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('@example.invalid')
    // interne Abschnitte (Maßnahmen/Umsetzung/Mängel) dürfen für den Betreiber gar nicht erst enthalten sein
    expect(data.sections.some((s) => s.key === 'G' || s.key === 'H' || s.key === 'L')).toBe(false)
  })

  it('die interne Schrankakte (audience=INTERNAL) enthält weiterhin alle Abschnitte inkl. Maßnahmen', async () => {
    asUser(plannerUserId, plannerEmail)
    const data = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetId, 'INTERNAL')
    expect(data.sections.some((s) => s.key === 'G')).toBe(true)
    const docSection = data.sections.find((s) => s.key === 'M')!
    expect(docSection.rows.some((r) => r.label === 'internes-notiz.txt')).toBe(true)
  })

  // ── REQ-015.2: Betreiber-Schrankakte — Audit-Historie-Zugriffsfehler ────
  // getGgaCabinetSchrankaktePdfData() rief bislang unbedingt die interne
  // getGgaCabinetAuditHistory() auf, die OPERATOR generell ausschloss — ein
  // berechtigter Betreiber konnte seine eigene Schrankakte dadurch nie laden
  // (D7/D8 scheiterten deshalb bereits am Zugriff, nicht erst an der
  // Filterung). Seit REQ-015.2 kennt getGgaCabinetAuditHistory() ein eigenes
  // audience-Argument und filtert selbst — siehe gga-cabinet.service.ts.
  it('T1: berechtigter OPERATOR kann seine eigene Betreiber-Schrankakte laden', async () => {
    asUser(operatorUserId, operatorEmail)
    const data = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetId, 'OPERATOR')
    expect(data.cabinetLabel).toContain(`${marker}-001`)
  })

  it('T2: OPERATOR eines fremden Projekts kann die Betreiber-Schrankakte nicht laden (IDOR)', async () => {
    asUser(outsiderOperatorUserId, outsiderOperatorEmail)
    await expect(schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetId, 'OPERATOR')).rejects.toThrow('nicht gefunden')
  })

  it('T3: interner Benutzer (audience=INTERNAL) erhält weiterhin die vollständige, ungefilterte Historie', async () => {
    asUser(plannerUserId, plannerEmail)
    const history = await cabinetService.getGgaCabinetAuditHistory(cabinetId)
    expect(history.some((h: any) => h.entityType === 'gga_cabinet')).toBe(true)
    expect(history.length).toBeGreaterThan(0)
  })

  it('T4: die audience=OPERATOR-Historie enthält keine internen Cabinet-/Task-/Blocker-Einträge', async () => {
    asUser(operatorUserId, operatorEmail)
    const history = await cabinetService.getGgaCabinetAuditHistory(cabinetId, 'OPERATOR')
    expect(history.every((h: any) => h.entityType !== 'gga_cabinet')).toBe(true)
    expect(history.every((h: any) => h.entityType !== 'collaboration_task')).toBe(true)
    expect(history.every((h: any) => h.entityType !== 'collaboration_blocker')).toBe(true)
  })

  it('T5a: ein OPERATOR kann sich durch direkten audience=INTERNAL-Aufruf keine interne Sicht erschleichen', async () => {
    asUser(operatorUserId, operatorEmail)
    await expect(cabinetService.getGgaCabinetAuditHistory(cabinetId, 'INTERNAL')).rejects.toThrow('Keine Berechtigung')
    await expect(schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetId, 'INTERNAL')).rejects.toThrow('Keine Berechtigung')
  })

  it('T5b: ein interner Nutzer, der bewusst audience=OPERATOR anfordert (Vorschau), erhält exakt dieselbe gefilterte Sicht wie ein echter Betreiber', async () => {
    asUser(plannerUserId, plannerEmail)
    const previewAsInternal = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetId, 'OPERATOR')
    asUser(operatorUserId, operatorEmail)
    const realOperatorView = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetId, 'OPERATOR')
    expect(previewAsInternal.sections.map((s) => s.key)).toEqual(realOperatorView.sections.map((s) => s.key))
    expect(previewAsInternal.sections.some((s) => s.key === 'G' || s.key === 'H' || s.key === 'L')).toBe(false)
  })
})
