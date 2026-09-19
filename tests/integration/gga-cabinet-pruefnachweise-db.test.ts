import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// REQ-018/REQ-018.1: strukturierte Prüfnachweise Lüftung/Elektro/VDE —
// real gegen eine echte DB, da die Multi-Cabinet-Isolation, die
// Checklisten-Synchronisation und die Audience-Filterung der Schrankakte
// nicht sinnvoll gemockt geprüft werden können.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

describe.skipIf(!RUN_INTEGRATION)('GGA-Prüfnachweise (REQ-018/REQ-018.1) — Datenbankintegration', () => {
  let db: any
  let cabinetService: typeof import('@/lib/services/gga-cabinet.service')
  let phase2Service: typeof import('@/lib/services/collaboration-phase2.service')
  let documentService: typeof import('@/lib/services/collaboration-document.service')
  let schrankakteService: typeof import('@/lib/services/gga-cabinet-schrankakte.service')
  const marker = `GGA-PN-${Date.now()}-${Math.random().toString(16).slice(2)}`

  let managerUserId = '', managerEmail = ''
  let plannerUserId = '', plannerEmail = ''
  let viewerUserId = '', viewerEmail = ''
  let operatorUserId = '', operatorEmail = ''

  let projectId = ''
  let stageAbnahmeId = ''
  let cabinetAId = '', cabinetBId = ''

  function asUser(id: string, email: string) { auth.getServerSession.mockResolvedValue({ user: { id, email, authScope: 'COLLABORATION' } }) }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const mk = async (label: string) => db.user.create({ data: { email: `${marker}-${label}@example.invalid`, passwordHash: 'not-used', firstName: label, lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })

    const manager = await mk('manager'); managerUserId = manager.id; managerEmail = manager.email
    const planner = await mk('planner'); plannerUserId = planner.id; plannerEmail = planner.email
    const viewer = await mk('viewer'); viewerUserId = viewer.id; viewerEmail = viewer.email
    const operator = await mk('operator'); operatorUserId = operator.id; operatorEmail = operator.email

    const project = await db.collaborationProject.create({ data: { projectNumber: `${marker}-P`, name: 'Prüfnachweis-Test', active: true } })
    projectId = project.id
    await db.collaborationMembership.create({ data: { projectId, userId: managerUserId, role: 'COLLAB_MANAGER' } })
    await db.collaborationMembership.create({ data: { projectId, userId: plannerUserId, role: 'INTERNAL_PLANNER' } })
    await db.collaborationMembership.create({ data: { projectId, userId: viewerUserId, role: 'COLLAB_VIEWER' } })
    await db.collaborationMembership.create({ data: { projectId, userId: operatorUserId, role: 'OPERATOR' } })

    const stage = await db.collaborationProjectStage.create({ data: { projectId, code: 'ABNAHME', title: 'Abnahme', sequence: 1, weight: 100, requiresApproval: true } })
    stageAbnahmeId = stage.id

    cabinetService = await import('@/lib/services/gga-cabinet.service')
    phase2Service = await import('@/lib/services/collaboration-phase2.service')
    documentService = await import('@/lib/services/collaboration-document.service')
    schrankakteService = await import('@/lib/services/gga-cabinet-schrankakte.service')

    asUser(plannerUserId, plannerEmail)
    const cabinetA = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-A`, bezeichnung: 'Cabinet A' })
    cabinetAId = cabinetA.id
    const cabinetB = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-B`, bezeichnung: 'Cabinet B' })
    cabinetBId = cabinetB.id
  })

  afterAll(async () => {
    if (!db) return
    const allUserIds = [managerUserId, plannerUserId, viewerUserId, operatorUserId].filter(Boolean)
    await db.auditLog.deleteMany({ where: { userId: { in: allUserIds } } })
    if (projectId) {
      await db.ggaCabinetPruefnachweis.deleteMany({ where: { cabinet: { projectId } } })
      await db.collaborationDocument.deleteMany({ where: { projectId } })
      await db.collaborationApproval.deleteMany({ where: { projectId } })
      await db.collaborationChecklistItem.deleteMany({ where: { projectId } })
      await db.ggaCabinet.deleteMany({ where: { projectId } })
      await db.collaborationProjectStage.deleteMany({ where: { projectId } })
      await db.collaborationMembership.deleteMany({ where: { projectId } })
    }
    await db.collaborationProject.deleteMany({ where: { id: projectId } })
    await db.user.deleteMany({ where: { id: { in: allUserIds } } })
    await db.$disconnect()
  })

  async function findAbnahmeChecklistItem(cabinetId: string, title: string) {
    return db.collaborationChecklistItem.findFirst({ where: { cabinetId, stageId: stageAbnahmeId, title } })
  }

  it('T1: LUEFTUNG korrekt Cabinet A zugeordnet', async () => {
    asUser(plannerUserId, plannerEmail)
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetAId, 'LUEFTUNG', 'BESTANDEN', {})
    const overview = await cabinetService.getGgaCabinetPruefnachweisOverview(cabinetAId)
    const lueftung = overview.find((e) => e.pruefart === 'LUEFTUNG')
    expect(lueftung?.current?.ergebnis).toBe('BESTANDEN')
  })

  it('T2: ELEKTRO korrekt Cabinet A zugeordnet', async () => {
    asUser(plannerUserId, plannerEmail)
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetAId, 'ELEKTRO', 'BESTANDEN', {})
    const overview = await cabinetService.getGgaCabinetPruefnachweisOverview(cabinetAId)
    expect(overview.find((e) => e.pruefart === 'ELEKTRO')?.current?.ergebnis).toBe('BESTANDEN')
  })

  it('T3: VDE korrekt Cabinet A zugeordnet', async () => {
    asUser(plannerUserId, plannerEmail)
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetAId, 'VDE', 'BESTANDEN', {})
    const overview = await cabinetService.getGgaCabinetPruefnachweisOverview(cabinetAId)
    expect(overview.find((e) => e.pruefart === 'VDE')?.current?.ergebnis).toBe('BESTANDEN')
  })

  it('T4/AC3: ein Nachweisdokument eines ANDEREN Cabinets kann die Prüfung nicht erfüllen', async () => {
    asUser(plannerUserId, plannerEmail)
    const foreignDoc = await documentService.uploadCollaborationDocument({ projectId, cabinetId: cabinetBId, documentKind: 'Pruefbericht', originalName: 'fremd.pdf', mimeType: 'application/pdf', buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) })
    await expect(cabinetService.recordGgaCabinetPruefnachweis(cabinetAId, 'LUEFTUNG', 'BESTANDEN', { documentId: foreignDoc.id })).rejects.toThrow('nicht gefunden')
  })

  it('T5/AC4: OFFEN blockiert die erforderliche Readiness (Elektro/VDE-Checklistenpunkt bleibt offen)', async () => {
    // Frisches Cabinet C, um unabhängig vom bisherigen Testverlauf zu prüfen.
    asUser(plannerUserId, plannerEmail)
    const cabinetC = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-C`, bezeichnung: 'Cabinet C' })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetC.id, 'ELEKTRO', 'OFFEN', {})
    const item = await findAbnahmeChecklistItem(cabinetC.id, 'Elektro/VDE geprüft')
    expect(item?.completed ?? false).toBe(false)
  })

  it('T6/AC5: NICHT_BESTANDEN blockiert die erforderliche Readiness', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetD = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-D`, bezeichnung: 'Cabinet D' })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetD.id, 'ELEKTRO', 'BESTANDEN', {})
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetD.id, 'VDE', 'NICHT_BESTANDEN', {})
    const item = await findAbnahmeChecklistItem(cabinetD.id, 'Elektro/VDE geprüft')
    expect(item?.completed ?? false).toBe(false)
  })

  it('T7/AC7: BESTANDEN + gültiger, zugehöriger Nachweis erfüllt die Regel und wird strukturiert dargestellt', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetE = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-E`, bezeichnung: 'Cabinet E' })
    const doc = await documentService.uploadCollaborationDocument({ projectId, cabinetId: cabinetE.id, documentKind: 'Pruefbericht', originalName: 'lueftung.pdf', mimeType: 'application/pdf', buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetE.id, 'LUEFTUNG', 'BESTANDEN', { documentId: doc.id, pruefdatum: '2026-01-15' })
    const overview = await cabinetService.getGgaCabinetPruefnachweisOverview(cabinetE.id)
    const current = overview.find((e) => e.pruefart === 'LUEFTUNG')?.current
    expect(current?.ergebnis).toBe('BESTANDEN')
    expect(current?.documentId).toBe(doc.id)
    const item = await findAbnahmeChecklistItem(cabinetE.id, 'Abluft geprüft')
    expect(item?.completed).toBe(true)
  })

  it('T8/T19/AC6: ein Dokumentupload OHNE zugehöriges Prüfergebnis erfüllt die technische Prüfung nicht', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetF = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-F`, bezeichnung: 'Cabinet F' })
    await documentService.uploadCollaborationDocument({ projectId, cabinetId: cabinetF.id, documentKind: 'Pruefbericht', originalName: 'ohne-ergebnis.pdf', mimeType: 'application/pdf', buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) })
    // Bewusst KEIN recordGgaCabinetPruefnachweis()-Aufruf.
    const overview = await cabinetService.getGgaCabinetPruefnachweisOverview(cabinetF.id)
    expect(overview.find((e) => e.pruefart === 'LUEFTUNG')?.current).toBeNull()
    const item = await findAbnahmeChecklistItem(cabinetF.id, 'Abluft geprüft')
    expect(item?.completed ?? false).toBe(false)
  })

  it('T9/AC8: unberechtigter Benutzer (COLLAB_VIEWER) kann kein Prüfergebnis erfassen — Server-Gate, keine reine UI-Prüfung', async () => {
    asUser(viewerUserId, viewerEmail)
    await expect(cabinetService.recordGgaCabinetPruefnachweis(cabinetAId, 'LUEFTUNG', 'BESTANDEN', {})).rejects.toThrow('Keine Berechtigung')
  })

  it('T12/AC14: eine relevante Änderung erzeugt einen nachvollziehbaren Audit-Eintrag', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetG = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-G`, bezeichnung: 'Cabinet G' })
    const created = await cabinetService.recordGgaCabinetPruefnachweis(cabinetG.id, 'VDE', 'BESTANDEN', {})
    const entry = await db.auditLog.findFirst({ where: { entityType: 'gga_cabinet_pruefnachweis', entityId: created.id } })
    expect(entry).toBeTruthy()
    expect(entry.action).toBe('CREATE')
  })

  it('T15/AC13: Multi-Cabinet-Isolation — Prüfdaten von Cabinet A beeinflussen Cabinet B nicht', async () => {
    asUser(plannerUserId, plannerEmail)
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetAId, 'VDE', 'BESTANDEN', {})
    const overviewB = await cabinetService.getGgaCabinetPruefnachweisOverview(cabinetBId)
    expect(overviewB.find((e) => e.pruefart === 'VDE')?.current).toBeNull()
  })

  it('T17: der Legacy-Checklistenhaken "Elektro/VDE geprüft" erzeugt NICHT automatisch ELEKTRO=BESTANDEN oder VDE=BESTANDEN', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetH = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-H`, bezeichnung: 'Cabinet H' })
    // Bestehenden Weg nutzen: den booleschen Checklistenpunkt direkt setzen
    // (wie vor REQ-018 üblich) — OHNE je einen strukturierten Prüfnachweis
    // anzulegen.
    await cabinetService.setGgaCabinetInspectionItem(cabinetH.id, 'Elektro/VDE geprüft', true)
    const overview = await cabinetService.getGgaCabinetPruefnachweisOverview(cabinetH.id)
    expect(overview.find((e) => e.pruefart === 'ELEKTRO')?.current).toBeNull()
    expect(overview.find((e) => e.pruefart === 'VDE')?.current).toBeNull()
  })

  it('T18: ein fehlender strukturierter, erforderlicher Prüfnachweis gilt nicht als BESTANDEN, auch wenn eine andere Prüfart bereits BESTANDEN ist', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetI = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-I`, bezeichnung: 'Cabinet I' })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetI.id, 'ELEKTRO', 'BESTANDEN', {})
    // VDE nie erfasst -> kombinierter Checklistenpunkt bleibt offen.
    const item = await findAbnahmeChecklistItem(cabinetI.id, 'Elektro/VDE geprüft')
    expect(item?.completed ?? false).toBe(false)
  })

  // REQ-018.2 (T5/T6): der automatische Prüfnachweis-Sync
  // (syncGgaCabinetPruefnachweisToChecklist) darf — genau wie der manuelle
  // Checklisten-Toggle — niemals nur einen Teil der 8 ABNAHME-Pflichtpunkte
  // materialisieren. Real reproduzierter Fehler aus der REQ-018.1-Browser-QA
  // (Q14): vorher entstanden durch recordGgaCabinetPruefnachweis() nur die
  // 1-2 synchronisierten Zeilen, wodurch die Fortschrittsberechnung
  // fälschlich 100% statt der korrekten Bruchzahl aus 8 meldete.
  it('T5: LUEFTUNG-Sync materialisiert alle 8 ABNAHME-Pflichtpunkte, nicht nur "Abluft geprüft"', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetN = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-N`, bezeichnung: 'Cabinet N' })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetN.id, 'LUEFTUNG', 'BESTANDEN', {})
    const allItems = await db.collaborationChecklistItem.findMany({ where: { cabinetId: cabinetN.id, stageId: stageAbnahmeId } })
    expect(allItems.length).toBe(8)
    const completed = allItems.filter((i: any) => i.completed).map((i: any) => i.title)
    expect(completed).toEqual(['Abluft geprüft']) // nur der tatsächlich erfüllte Punkt, nicht fälschlich alle 8
  })

  it('T6: ELEKTRO/VDE-Sync materialisiert alle 8 ABNAHME-Pflichtpunkte, nicht nur "Elektro/VDE geprüft"', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetO = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-O`, bezeichnung: 'Cabinet O' })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetO.id, 'ELEKTRO', 'BESTANDEN', {})
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetO.id, 'VDE', 'BESTANDEN', {})
    const allItems = await db.collaborationChecklistItem.findMany({ where: { cabinetId: cabinetO.id, stageId: stageAbnahmeId } })
    expect(allItems.length).toBe(8) // nicht nur 1 (der kombinierte Legacy-Punkt)
    const completed = allItems.filter((i: any) => i.completed).map((i: any) => i.title)
    expect(completed).toEqual(['Elektro/VDE geprüft'])
  })

  it('T20/T21: Wiederholungsprüfung — NICHT_BESTANDEN gefolgt von späterem BESTANDEN liefert deterministisch den aktuellen Zustand, Historie bleibt vollständig erhalten', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetJ = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-J`, bezeichnung: 'Cabinet J' })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetJ.id, 'LUEFTUNG', 'NICHT_BESTANDEN', { bemerkung: 'Erstprüfung nicht bestanden' })
    let overview = await cabinetService.getGgaCabinetPruefnachweisOverview(cabinetJ.id)
    expect(overview.find((e) => e.pruefart === 'LUEFTUNG')?.current?.ergebnis).toBe('NICHT_BESTANDEN')
    let item = await findAbnahmeChecklistItem(cabinetJ.id, 'Abluft geprüft')
    expect(item?.completed ?? false).toBe(false)

    await cabinetService.recordGgaCabinetPruefnachweis(cabinetJ.id, 'LUEFTUNG', 'BESTANDEN', { bemerkung: 'Nachprüfung bestanden' })
    overview = await cabinetService.getGgaCabinetPruefnachweisOverview(cabinetJ.id)
    const lueftung = overview.find((e) => e.pruefart === 'LUEFTUNG')!
    expect(lueftung.current?.ergebnis).toBe('BESTANDEN')
    expect(lueftung.history).toHaveLength(2)
    expect(lueftung.history.some((h) => h.ergebnis === 'NICHT_BESTANDEN')).toBe(true)
    item = await findAbnahmeChecklistItem(cabinetJ.id, 'Abluft geprüft')
    expect(item?.completed).toBe(true)

    const rowCount = await db.ggaCabinetPruefnachweis.count({ where: { cabinetId: cabinetJ.id, pruefart: 'LUEFTUNG' } })
    expect(rowCount).toBe(2)
  })

  it('T13/T14/AC11/AC12: bestehende Schrankakte UND interne Freigabe-/Abnahme-Logik bleiben regressionsfrei nach vollständiger struktureller Prüfung', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetK = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-K`, bezeichnung: 'Cabinet K' })
    for (const title of cabinetService.GGA_CABINET_CHECKLIST_TEMPLATES.ABNAHME.items) {
      await cabinetService.setGgaCabinetInspectionItem(cabinetK.id, title, true)
    }
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetK.id, 'LUEFTUNG', 'BESTANDEN', {})
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetK.id, 'ELEKTRO', 'BESTANDEN', {})
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetK.id, 'VDE', 'BESTANDEN', {})

    // REQ-015-Gate unverändert: interne Freigabe funktioniert weiterhin wie vor REQ-018.
    const approval = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinetK.id)
    asUser(managerUserId, managerEmail)
    await phase2Service.decideCollaborationApproval(approval.id, 'APPROVED')
    asUser(plannerUserId, plannerEmail)

    const internalData = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetK.id, 'INTERNAL')
    expect(internalData.sections.map((s) => s.key)).toContain('G')
    const sectionJ = internalData.sections.find((s) => s.key === 'J')!
    expect(sectionJ.rows.some((r) => r.label.includes('Prüfnachweis Lüftung'))).toBe(true)
    expect(sectionJ.rows.some((r) => r.label.includes('Prüfnachweis Elektro'))).toBe(true)
    expect(sectionJ.rows.some((r) => r.label.includes('Prüfnachweis VDE'))).toBe(true)
  })

  it('T10/AC10: OPERATOR erhält in der Betreiber-Schrankakte keine interne Bemerkung zu einem Prüfnachweis', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetL = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-L`, bezeichnung: 'Cabinet L' })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetL.id, 'LUEFTUNG', 'BESTANDEN', { bemerkung: 'Streng interne Einschätzung — nicht für Betreiber' })
    asUser(operatorUserId, operatorEmail)
    const data = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetL.id, 'OPERATOR')
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('Streng interne Einschätzung')
  })

  it('T11/AC10: zulässige Betreiberdaten (Ergebnis, Prüfdatum, ausführende Stelle) bleiben in der Betreiber-Schrankakte abrufbar', async () => {
    asUser(plannerUserId, plannerEmail)
    const cabinetM = await cabinetService.createGgaCabinet(projectId, { kennung: `${marker}-M`, bezeichnung: 'Cabinet M' })
    await cabinetService.recordGgaCabinetPruefnachweis(cabinetM.id, 'ELEKTRO', 'BESTANDEN', { pruefdatum: '2026-02-01', ausfuehrendeStelle: `${marker} Prüforganisation` })
    asUser(operatorUserId, operatorEmail)
    const data = await schrankakteService.getGgaCabinetSchrankaktePdfData(cabinetM.id, 'OPERATOR')
    const sectionJ = data.sections.find((s) => s.key === 'J')!
    const row = sectionJ.rows.find((r) => r.label.includes('Prüfnachweis Elektro'))
    expect(row?.value).toContain('Bestanden')
    expect(row?.value).toContain(`${marker} Prüforganisation`)
  })
})
