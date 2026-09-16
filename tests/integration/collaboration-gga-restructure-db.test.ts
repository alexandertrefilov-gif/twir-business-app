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
})
