import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { RoleName } from '@/types/enums'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Die globale Unit-Test-Konfiguration mockt Prisma und Audit. Dieser Test
// prüft bewusst die tatsächlichen Transaktionen auf der expliziten Test-DB.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

describe.skipIf(!RUN_INTEGRATION)('Project Foundation — Datenbankintegration', () => {
  let db: any
  let services: typeof import('@/lib/services/project.service')
  let actor: { userId: string; userEmail: string }
  let customerAId = ''
  let customerBId = ''
  let orderId = ''
  let projectAId = ''
  let projectBId = ''
  let collaborationId = ''
  const marker = `REBASELINE-${Date.now()}-${Math.random().toString(16).slice(2)}`

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const user = await db.user.create({ data: { email: `${marker}@example.invalid`, passwordHash: 'not-used', firstName: 'Rebaseline', lastName: 'Test', roleId: role.id } })
    actor = { userId: user.id, userEmail: user.email }
    const [customerA, customerB] = await Promise.all([
      db.customer.create({ data: { number: `${marker}-A`, name: 'Rebaseline Testkunde A' } }),
      db.customer.create({ data: { number: `${marker}-B`, name: 'Rebaseline Testkunde B' } }),
    ])
    customerAId = customerA.id
    customerBId = customerB.id
    const order = await db.order.create({ data: { orderNumber: `${marker}-ORDER`, customerId: customerAId, createdById: actor.userId } })
    orderId = order.id
    services = await import('@/lib/services/project.service')
  })

  afterAll(async () => {
    if (!db) return
    if (collaborationId) await db.collaborationProject.deleteMany({ where: { id: collaborationId } })
    if (orderId) await db.order.updateMany({ where: { id: orderId }, data: { projectId: null } })
    if (projectAId || projectBId) await db.project.deleteMany({ where: { id: { in: [projectAId, projectBId].filter(Boolean) } } })
    if (actor?.userId) await db.auditLog.deleteMany({ where: { userId: actor.userId } })
    if (orderId) await db.order.deleteMany({ where: { id: orderId } })
    if (customerAId || customerBId) await db.customer.deleteMany({ where: { id: { in: [customerAId, customerBId].filter(Boolean) } } })
    if (actor?.userId) await db.user.deleteMany({ where: { id: actor.userId } })
    await db.$disconnect()
  })

  it('ordnet nur kundenkonsistente Aufträge zu und aktiviert Collaboration genau einmal', async () => {
    projectAId = await services.createProject({ projectNumber: `${marker}-P-A`, name: 'Rebaseline Projekt A', customerId: customerAId, status: 'ACTIVE' }, actor)
    projectBId = await services.createProject({ projectNumber: `${marker}-P-B`, name: 'Rebaseline Projekt B', customerId: customerBId, status: 'ACTIVE' }, actor)

    await services.assignOrderToProject(projectAId, orderId, actor)
    await expect(services.assignOrderToProject(projectBId, orderId, actor)).rejects.toThrow('selben Kunden')

    const first = await services.activateCollaboration(projectAId, actor)
    const second = await services.activateCollaboration(projectAId, actor)
    collaborationId = first.id

    expect(second.id).toBe(first.id)
    await expect(db.order.findUniqueOrThrow({ where: { id: orderId }, select: { projectId: true } })).resolves.toEqual({ projectId: projectAId })
    await expect(db.collaborationProject.findUniqueOrThrow({ where: { id: first.id }, select: { internalProjectId: true, projectNumber: true, name: true } })).resolves.toEqual({ internalProjectId: projectAId, projectNumber: `${marker}-P-A`, name: 'Rebaseline Projekt A' })
  })

  it('lehnt eine doppelt vergebene Projektnummer mit einer sprechenden Meldung statt eines rohen DB-Fehlers ab', async () => {
    const duplicateNumber = `${marker}-DUPLICATE`
    const results = await Promise.allSettled([
      services.createProject({ projectNumber: duplicateNumber, name: 'Dup A', customerId: customerAId, status: 'ACTIVE' }, actor),
      services.createProject({ projectNumber: duplicateNumber, name: 'Dup B', customerId: customerAId, status: 'ACTIVE' }, actor),
    ])
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0].reason as Error).message).toBe('Diese Projektnummer ist bereits vergeben.')

    await db.project.deleteMany({ where: { id: fulfilled[0].value } })
  })

  it('liest einen bestehenden Geschäftsvorgang des Klons weiterhin über den zentralen Workflow', async () => {
    const existingOrder = await db.order.findFirstOrThrow({ where: { deletedAt: null }, select: { id: true } })
    const { getBusinessProcessForOrder } = await import('@/lib/services/business-process.service')
    const process = await getBusinessProcessForOrder(existingOrder.id, actor.userId, RoleName.ADMIN)
    expect(process.order?.id).toBe(existingOrder.id)
  })
})
