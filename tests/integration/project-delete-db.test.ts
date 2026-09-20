import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PERMISSION_MATRIX } from '@/lib/auth/permissions'
import { RoleName } from '@/types/enums'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Die globale Unit-Test-Konfiguration mockt Prisma/Audit standardmäßig;
// dieser Testlauf prüft bewusst echte Transaktionen auf der Test-DB.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

// DELETE-SAFETY-001 T8 — Berechtigungsprüfung liegt bei der Projektlöschung
// (wie bei jedem anderen Delete-Pfad dieses Portals) an der Server-Action-
// Ebene, nicht im Service selbst. Diese Prüfung braucht keine Datenbank und
// läuft daher unabhängig von TEST_DATABASE_URL.
describe('Project Delete — Berechtigungsmatrix (T8)', () => {
  it('erlaubt Projektlöschung ausschließlich ADMIN und OFFICE, nicht EMPLOYEE/PROJECT_MANAGER/ACCOUNTING', () => {
    const roles = PERMISSION_MATRIX['project:delete']
    expect(roles).toEqual(expect.arrayContaining([RoleName.ADMIN, RoleName.OFFICE]))
    expect(roles).not.toEqual(expect.arrayContaining([RoleName.EMPLOYEE]))
    expect(roles).not.toEqual(expect.arrayContaining([RoleName.PROJECT_MANAGER]))
    expect(roles).not.toEqual(expect.arrayContaining([RoleName.ACCOUNTING]))
  })
})

describe.skipIf(!RUN_INTEGRATION)('Project Delete — Datenbankintegration', () => {
  let db: any
  let services: typeof import('@/lib/services/project.service')
  let actor: { userId: string; userEmail: string }
  let customerId = ''
  const marker = `DELSAFE-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const createdProjectIds: string[] = []
  const createdOrderIds: string[] = []
  const createdServiceReportIds: string[] = []
  const createdInvoiceIds: string[] = []
  const createdCollaborationIds: string[] = []

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const user = await db.user.create({ data: { email: `${marker}@example.invalid`, passwordHash: 'not-used', firstName: 'DeleteSafety', lastName: 'Test', roleId: role.id } })
    actor = { userId: user.id, userEmail: user.email }
    const customer = await db.customer.create({ data: { number: `${marker}-K`, name: 'Delete-Safety Testkunde' } })
    customerId = customer.id
    services = await import('@/lib/services/project.service')
  })

  afterAll(async () => {
    if (!db) return
    if (createdCollaborationIds.length) await db.collaborationProject.deleteMany({ where: { id: { in: createdCollaborationIds } } })
    if (createdInvoiceIds.length) await db.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } })
    if (createdServiceReportIds.length) await db.serviceReport.deleteMany({ where: { id: { in: createdServiceReportIds } } })
    if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } })
    if (createdProjectIds.length) await db.project.deleteMany({ where: { id: { in: createdProjectIds } } })
    if (actor?.userId) await db.auditLog.deleteMany({ where: { userId: actor.userId } })
    if (customerId) await db.customer.deleteMany({ where: { id: customerId } })
    if (actor?.userId) await db.user.deleteMany({ where: { id: actor.userId } })
    await db.$disconnect()
  })

  async function makeProject(suffix: string) {
    const id = await services.createProject({ projectNumber: `${marker}-${suffix}`, name: `Delete-Safety Projekt ${suffix}`, customerId, status: 'ACTIVE' }, actor)
    createdProjectIds.push(id)
    const project = await db.project.findUniqueOrThrow({ where: { id }, select: { id: true, projectNumber: true } })
    return project as { id: string; projectNumber: string }
  }

  it('T1: ein leeres, unbenutztes Projekt kann nach vollständiger Bestätigung gelöscht werden', async () => {
    const project = await makeProject('T1-EMPTY')
    const fullProject = await services.getProject(project.id)
    expect(services.getProjectDeleteBlockers(fullProject)).toEqual([])

    await services.deleteProject(project.id, project.projectNumber, actor)

    const row = await db.project.findUniqueOrThrow({ where: { id: project.id }, select: { deletedAt: true } })
    expect(row.deletedAt).not.toBeNull()
  })

  it('T2: eine falsch eingegebene Projektnummer verhindert die Löschung serverseitig', async () => {
    const project = await makeProject('T2-WRONGNUM')
    await expect(services.deleteProject(project.id, 'FALSCHE-NUMMER', actor)).rejects.toThrow('Projektnummer')
    const row = await db.project.findUniqueOrThrow({ where: { id: project.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T3: ein Projekt mit einem Auftrag kann nicht hart gelöscht werden', async () => {
    const project = await makeProject('T3-ORDER')
    const order = await db.order.create({ data: { orderNumber: `${marker}-T3-ORDER`, customerId, projectId: project.id, createdById: actor.userId } })
    createdOrderIds.push(order.id)

    await expect(services.deleteProject(project.id, project.projectNumber, actor)).rejects.toThrow('Auftrag')
    const row = await db.project.findUniqueOrThrow({ where: { id: project.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T4: ein Projekt mit einer Leistung (Leistungsnachweis) kann nicht hart gelöscht werden', async () => {
    const project = await makeProject('T4-SERVICE')
    const order = await db.order.create({ data: { orderNumber: `${marker}-T4-ORDER`, customerId, projectId: project.id, createdById: actor.userId } })
    createdOrderIds.push(order.id)
    const report = await db.serviceReport.create({ data: { reportNumber: `${marker}-T4-LN`, orderId: order.id, reportDate: new Date(), createdById: actor.userId } })
    createdServiceReportIds.push(report.id)

    await expect(services.deleteProject(project.id, project.projectNumber, actor)).rejects.toThrow('Leistung')
    const row = await db.project.findUniqueOrThrow({ where: { id: project.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T5: ein Projekt mit einer Rechnung kann nicht hart gelöscht werden', async () => {
    const project = await makeProject('T5-INVOICE')
    const invoice = await db.invoice.create({ data: { customerId, projectId: project.id, invoiceDate: new Date(), createdById: actor.userId } })
    createdInvoiceIds.push(invoice.id)

    await expect(services.deleteProject(project.id, project.projectNumber, actor)).rejects.toThrow('Rechnung')
    const row = await db.project.findUniqueOrThrow({ where: { id: project.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T6+T7: ein Projekt mit aktiver Zusammenarbeit kann nicht gelöscht werden, und die Collaboration-Daten bleiben unangetastet', async () => {
    const project = await makeProject('T6-COLLAB')
    const collaboration = await services.activateCollaboration(project.id, actor)
    createdCollaborationIds.push(collaboration.id)

    await expect(services.deleteProject(project.id, project.projectNumber, actor)).rejects.toThrow('Zusammenarbeit aktiv')

    const row = await db.project.findUniqueOrThrow({ where: { id: project.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
    // T7: kein Cascade — das CollaborationProject existiert unverändert weiter.
    const collabRow = await db.collaborationProject.findUniqueOrThrow({ where: { id: collaboration.id }, select: { internalProjectId: true, deletedAt: true } })
    expect(collabRow.internalProjectId).toBe(project.id)
    expect(collabRow.deletedAt).toBeNull()
  })

  it('T9: eine erfolgreiche Löschung ist über den bestehenden Audit-Mechanismus nachvollziehbar', async () => {
    const project = await makeProject('T9-AUDIT')
    await services.deleteProject(project.id, project.projectNumber, actor)

    const auditEntry = await db.auditLog.findFirst({ where: { entityType: 'project', entityId: project.id, action: 'DELETE' } })
    expect(auditEntry).not.toBeNull()
    expect(auditEntry.userId).toBe(actor.userId)
  })

  it('T10: eine deleteProject()-Anfrage ohne (oder mit leerer) Bestätigung führt zu keiner Löschung', async () => {
    const project = await makeProject('T10-NOCONFIRM')
    await expect(services.deleteProject(project.id, '', actor)).rejects.toThrow('Projektnummer')
    const row = await db.project.findUniqueOrThrow({ where: { id: project.id }, select: { deletedAt: true } })
    expect(row.deletedAt).toBeNull()
  })

  it('T11: parallele doppelte Löschanfragen führen zu einem kontrollierten Ergebnis ohne doppelten Audit-Eintrag', async () => {
    const project = await makeProject('T11-DUPLICATE')

    const results = await Promise.allSettled([
      services.deleteProject(project.id, project.projectNumber, actor),
      services.deleteProject(project.id, project.projectNumber, actor),
    ])
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(Error)
    }

    const row = await db.project.findUniqueOrThrow({ where: { id: project.id }, select: { deletedAt: true } })
    expect(row.deletedAt).not.toBeNull()
    const auditCount = await db.auditLog.count({ where: { entityType: 'project', entityId: project.id, action: 'DELETE' } })
    expect(auditCount).toBe(1)
  })

  it('T12: die Projektliste enthält ein gelöschtes Projekt nach erfolgreicher Löschung nicht mehr', async () => {
    const project = await makeProject('T12-LIST')
    await services.deleteProject(project.id, project.projectNumber, actor)

    const list = await services.listProjects({ search: marker })
    expect(list.some((p: { id: string }) => p.id === project.id)).toBe(false)
  })
})
