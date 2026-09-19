import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Diese Tests prüfen die reale Transaktion der Stage-Überführung, die
// DB-Constraints der Stage-Dependencies und die abgeleitete Aktivitäten-
// Sicht — bewusst gegen eine echte Test-DB statt gegen den globalen Mock,
// da mehrschrittige Transaktionen (löschen + neu anlegen + Abhängigkeiten
// verketten + Audit) sonst nicht ehrlich geprüft werden können.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

describe.skipIf(!RUN_INTEGRATION)('GGA-Stage-Überführung und abgeleitete Sichten — Datenbankintegration', () => {
  let db: any
  let services: typeof import('@/lib/services/collaboration-phase2.service')
  let cabinetService: typeof import('@/lib/services/gga-cabinet.service')
  const marker = `GGA-${Date.now()}-${Math.random().toString(16).slice(2)}`

  let managerUserId = ''
  let managerEmail = ''
  let memberUserId = ''
  let memberEmail = ''
  let collabProjectId = ''
  let stageAId = ''
  let stageBId = ''

  function asManager() { auth.getServerSession.mockResolvedValue({ user: { id: managerUserId, email: managerEmail, authScope: 'COLLABORATION' } }) }
  function asMember() { auth.getServerSession.mockResolvedValue({ user: { id: memberUserId, email: memberEmail, authScope: 'COLLABORATION' } }) }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const managerUser = await db.user.create({ data: { email: `${marker}-manager@example.invalid`, passwordHash: 'not-used', firstName: 'Manager', lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
    managerUserId = managerUser.id
    managerEmail = managerUser.email
    const memberUser = await db.user.create({ data: { email: `${marker}-member@example.invalid`, passwordHash: 'not-used', firstName: 'Member', lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
    memberUserId = memberUser.id
    memberEmail = memberUser.email

    const collabProject = await db.collaborationProject.create({ data: { projectNumber: `${marker}-CP`, name: 'GGA Restructure Test', active: true } })
    collabProjectId = collabProject.id
    await db.collaborationMembership.create({ data: { projectId: collabProjectId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    await db.collaborationMembership.create({ data: { projectId: collabProjectId, userId: memberUserId, role: 'COLLAB_MEMBER' } })

    const stageA = await db.collaborationProjectStage.create({ data: { projectId: collabProjectId, code: 'A', title: 'Alt-Phase A', sequence: 1, weight: 50 } })
    stageAId = stageA.id
    const stageB = await db.collaborationProjectStage.create({ data: { projectId: collabProjectId, code: 'B', title: 'Alt-Phase B', sequence: 2, weight: 50 } })
    stageBId = stageB.id

    services = await import('@/lib/services/collaboration-phase2.service')
    cabinetService = await import('@/lib/services/gga-cabinet.service')
  })

  afterAll(async () => {
    if (!db) return
    await db.auditLog.deleteMany({ where: { userId: { in: [managerUserId, memberUserId].filter(Boolean) } } })
    if (collabProjectId) await db.collaborationMembership.deleteMany({ where: { projectId: collabProjectId } })
    if (collabProjectId) await db.collaborationProject.deleteMany({ where: { id: collabProjectId } })
    await db.user.deleteMany({ where: { id: { in: [managerUserId, memberUserId].filter(Boolean) } } })
    await db.$disconnect()
  })

  it('lehnt die Überführung für Nicht-Manager ab', async () => {
    asMember()
    await expect(services.restructureCollaborationProjectStages(collabProjectId, [...services.GGA_FIVE_PHASE_PLAN])).rejects.toThrow('Keine Berechtigung')
    await expect(db.collaborationProjectStage.count({ where: { projectId: collabProjectId } })).resolves.toBe(2)
  })

  it('bricht die Überführung ab, wenn eine bestehende Phase bereits eine Aufgabe besitzt', async () => {
    asManager()
    const task = await db.collaborationTask.create({ data: { projectId: collabProjectId, stageId: stageAId, title: 'Bestehende Aufgabe' } })
    await expect(services.restructureCollaborationProjectStages(collabProjectId, [...services.GGA_FIVE_PHASE_PLAN])).rejects.toThrow('besitzen bereits')
    await expect(db.collaborationProjectStage.count({ where: { projectId: collabProjectId } })).resolves.toBe(2)
    await db.collaborationTask.deleteMany({ where: { id: task.id } })
  })

  it('überführt 2 leere Alt-Phasen kontrolliert auf die 5 GGA-Hauptphasen', async () => {
    asManager()
    const created = await services.restructureCollaborationProjectStages(collabProjectId, [...services.GGA_FIVE_PHASE_PLAN])
    expect(created).toHaveLength(5)

    const stages = await db.collaborationProjectStage.findMany({ where: { projectId: collabProjectId }, orderBy: { sequence: 'asc' }, select: { code: true, title: true, sequence: true, weight: true, requiresApproval: true } })
    expect(stages.map((stage: any) => stage.code)).toEqual(['KONZEPT', 'PLANUNG', 'UMSETZUNG', 'ABNAHME', 'ABSCHLUSS'])
    expect(stages.reduce((sum: number, stage: any) => sum + Number(stage.weight), 0)).toBe(100)

    const dependencies = await db.collaborationProjectStageDependency.findMany({ where: { stage: { projectId: collabProjectId } } })
    expect(dependencies).toHaveLength(4)

    const auditEntry = await db.auditLog.findFirst({ where: { entityType: 'collaboration_project', entityId: collabProjectId, action: 'UPDATE' }, orderBy: { createdAt: 'desc' } })
    expect(auditEntry).toBeTruthy()
    expect(auditEntry.newValue.stages.map((stage: any) => stage.code)).toEqual(['KONZEPT', 'PLANUNG', 'UMSETZUNG', 'ABNAHME', 'ABSCHLUSS'])
  })

  // GGA-05.1 T2/T3: das Restructure-Ergebnis (Test oben, "überführt 2 leere
  // Alt-Phasen...") bestätigt bereits die exakten 5 kanonischen Codes in
  // Reihenfolge (T2). Dieser Test bestätigt zusätzlich T3 — dass der GGA-
  // Cabinet-Workflow jede der fünf resultierenden Phasen tatsächlich
  // auflösen kann, ohne einen BusinessRuleError wegen eines unbekannten
  // Stage-Codes. Vor GGA-05.1 hätte ein Projekt mit den (damaligen) Seed-
  // Codes PLANUNG/AUSFUEHRUNG/UEBERGABE hier an mehreren Stellen geworfen.
  it('T2/T3) nach der Überführung auf die 5 GGA-Hauptphasen kann der Cabinet-Workflow jede Phase auflösen — keine BusinessRuleError wegen unbekannter Stage-Codes', async () => {
    asManager()
    const cabinet = await cabinetService.createGgaCabinet(collabProjectId, { kennung: `${marker}-T3`, bezeichnung: 'GGA-05.1-Kompatibilitätstest' })

    await expect(cabinetService.applyGgaCabinetChecklistTemplate(cabinet.id, 'BESTANDSAUFNAHME')).resolves.not.toThrow()
    await expect(cabinetService.applyGgaCabinetChecklistTemplate(cabinet.id, 'PLANUNG')).resolves.not.toThrow()
    await expect(cabinetService.applyGgaCabinetChecklistTemplate(cabinet.id, 'ABNAHME')).resolves.not.toThrow()

    await expect(cabinetService.setGgaCabinetInspectionItem(cabinet.id, 'Elektro/VDE geprüft', true)).resolves.not.toThrow()
    await expect(cabinetService.getGgaCabinetProjectWorklist(collabProjectId)).resolves.not.toThrow()

    // REQ-015 / GGA-05.2: requestGgaCabinetOperatorApproval() ist inzwischen
    // serverseitig an eine bereits bestandene interne Prüfung gekoppelt
    // (vorher nur UI-Gate) — dieser bereits bestehende Test muss diese
    // Voraussetzung jetzt real herstellen (restliche ABNAHME-Pflichtpunkte
    // abhaken, interne Freigabe anfordern + genehmigen), statt sie (wie vor
    // REQ-015 möglich) zu überspringen. Der eigentliche Testzweck — der GGA-
    // Cabinet-Workflow kann jede der 5 kanonischen Phasen auflösen, keine
    // BusinessRuleError wegen unbekannter Stage-Codes — bleibt unverändert.
    for (const title of cabinetService.GGA_CABINET_CHECKLIST_TEMPLATES.ABNAHME.items) {
      await cabinetService.setGgaCabinetInspectionItem(cabinet.id, title, true)
    }
    const abnahmeStage = await db.collaborationProjectStage.findFirstOrThrow({ where: { projectId: collabProjectId, code: 'ABNAHME' } })
    const internal = await services.requestCollaborationApproval(abnahmeStage.id, cabinet.id)
    await services.decideCollaborationApproval(internal.id, 'APPROVED')
    await expect(cabinetService.requestGgaCabinetOperatorApproval(cabinet.id)).resolves.not.toThrow()

    const checklistCount = await db.collaborationChecklistItem.count({ where: { cabinetId: cabinet.id } })
    expect(checklistCount).toBe(8 + 6 + 8) // BESTANDSAUFNAHME + PLANUNG + ABNAHME-Vorlage, vollständig angelegt

    await db.collaborationApproval.deleteMany({ where: { cabinetId: cabinet.id } })
    await db.collaborationChecklistItem.deleteMany({ where: { cabinetId: cabinet.id } })
    await db.ggaCabinet.deleteMany({ where: { id: cabinet.id } })
  })

  it('leitet „Letzte Aktivitäten“ korrekt aus abgeschlossenen Objekten ab, sortiert nach Zeitpunkt', async () => {
    asManager()
    const stage = await db.collaborationProjectStage.findFirstOrThrow({ where: { projectId: collabProjectId, code: 'KONZEPT' } })
    const task = await db.collaborationTask.create({ data: { projectId: collabProjectId, stageId: stage.id, title: 'Aktivitäts-Aufgabe', status: 'DONE', completedAt: new Date(Date.now() - 1000) } })
    const checklistItem = await db.collaborationChecklistItem.create({ data: { projectId: collabProjectId, stageId: stage.id, title: 'Aktivitäts-Check', completed: true, completedAt: new Date() } })

    const activity = await services.getRecentCollaborationActivity(collabProjectId)
    const labels = activity.map((event) => event.label)
    expect(labels).toContain('Checklistenpunkt „Aktivitäts-Check“ erledigt')
    expect(labels).toContain('Aufgabe „Aktivitäts-Aufgabe“ erledigt')
    expect(activity[0].id).toBe(`check-${checklistItem.id}`)

    await db.collaborationChecklistItem.deleteMany({ where: { id: checklistItem.id } })
    await db.collaborationTask.deleteMany({ where: { id: task.id } })
  })

  it('beschränkt Checklisten-/Blocker-/Team-Sichten auf Projekte des angemeldeten Benutzers', async () => {
    const otherProject = await db.collaborationProject.create({ data: { projectNumber: `${marker}-OTHER`, name: 'Fremdes Projekt', active: true } })
    const otherStage = await db.collaborationProjectStage.create({ data: { projectId: otherProject.id, code: 'X', title: 'Fremd-Phase', sequence: 1, weight: 100 } })
    const otherChecklistItem = await db.collaborationChecklistItem.create({ data: { projectId: otherProject.id, stageId: otherStage.id, title: 'Fremder Punkt' } })

    asManager()
    const visibleChecklists = await services.getVisibleCollaborationChecklistItems()
    expect(visibleChecklists.some((item) => item.id === otherChecklistItem.id)).toBe(false)

    const visibleTeam = await services.getVisibleCollaborationMemberships()
    expect(visibleTeam.every((membership) => membership.projectId === collabProjectId)).toBe(true)

    await db.collaborationProject.deleteMany({ where: { id: otherProject.id } })
  })

  // ── REQ-016: Projektabschluss ──────────────────────────────────────────
  // Eigenes, isoliertes Projekt statt Wiederverwendung von collabProjectId,
  // da dessen Zustand von der Ausführungsreihenfolge vorheriger Tests in
  // dieser Datei abhängt (Restructure auf 5 GGA-Phasen etc.) — Statusüber-
  // gänge sollen hier unabhängig davon präzise geprüft werden können.
  describe('REQ-016: Projektabschluss-Workflow', () => {
    let statusProjectId = ''
    let statusStageId = ''

    beforeAll(async () => {
      const project = await db.collaborationProject.create({ data: { projectNumber: `${marker}-STATUS`, name: 'REQ-016 Statustest', active: true } })
      statusProjectId = project.id
      await db.collaborationMembership.create({ data: { projectId: statusProjectId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
      await db.collaborationMembership.create({ data: { projectId: statusProjectId, userId: memberUserId, role: 'COLLAB_MEMBER' } })
      const stage = await db.collaborationProjectStage.create({ data: { projectId: statusProjectId, code: 'KONZEPT', title: 'Konzept', sequence: 1, weight: 100 } })
      statusStageId = stage.id
    })

    afterAll(async () => {
      if (!statusProjectId) return
      await db.auditLog.deleteMany({ where: { entityType: 'collaboration_project', entityId: statusProjectId } })
      await db.collaborationMembership.deleteMany({ where: { projectId: statusProjectId } })
      await db.collaborationProjectStage.deleteMany({ where: { projectId: statusProjectId } })
      await db.collaborationProject.deleteMany({ where: { id: statusProjectId } })
    })

    it('neu erzeugtes Projekt startet bei DRAFT (bislang wurde dieser Status von keinem Codepfad je verlassen)', async () => {
      const project = await db.collaborationProject.findUniqueOrThrow({ where: { id: statusProjectId } })
      expect(project.status).toBe('DRAFT')
    })

    it('lehnt den Statusübergang für Nicht-Manager ab (dieselbe Rolle wie restructure-stages, keine Abschwächung)', async () => {
      asMember()
      await expect(services.transitionCollaborationProjectStatus(statusProjectId, 'ACTIVE')).rejects.toThrow('Keine Berechtigung zur Projektverwaltung')
      await expect(db.collaborationProject.findUniqueOrThrow({ where: { id: statusProjectId } })).resolves.toMatchObject({ status: 'DRAFT' })
    })

    it('lehnt einen nicht erlaubten Übergang ab (DRAFT → ON_HOLD ist kein definierter Übergang)', async () => {
      asManager()
      await expect(services.transitionCollaborationProjectStatus(statusProjectId, 'ON_HOLD')).rejects.toThrow('nicht erlaubt')
    })

    it('DRAFT → ACTIVE ist erlaubt (mindestens dieser Übergang, wie in REQ-016 gefordert)', async () => {
      asManager()
      const updated = await services.transitionCollaborationProjectStatus(statusProjectId, 'ACTIVE')
      expect(updated.status).toBe('ACTIVE')
      const auditEntry = await db.auditLog.findFirst({ where: { entityType: 'collaboration_project', entityId: statusProjectId, action: 'STATUS_CHANGE' }, orderBy: { createdAt: 'desc' } })
      expect(auditEntry).toBeTruthy()
      expect(auditEntry.newValue.status).toBe('ACTIVE')
    })

    it('ACTIVE → COMPLETED wird blockiert, solange die einzige erforderliche Phase nicht abgeschlossen ist', async () => {
      asManager()
      await expect(services.transitionCollaborationProjectStatus(statusProjectId, 'COMPLETED')).rejects.toThrow(/Konzept/)
      await expect(db.collaborationProject.findUniqueOrThrow({ where: { id: statusProjectId } })).resolves.toMatchObject({ status: 'ACTIVE' })
    })

    it('ACTIVE → COMPLETED ist erlaubt, sobald alle erforderlichen Phasen abgeschlossen sind (mindestens dieser Übergang, wie in REQ-016 gefordert)', async () => {
      asManager()
      await services.transitionCollaborationStage(statusStageId, 'IN_PROGRESS')
      await services.transitionCollaborationStage(statusStageId, 'COMPLETED')
      const updated = await services.transitionCollaborationProjectStatus(statusProjectId, 'COMPLETED')
      expect(updated.status).toBe('COMPLETED')
    })

    it('COMPLETED ist ein terminaler Zustand — kein weiterer Übergang möglich, auch nicht für Manager', async () => {
      asManager()
      await expect(services.transitionCollaborationProjectStatus(statusProjectId, 'ACTIVE')).rejects.toThrow('nicht erlaubt')
    })

    it('CANCELLED ist unabhängig davon ebenfalls terminal (eigenes, frisches Projekt)', async () => {
      const cancelProject = await db.collaborationProject.create({ data: { projectNumber: `${marker}-CANCEL`, name: 'REQ-016 Abbruchtest', active: true } })
      await db.collaborationMembership.create({ data: { projectId: cancelProject.id, userId: managerUserId, role: 'COLLAB_MANAGER' } })
      asManager()
      const cancelled = await services.transitionCollaborationProjectStatus(cancelProject.id, 'CANCELLED')
      expect(cancelled.status).toBe('CANCELLED')
      await expect(services.transitionCollaborationProjectStatus(cancelProject.id, 'ACTIVE')).rejects.toThrow('nicht erlaubt')
      await db.collaborationMembership.deleteMany({ where: { projectId: cancelProject.id } })
      await db.collaborationProject.deleteMany({ where: { id: cancelProject.id } })
    })

    it('Cross-Project-IDOR: ein Manager eines fremden Projekts kann diesen Projektstatus nicht ändern', async () => {
      const foreignProject = await db.collaborationProject.create({ data: { projectNumber: `${marker}-FOREIGN-STATUS`, name: 'Fremdes Statusprojekt', active: true } })
      asManager() // managerUserId ist NICHT Mitglied von foreignProject
      await expect(services.transitionCollaborationProjectStatus(foreignProject.id, 'ACTIVE')).rejects.toThrow('nicht gefunden')
      await db.collaborationProject.deleteMany({ where: { id: foreignProject.id } })
    })
  })

  // ── REQ-015.2: Multi-Cabinet Approval Gate ─────────────────────────────
  // Realer End-to-End-Nachweis (gegen echte DB, nicht nur die reinen
  // project-workflow-Unit-Tests) für den in GGA-05.2/REQ-015.1 gefundenen
  // "Multi-Cabinet Approval Undercounting": zwei GGA-Cabinets auf derselben
  // ABNAHME-Stage, Cabinet A vollständig freigegeben, Cabinet B abgelehnt —
  // vor der Korrektur genügte As APPROVED-Freigabe, um transitionCollabo-
  // rationStage()/transitionCollaborationProjectStatus() die Stage/das
  // Projekt fälschlich als abschlussfähig erscheinen zu lassen.
  describe('REQ-015.2: Multi-Cabinet Approval Gate', () => {
    let mcProjectId = ''
    let mcStageId = ''
    let cabinetAId = ''
    let cabinetBId = ''

    async function bringCabinetToAbnahmeReady(cid: string) {
      for (const title of cabinetService.GGA_CABINET_CHECKLIST_TEMPLATES.ABNAHME.items) {
        await cabinetService.setGgaCabinetInspectionItem(cid, title, true)
      }
    }

    beforeAll(async () => {
      const project = await db.collaborationProject.create({ data: { projectNumber: `${marker}-MC`, name: 'REQ-015.2 Multi-Cabinet-Test', active: true } })
      mcProjectId = project.id
      await db.collaborationMembership.create({ data: { projectId: mcProjectId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
      const stage = await db.collaborationProjectStage.create({ data: { projectId: mcProjectId, code: 'ABNAHME', title: 'Abnahme', sequence: 1, weight: 100, requiresApproval: true } })
      mcStageId = stage.id
      asManager()
      const cabinetA = await cabinetService.createGgaCabinet(mcProjectId, { kennung: `${marker}-MC-A`, bezeichnung: 'Multi-Cabinet A' })
      cabinetAId = cabinetA.id
      const cabinetB = await cabinetService.createGgaCabinet(mcProjectId, { kennung: `${marker}-MC-B`, bezeichnung: 'Multi-Cabinet B' })
      cabinetBId = cabinetB.id
    })

    afterAll(async () => {
      if (!mcProjectId) return
      await db.auditLog.deleteMany({ where: { entityType: 'collaboration_project', entityId: mcProjectId } })
      await db.collaborationApproval.deleteMany({ where: { projectId: mcProjectId } })
      await db.collaborationChecklistItem.deleteMany({ where: { projectId: mcProjectId } })
      await db.ggaCabinet.deleteMany({ where: { projectId: mcProjectId } })
      await db.collaborationProjectStage.deleteMany({ where: { projectId: mcProjectId } })
      await db.collaborationMembership.deleteMany({ where: { projectId: mcProjectId } })
      await db.collaborationProject.deleteMany({ where: { id: mcProjectId } })
    })

    // Deckt den vom Auftraggeber vorgegebenen Testfall in der konkret
    // reproduzierbaren Variante ab, in der Cabinet B bereits eine eigene
    // Freigabe-Zeile besitzt (angefordert, aber (noch) nicht genehmigt) —
    // das ist der Fall, den getStageCompletionBlocker() als reine Funktion
    // über approval.cabinetId beheben kann (siehe project-workflow.ts).
    // Die andere Variante aus der Auftragsbeschreibung — Cabinet B hat
    // ÜBERHAUPT NOCH KEINE Freigabe angefordert (kein Datensatz) — bleibt
    // NICHT erkannt: GgaCabinet hat keine stageId, es gibt keine harte
    // Beziehung, aus der sich "welche Cabinets gehören zu dieser Stage"
    // ableiten ließe, wenn für ein Cabinet noch gar keine Zeile existiert.
    // Das ist derselbe, bereits in GGA-05.2 dokumentierte und bewusst nicht
    // aufgelöste "zwei parallele Systeme"-Befund — siehe Abschlussbericht,
    // NEW FINDINGS. Absichtlich kein Test, der diesen Zustand als korrekt
    // bestätigt.
    it('Cabinet A APPROVED, Cabinet B REJECTED: die Stage bleibt blockiert (Multi-Cabinet Approval Undercounting behoben)', async () => {
      asManager()
      await bringCabinetToAbnahmeReady(cabinetAId)
      const approvalA = await services.requestCollaborationApproval(mcStageId, cabinetAId)
      await services.decideCollaborationApproval(approvalA.id, 'APPROVED')

      await bringCabinetToAbnahmeReady(cabinetBId)
      const approvalB = await services.requestCollaborationApproval(mcStageId, cabinetBId)
      await services.decideCollaborationApproval(approvalB.id, 'REJECTED', 'Ist-Volumenstrom weicht zu stark vom Soll ab')

      await services.transitionCollaborationStage(mcStageId, 'IN_PROGRESS')
      // REQ-015.4: die neue Cabinet-Membership-Prüfung (isCabinetReadyForStage,
      // ABNAHME-Fall) nutzt denselben pruefstatus wie diese Freigabeprüfung und
      // greift daher inzwischen zuerst — Nachrichtentext kann sich geändert
      // haben, die Blockade selbst (Kernaussage dieses Tests) bleibt bestehen.
      await expect(services.transitionCollaborationStage(mcStageId, 'COMPLETED')).rejects.toThrow(/Schränke|Freigabe/)
    })

    it('erst wenn auch Cabinet B eine APPROVED-Freigabe hat, kann die Stage abgeschlossen und das Projekt auf COMPLETED überführt werden', async () => {
      asManager()
      const approvalB2 = await services.requestCollaborationApproval(mcStageId, cabinetBId)
      await services.decideCollaborationApproval(approvalB2.id, 'APPROVED')

      await expect(services.transitionCollaborationStage(mcStageId, 'COMPLETED')).resolves.not.toThrow()
      await services.transitionCollaborationProjectStatus(mcProjectId, 'ACTIVE')
      const completed = await services.transitionCollaborationProjectStatus(mcProjectId, 'COMPLETED')
      expect(completed.status).toBe('COMPLETED')
    })
  })

  // ── REQ-015.4: GGA Project Completion Integrity ────────────────────────
  // Schließt den in REQ-015.3 real reproduzierten Bypass: ein Cabinet OHNE
  // jede Task-/Checklisten-/Approval-Zeile blieb für getStageCompletion-
  // Blocker()/getProjectCompletionBlocker() unsichtbar. Membership-SSOT
  // bleibt GgaCabinet.projectId (kein neues Modell, keine Migration),
  // Progress-SSOT bleibt deriveCabinetStatus() — siehe REQ-015.4-Auftrag.
  describe('REQ-015.4: GGA Project Completion Integrity', () => {
    async function makeGgaProject(suffix: string, requiresApproval = true) {
      const project = await db.collaborationProject.create({ data: { projectNumber: `${marker}-R4${suffix}`, name: `REQ-015.4 ${suffix}`, active: true } })
      await db.collaborationMembership.create({ data: { projectId: project.id, userId: managerUserId, role: 'COLLAB_MANAGER' } })
      const stage = await db.collaborationProjectStage.create({ data: { projectId: project.id, code: 'ABNAHME', title: 'Abnahme', sequence: 1, weight: 100, requiresApproval } })
      return { projectId: project.id, stageId: stage.id }
    }
    async function makeCabinet(projectId: string, kennung: string) {
      asManager()
      const cabinet = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-${kennung}`, bezeichnung: kennung })
      return cabinet.id
    }
    async function completeAbnahme(cid: string) {
      for (const title of cabinetService.GGA_CABINET_CHECKLIST_TEMPLATES.ABNAHME.items) {
        await cabinetService.setGgaCabinetInspectionItem(cid, title, true)
      }
    }
    async function cleanupProject(projectId: string) {
      if (!projectId) return
      await db.auditLog.deleteMany({ where: { entityType: 'collaboration_project', entityId: projectId } })
      await db.collaborationApproval.deleteMany({ where: { projectId } })
      await db.collaborationChecklistItem.deleteMany({ where: { projectId } })
      await db.ggaCabinet.deleteMany({ where: { projectId } })
      await db.collaborationProjectStage.deleteMany({ where: { projectId } })
      await db.collaborationMembership.deleteMany({ where: { projectId } })
      await db.collaborationProject.deleteMany({ where: { id: projectId } })
    }

    it('T1: 1 Cabinet vollständig -> Stage abschliessbar', async () => {
      const { projectId, stageId } = await makeGgaProject('T1')
      const cabinetId = await makeCabinet(projectId, 'T1-A')
      await completeAbnahme(cabinetId)
      asManager()
      const approval = await services.requestCollaborationApproval(stageId, cabinetId)
      await services.decideCollaborationApproval(approval.id, 'APPROVED')
      await services.transitionCollaborationStage(stageId, 'IN_PROGRESS')
      await expect(services.transitionCollaborationStage(stageId, 'COMPLETED')).resolves.not.toThrow()
      await cleanupProject(projectId)
    })

    it('T9: ein Cabinet eines ANDEREN Projekts beeinflusst die Stage nicht', async () => {
      const own = await makeGgaProject('T9-OWN')
      const foreign = await makeGgaProject('T9-FOREIGN')
      const ownCabinetId = await makeCabinet(own.projectId, 'T9-OWN-A')
      const foreignCabinetId = await makeCabinet(foreign.projectId, 'T9-FOREIGN-B')
      // Foreign-Cabinet bleibt bewusst unberuehrt (keine Checkliste, keine Approval).
      await completeAbnahme(ownCabinetId)
      asManager()
      const approval = await services.requestCollaborationApproval(own.stageId, ownCabinetId)
      await services.decideCollaborationApproval(approval.id, 'APPROVED')
      await services.transitionCollaborationStage(own.stageId, 'IN_PROGRESS')
      await expect(services.transitionCollaborationStage(own.stageId, 'COMPLETED')).resolves.not.toThrow()
      expect(foreignCabinetId).toBeTruthy()
      await cleanupProject(own.projectId)
      await cleanupProject(foreign.projectId)
    })

    it('T10: Nicht-GGA-Projekt (keine GgaCabinets) mit stage-weiter Freigabe bleibt regressionsfrei', async () => {
      const project = await db.collaborationProject.create({ data: { projectNumber: `${marker}-R4T10`, name: 'REQ-015.4 T10 Nicht-GGA', active: true } })
      await db.collaborationMembership.create({ data: { projectId: project.id, userId: managerUserId, role: 'COLLAB_MANAGER' } })
      // Bewusst KEIN GGA-Stage-Code -- generische Projektphase ohne Cabinet-Bezug.
      const stage = await db.collaborationProjectStage.create({ data: { projectId: project.id, code: 'FREIGABE', title: 'Freigabe', sequence: 1, weight: 100, requiresApproval: true } })
      asManager()
      const approval = await services.requestCollaborationApproval(stage.id, null)
      await services.decideCollaborationApproval(approval.id, 'APPROVED')
      await services.transitionCollaborationStage(stage.id, 'IN_PROGRESS')
      await expect(services.transitionCollaborationStage(stage.id, 'COMPLETED')).resolves.not.toThrow()
      await cleanupProject(project.id)
    })

    describe('T2-T8, T11: schrittweise Cabinet-B-Vervollstaendigung', () => {
      let projectId = ''
      let stageId = ''
      let cabinetAId = ''
      let cabinetBId = ''

      beforeAll(async () => {
        const setup = await makeGgaProject('T2-8-11')
        projectId = setup.projectId
        stageId = setup.stageId
        cabinetAId = await makeCabinet(projectId, 'T2-8-A')
        cabinetBId = await makeCabinet(projectId, 'T2-8-B')
        await completeAbnahme(cabinetAId)
        asManager()
        const approvalA = await services.requestCollaborationApproval(stageId, cabinetAId)
        await services.decideCollaborationApproval(approvalA.id, 'APPROVED')
        await services.transitionCollaborationStage(stageId, 'IN_PROGRESS')
      })

      afterAll(async () => { await cleanupProject(projectId) })

      it('T2: A vollstaendig, B komplett unberuehrt -> Stage BLOCKED', async () => {
        await expect(services.transitionCollaborationStage(stageId, 'COMPLETED')).rejects.toThrow('Schränke')
      })

      it('T7: Project ACTIVE->COMPLETED bei unberuehrtem Cabinet B -> BLOCKED', async () => {
        asManager()
        await services.transitionCollaborationProjectStatus(projectId, 'ACTIVE')
        await expect(services.transitionCollaborationProjectStatus(projectId, 'COMPLETED')).rejects.toThrow(/Abnahme/)
      })

      // Hinweis Nachrichtentext: isCabinetReadyForStage() prüft für ABNAHME
      // denselben pruefstatus === 'BESTANDEN', den auch die REQ-015.2-C-
      // Freigabeprüfung nutzt — die Cabinet-Membership-Prüfung greift daher
      // hier bereits VOR der reinen Freigabeprüfung (beide Checks kämen zum
      // selben Ergebnis; der Testfall prüft die tatsächliche Blockade, nicht
      // welcher der beiden inhaltlich überlappenden Checks zuerst greift).
      it('T3: A APPROVED, B Checkliste vollstaendig aber OHNE Approval -> Stage BLOCKED', async () => {
        await completeAbnahme(cabinetBId)
        await expect(services.transitionCollaborationStage(stageId, 'COMPLETED')).rejects.toThrow(/Schränke|Freigabe/)
      })

      it('T4: A APPROVED, B REQUESTED (noch nicht entschieden) -> Stage BLOCKED', async () => {
        asManager()
        await services.requestCollaborationApproval(stageId, cabinetBId)
        await expect(services.transitionCollaborationStage(stageId, 'COMPLETED')).rejects.toThrow(/Schränke|Freigabe/)
      })

      it('T5: A APPROVED, B REJECTED -> Stage BLOCKED', async () => {
        const pending = await db.collaborationApproval.findFirstOrThrow({ where: { cabinetId: cabinetBId, status: 'REQUESTED' } })
        asManager()
        await services.decideCollaborationApproval(pending.id, 'REJECTED', 'Ist-Volumenstrom weicht zu stark vom Soll ab')
        await expect(services.transitionCollaborationStage(stageId, 'COMPLETED')).rejects.toThrow(/Schränke|Freigabe/)
      })

      it('T11: decideCollaborationApproval() selbst setzt die Stage NIE auf COMPLETED -- nur der explizite transitionCollaborationStage()-Aufruf darf das', async () => {
        const stageRow = await db.collaborationProjectStage.findUniqueOrThrow({ where: { id: stageId } })
        expect(stageRow.status).not.toBe('COMPLETED')
        expect(stageRow.status).toBe('IN_PROGRESS')
      })

      it('T6: B erhaelt eine APPROVED-Freigabe -> Stage ALLOWED', async () => {
        asManager()
        const approvalB = await services.requestCollaborationApproval(stageId, cabinetBId)
        await services.decideCollaborationApproval(approvalB.id, 'APPROVED')
        await expect(services.transitionCollaborationStage(stageId, 'COMPLETED')).resolves.not.toThrow()
      })

      it('T8: Project ACTIVE->COMPLETED nach vollstaendigem Cabinet B -> ALLOWED', async () => {
        asManager()
        const completed = await services.transitionCollaborationProjectStatus(projectId, 'COMPLETED')
        expect(completed.status).toBe('COMPLETED')
      })
    })
  })
})
