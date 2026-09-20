import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { OfferStatus, OrderStatus } from '@/types/enums'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Business → Collaboration Handover V1: prüft den kanonischen Trigger
// (Order-Entstehung, NICHT Offer.status === 'ACCEPTED' allein), die
// Idempotenz-Szenarien T1-T12 aus dem Auftrag sowie die Isolation zu GGA V1
// (Referenzstand d41e55a) auf der echten Test-DB — bewusst nicht gemockt,
// da hier reale Unique-Constraints (Project.projectNumber,
// CollaborationProject.internalProjectId, CollaborationMembership
// @@unique([userId, projectId])) und echte Transaktionsgrenzen greifen.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

describe.skipIf(!RUN_INTEGRATION)('Business → Collaboration Handover V1 — Datenbankintegration', () => {
  let db: any
  let handover: typeof import('@/lib/services/collaboration-handover.service')
  let orderService: typeof import('@/lib/services/order.service')
  let offerService: typeof import('@/lib/services/offer.service')
  let purchaseOrderService: typeof import('@/lib/services/customer-purchase-order.service')
  let projectService: typeof import('@/lib/services/project.service')
  let actor: { userId: string; userEmail: string }
  const marker = `HANDOVER-QA-${Date.now()}-${Math.random().toString(16).slice(2)}`

  let customerId = ''
  const createdOrderIds: string[] = []
  const createdOfferIds: string[] = []
  const createdProjectIds: string[] = []
  const createdCollaborationIds: string[] = []

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const user = await db.user.create({ data: { email: `${marker}@example.invalid`, passwordHash: 'not-used', firstName: 'Handover', lastName: 'QA', roleId: role.id } })
    actor = { userId: user.id, userEmail: user.email }

    const customer = await db.customer.create({ data: { number: `${marker}-KD`, name: `${marker} Testkunde` } })
    customerId = customer.id

    handover = await import('@/lib/services/collaboration-handover.service')
    orderService = await import('@/lib/services/order.service')
    offerService = await import('@/lib/services/offer.service')
    purchaseOrderService = await import('@/lib/services/customer-purchase-order.service')
    projectService = await import('@/lib/services/project.service')
  })

  afterAll(async () => {
    if (!db) return
    if (createdCollaborationIds.length) {
      await db.collaborationMembership.deleteMany({ where: { projectId: { in: createdCollaborationIds } } })
      await db.collaborationProject.deleteMany({ where: { id: { in: createdCollaborationIds } } })
    }
    await db.auditLog.deleteMany({ where: { userId: actor.userId } })
    if (createdOrderIds.length) {
      await db.customerPurchaseOrder.deleteMany({ where: { orderId: { in: createdOrderIds } } })
      await db.order.deleteMany({ where: { id: { in: createdOrderIds } } })
    }
    if (createdOfferIds.length) {
      await db.customerPurchaseOrder.deleteMany({ where: { offerId: { in: createdOfferIds } } })
      await db.offer.deleteMany({ where: { id: { in: createdOfferIds } } })
    }
    if (createdProjectIds.length) await db.project.deleteMany({ where: { id: { in: createdProjectIds } } })
    await db.customer.deleteMany({ where: { id: customerId } })
    await db.user.deleteMany({ where: { id: actor.userId } })
    await db.$disconnect()
  })

  async function createDirectOrder(titleSuffix: string) {
    const orderId = await orderService.createOrder(
      { customerId, title: `${marker} Auftrag ${titleSuffix}`, orderDate: new Date(), items: [] },
      actor.userId, actor.userEmail,
    )
    createdOrderIds.push(orderId)
    return orderId
  }

  it('T5/T1: direkter createOrder() ohne Project erzeugt beim Handover genau ein Project, ein CollaborationProject und eine Membership für den Actor', async () => {
    const orderId = await createDirectOrder('Direkt')
    const result = await handover.ensureCollaborationForOrder(orderId, actor)
    expect(result.status).toBe('linked')
    expect(result.projectId).toBeTruthy()
    expect(result.collaborationProjectId).toBeTruthy()
    createdProjectIds.push(result.projectId!)
    createdCollaborationIds.push(result.collaborationProjectId!)

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { projectId: true } })
    expect(order.projectId).toBe(result.projectId)

    const project = await db.project.findUniqueOrThrow({ where: { id: result.projectId }, select: { collaborationProject: { select: { id: true } }, customerId: true } })
    expect(project.collaborationProject?.id).toBe(result.collaborationProjectId)
    expect(project.customerId).toBe(customerId)

    const memberships = await db.collaborationMembership.findMany({ where: { projectId: result.collaborationProjectId, userId: actor.userId } })
    expect(memberships).toHaveLength(1)
    expect(memberships[0].role).toBe('COLLAB_MANAGER')
    expect(memberships[0].active).toBe(true)
  })

  it('T2/T8: derselbe Handover erneut aufgerufen bleibt bei genau 1 Project/1 CollaborationProject/1 Membership (keine Dopplung)', async () => {
    const orderId = createdOrderIds[0]
    const first = await handover.ensureCollaborationForOrder(orderId, actor)

    const second = await handover.ensureCollaborationForOrder(orderId, actor)
    expect(second.status).toBe('linked')
    expect(second.projectId).toBe(first.projectId)
    expect(second.collaborationProjectId).toBe(first.collaborationProjectId)

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true } })
    const matchingProjects = await db.project.findMany({ where: { projectNumber: order.orderNumber } })
    expect(matchingProjects).toHaveLength(1)
    expect(matchingProjects[0].id).toBe(first.projectId)

    const memberships = await db.collaborationMembership.findMany({ where: { projectId: first.collaborationProjectId, userId: actor.userId } })
    expect(memberships).toHaveLength(1)
  })

  it('T6: Order mit bereits vorhandenem projectId verwendet das bestehende Project statt ein neues anzulegen', async () => {
    const preExistingProjectId = await projectService.createProject(
      { projectNumber: `${marker}-PRELINKED`, name: `${marker} Vorverknüpft`, customerId, status: 'ACTIVE' },
      actor,
    )
    createdProjectIds.push(preExistingProjectId)

    const orderId = await orderService.createOrder(
      { customerId, title: `${marker} Auftrag Vorverknüpft`, orderDate: new Date(), items: [] },
      actor.userId, actor.userEmail,
    )
    createdOrderIds.push(orderId)
    await projectService.assignOrderToProject(preExistingProjectId, orderId, actor)

    const result = await handover.ensureCollaborationForOrder(orderId, actor)
    expect(result.status).toBe('linked')
    expect(result.projectId).toBe(preExistingProjectId)
    createdCollaborationIds.push(result.collaborationProjectId!)

    const allProjectsWithThisNumber = await db.project.findMany({ where: { projectNumber: `${marker}-PRELINKED` } })
    expect(allProjectsWithThisNumber).toHaveLength(1)
  })

  it('T7/T11: Project mit bereits manuell verknüpftem, individuell benanntem CollaborationProject wird wiederverwendet und NICHT überschrieben', async () => {
    const preExistingProjectId = await projectService.createProject(
      { projectNumber: `${marker}-MANUAL`, name: `${marker} Manuell`, customerId, status: 'ACTIVE' },
      actor,
    )
    createdProjectIds.push(preExistingProjectId)
    const manualCollab = await db.collaborationProject.create({
      data: { projectNumber: `${marker}-MANUAL-CP`, name: 'Manuell benanntes Collab-Projekt', description: 'Von Hand gepflegt', internalProjectId: preExistingProjectId, active: true },
    })
    createdCollaborationIds.push(manualCollab.id)

    const orderId = await orderService.createOrder(
      { customerId, title: `${marker} Auftrag Manuell`, orderDate: new Date(), items: [] },
      actor.userId, actor.userEmail,
    )
    createdOrderIds.push(orderId)
    await projectService.assignOrderToProject(preExistingProjectId, orderId, actor)

    const result = await handover.ensureCollaborationForOrder(orderId, actor)
    expect(result.status).toBe('linked')
    expect(result.collaborationProjectId).toBe(manualCollab.id)

    const unchanged = await db.collaborationProject.findUniqueOrThrow({ where: { id: manualCollab.id }, select: { name: true, description: true } })
    expect(unchanged.name).toBe('Manuell benanntes Collab-Projekt')
    expect(unchanged.description).toBe('Von Hand gepflegt')
  })

  it('T3: Offer.status === ACCEPTED allein erzeugt noch KEIN CollaborationProject', async () => {
    const offerId = await offerService.createOffer(
      { customerId, offerDate: new Date(), items: [{ position: 1, description: `${marker} Position`, quantity: 1, unit: 'Stk.', unitPrice: 100, taxRate: 19 }] },
      actor.userId, actor.userEmail,
    )
    createdOfferIds.push(offerId)
    await offerService.changeOfferStatus(offerId, OfferStatus.SENT, actor.userId, actor.userEmail)
    await offerService.changeOfferStatus(offerId, OfferStatus.ACCEPTED, actor.userId, actor.userEmail)

    const offer = await db.offer.findUniqueOrThrow({ where: { id: offerId }, select: { status: true, projectId: true } })
    expect(offer.status).toBe('ACCEPTED')
    expect(offer.projectId).toBeNull()
    // Kein Order, kein Project, kein CollaborationProject — Annahme allein löst nichts aus.
    const relatedProjects = await db.project.findMany({ where: { projectNumber: { startsWith: `${marker}-ACCEPT-ONLY` } } })
    expect(relatedProjects).toHaveLength(0)
  })

  it('T4: convertOfferToOrder() aus einem angenommenen Angebot löst den Handover automatisch aus', async () => {
    const offerId = await offerService.createOffer(
      { customerId, offerDate: new Date(), items: [{ position: 1, description: `${marker} Position B`, quantity: 1, unit: 'Stk.', unitPrice: 250, taxRate: 19 }] },
      actor.userId, actor.userEmail,
    )
    createdOfferIds.push(offerId)
    await offerService.changeOfferStatus(offerId, OfferStatus.SENT, actor.userId, actor.userEmail)
    await offerService.changeOfferStatus(offerId, OfferStatus.ACCEPTED, actor.userId, actor.userEmail)
    const orderId = await offerService.convertOfferToOrder(offerId, actor.userId, actor.userEmail)
    createdOrderIds.push(orderId)

    // Wie in convertToOrderAction(): Handover wird nach erfolgreicher
    // Order-Entstehung separat aufgerufen (siehe TRANSACTION BOUNDARY).
    const result = await handover.ensureCollaborationForOrder(orderId, actor)
    expect(result.status).toBe('linked')
    createdProjectIds.push(result.projectId!)
    createdCollaborationIds.push(result.collaborationProjectId!)

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { projectId: true, offerId: true } })
    expect(order.offerId).toBe(offerId)
    expect(order.projectId).toBe(result.projectId)
  })

  it('T9: erneutes Hochladen einer Kundenbestellung erzeugt kein zusätzliches Project/CollaborationProject', async () => {
    const offerId = await offerService.createOffer(
      { customerId, offerDate: new Date(), items: [{ position: 1, description: `${marker} Position C`, quantity: 1, unit: 'Stk.', unitPrice: 50, taxRate: 19 }] },
      actor.userId, actor.userEmail,
    )
    createdOfferIds.push(offerId)
    await offerService.changeOfferStatus(offerId, OfferStatus.SENT, actor.userId, actor.userEmail)

    await purchaseOrderService.saveCustomerPurchaseOrder({ offerId, orderNumber: `${marker}-PO-1`, orderDate: new Date(), acceptOffer: true, actor })
    await purchaseOrderService.saveCustomerPurchaseOrder({ offerId, orderNumber: `${marker}-PO-1-UPDATED`, orderDate: new Date(), acceptOffer: true, actor })

    const purchaseOrders = await db.customerPurchaseOrder.findMany({ where: { offerId } })
    expect(purchaseOrders).toHaveLength(1)
    expect(purchaseOrders[0].orderNumber).toBe(`${marker}-PO-1-UPDATED`)
    // Das Hochladen einer Kundenbestellung allein löst — wie die reine
    // Angebotsannahme (T3) — keinen Handover aus; erst ein tatsächlich
    // entstandener Order tut das (kanonischer Trigger, Abschnitt 1).
    const relatedProjects = await db.project.findMany({ where: { projectNumber: `${marker}-PO-1-UPDATED` } })
    expect(relatedProjects).toHaveLength(0)
  })

  it('T10: Order.CANCELLED ändert das bereits verknüpfte CollaborationProject nicht automatisch', async () => {
    const orderId = await createDirectOrder('Storno')
    const result = await handover.ensureCollaborationForOrder(orderId, actor)
    createdProjectIds.push(result.projectId!)
    createdCollaborationIds.push(result.collaborationProjectId!)

    const before = await db.collaborationProject.findUniqueOrThrow({ where: { id: result.collaborationProjectId }, select: { status: true, active: true, deletedAt: true } })

    await orderService.changeOrderStatus(orderId, OrderStatus.CANCELLED, actor.userId, actor.userEmail)
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
    expect(order.status).toBe('CANCELLED')

    const after = await db.collaborationProject.findUniqueOrThrow({ where: { id: result.collaborationProjectId }, select: { status: true, active: true, deletedAt: true } })
    expect(after).toEqual(before)
  })

  it('T12 (Robustheits-Review): zwei nahezu gleichzeitige Handover-Versuche für denselben, noch unverknüpften Order sind beide fulfilled und liefern dasselbe fachliche Ergebnis — DB-seitig exakt 1 Project/1 CollaborationProject/1 Membership', async () => {
    const orderId = await createDirectOrder('Race')
    const [first, second] = await Promise.allSettled([
      handover.ensureCollaborationForOrder(orderId, actor),
      handover.ensureCollaborationForOrder(orderId, actor),
    ])
    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('fulfilled')
    const firstValue = (first as PromiseFulfilledResult<any>).value
    const secondValue = (second as PromiseFulfilledResult<any>).value
    expect(firstValue.status).toBe('linked')
    expect(secondValue.status).toBe('linked')
    expect(secondValue.projectId).toBe(firstValue.projectId)
    expect(secondValue.collaborationProjectId).toBe(firstValue.collaborationProjectId)
    createdProjectIds.push(firstValue.projectId)
    createdCollaborationIds.push(firstValue.collaborationProjectId)

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true, projectId: true } })
    expect(order.projectId).toBe(firstValue.projectId)
    const matchingProjects = await db.project.findMany({ where: { projectNumber: order.orderNumber } })
    expect(matchingProjects).toHaveLength(1)

    const collaborationProjects = await db.collaborationProject.findMany({ where: { internalProjectId: matchingProjects[0].id } })
    expect(collaborationProjects).toHaveLength(1)

    const memberships = await db.collaborationMembership.findMany({ where: { projectId: firstValue.collaborationProjectId, userId: actor.userId } })
    expect(memberships).toHaveLength(1)
  })

  it('Robustheits-Review: eine projectNumber-Kollision mit einem FREMDEN, unabhängigen Project wird niemals automatisch übernommen — sauberer Konflikt statt falscher Order-Verknüpfung', async () => {
    const orderId = await createDirectOrder('Fremdkollision')
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true } })

    const otherCustomer = await db.customer.create({ data: { number: `${marker}-KD-FREMD`, name: `${marker} Fremdkunde` } })
    const foreignProject = await db.project.create({
      data: { projectNumber: order.orderNumber, name: 'Fremdes, unabhängiges Project', customerId: otherCustomer.id, status: 'ACTIVE' },
    })

    const result = await handover.ensureCollaborationForOrder(orderId, actor)
    expect(result.status).toBe('failed')
    expect(result.error).toBeTruthy()

    const untouchedOrder = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { projectId: true } })
    expect(untouchedOrder.projectId).toBeNull()
    const untouchedForeignProject = await db.project.findUniqueOrThrow({ where: { id: foreignProject.id }, select: { collaborationProject: { select: { id: true } } } })
    expect(untouchedForeignProject.collaborationProject).toBeNull()

    await db.project.deleteMany({ where: { id: foreignProject.id } })
    await db.customer.deleteMany({ where: { id: otherCustomer.id } })
  })

  it('schützt GGA V1 (Referenzstand d41e55a): das automatisch erzeugte CollaborationProject enthält keinerlei GgaCabinet und keinen abweichenden Status', async () => {
    const orderId = await createDirectOrder('GGA-Isolation')
    const result = await handover.ensureCollaborationForOrder(orderId, actor)
    createdProjectIds.push(result.projectId!)
    createdCollaborationIds.push(result.collaborationProjectId!)

    const collaboration = await db.collaborationProject.findUniqueOrThrow({
      where: { id: result.collaborationProjectId },
      select: { status: true, ggaCabinets: { select: { id: true } } },
    })
    expect(collaboration.status).toBe('DRAFT')
    expect(collaboration.ggaCabinets).toHaveLength(0)
  })
})
