import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { OfferStatus, OrderStatus, RoleName } from '@/types/enums'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Business → Project → Collaboration Release: prüft den kanonischen Trigger
// für die Project-Erzeugung (Order-Entstehung, NICHT Offer.status ===
// 'ACCEPTED' allein), dass Collaboration NICHT mehr automatisch aktiviert
// wird, die bewusste Freigabe-Aktion (activateCollaboration() +
// ensureActorMembership(), wie activateProjectCollaborationAction), die
// Idempotenz-/Race-Szenarien T1-T14 sowie die Isolation zu GGA V1
// (Referenzstand d41e55a) — bewusst nicht gemockt, da hier reale Unique-
// Constraints (Project.projectNumber, CollaborationProject.
// internalProjectId, CollaborationMembership @@unique([userId, projectId]))
// und echte Transaktionsgrenzen greifen.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

describe.skipIf(!RUN_INTEGRATION)('Business → Project → Collaboration Release — Datenbankintegration', () => {
  let db: any
  let handover: typeof import('@/lib/services/collaboration-handover.service')
  let orderService: typeof import('@/lib/services/order.service')
  let offerService: typeof import('@/lib/services/offer.service')
  let projectService: typeof import('@/lib/services/project.service')
  let businessProcessService: typeof import('@/lib/services/business-process.service')
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
    projectService = await import('@/lib/services/project.service')
    businessProcessService = await import('@/lib/services/business-process.service')
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

  // Spiegelt exakt activateProjectCollaborationAction() (app/(dashboard)/
  // projects/actions.ts): ausschließlich die bestehende activateCollaboration()
  // plus dieselbe, einzige ensureActorMembership()-Funktion — keine zweite
  // Collaboration-Erzeugungslogik im Test.
  async function releaseForCollaboration(projectId: string) {
    const collaboration = await projectService.activateCollaboration(projectId, actor)
    await handover.ensureActorMembership(collaboration.id, actor)
    return collaboration
  }

  it('T1: direkter createOrder() ohne Project — ensureProjectForOrder() erzeugt genau ein Project, aber KEIN CollaborationProject', async () => {
    const orderId = await createDirectOrder('Direkt')
    const result = await handover.ensureProjectForOrder(orderId, actor)
    expect(result.status).toBe('linked')
    expect(result.projectId).toBeTruthy()
    createdProjectIds.push(result.projectId!)

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { projectId: true } })
    expect(order.projectId).toBe(result.projectId)

    const project = await db.project.findUniqueOrThrow({ where: { id: result.projectId }, select: { collaborationProject: { select: { id: true } }, customerId: true } })
    expect(project.collaborationProject).toBeNull()
    expect(project.customerId).toBe(customerId)
  })

  it('T2: Offer → Order (convertOfferToOrder()) — Project automatisch erzeugt, weiterhin KEIN CollaborationProject', async () => {
    const offerId = await offerService.createOffer(
      { customerId, offerDate: new Date(), items: [{ position: 1, description: `${marker} Position B`, quantity: 1, unit: 'Stk.', unitPrice: 250, taxRate: 19 }] },
      actor.userId, actor.userEmail,
    )
    createdOfferIds.push(offerId)
    await offerService.changeOfferStatus(offerId, OfferStatus.SENT, actor.userId, actor.userEmail)
    await offerService.changeOfferStatus(offerId, OfferStatus.ACCEPTED, actor.userId, actor.userEmail)
    const orderId = await offerService.convertOfferToOrder(offerId, actor.userId, actor.userEmail)
    createdOrderIds.push(orderId)

    // Wie in convertToOrderAction(): der Project-Handover läuft nach
    // erfolgreicher Order-Entstehung separat (siehe TRANSACTION BOUNDARY).
    const result = await handover.ensureProjectForOrder(orderId, actor)
    expect(result.status).toBe('linked')
    createdProjectIds.push(result.projectId!)

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { projectId: true, offerId: true } })
    expect(order.offerId).toBe(offerId)
    expect(order.projectId).toBe(result.projectId)

    const project = await db.project.findUniqueOrThrow({ where: { id: result.projectId }, select: { collaborationProject: { select: { id: true } } } })
    expect(project.collaborationProject).toBeNull()
  })

  it('T3: Offer.status === ACCEPTED allein erzeugt kein Project und kein CollaborationProject', async () => {
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
  })

  it('T4: Order mit bereits vorhandenem projectId verwendet das bestehende Project statt ein neues anzulegen', async () => {
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

    const result = await handover.ensureProjectForOrder(orderId, actor)
    expect(result.status).toBe('linked')
    expect(result.projectId).toBe(preExistingProjectId)

    const allProjectsWithThisNumber = await db.project.findMany({ where: { projectNumber: `${marker}-PRELINKED` } })
    expect(allProjectsWithThisNumber).toHaveLength(1)
  })

  it('T5: wiederholtes ensureProjectForOrder() für denselben Order bleibt bei genau 1 Project', async () => {
    const orderId = createdOrderIds[0]
    const first = await handover.ensureProjectForOrder(orderId, actor)
    const second = await handover.ensureProjectForOrder(orderId, actor)
    expect(second.projectId).toBe(first.projectId)

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true } })
    const matchingProjects = await db.project.findMany({ where: { projectNumber: order.orderNumber } })
    expect(matchingProjects).toHaveLength(1)
  })

  it('T6: zwei nahezu gleichzeitige ensureProjectForOrder() für denselben, noch unverknüpften Order erhalten dasselbe Project — genau 1 Project, keine Collaboration', async () => {
    const orderId = await createDirectOrder('Race')
    const [first, second] = await Promise.allSettled([
      handover.ensureProjectForOrder(orderId, actor),
      handover.ensureProjectForOrder(orderId, actor),
    ])
    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('fulfilled')
    const firstValue = (first as PromiseFulfilledResult<any>).value
    const secondValue = (second as PromiseFulfilledResult<any>).value
    expect(firstValue.status).toBe('linked')
    expect(secondValue.status).toBe('linked')
    expect(secondValue.projectId).toBe(firstValue.projectId)
    createdProjectIds.push(firstValue.projectId)

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true, projectId: true } })
    expect(order.projectId).toBe(firstValue.projectId)
    const matchingProjects = await db.project.findMany({ where: { projectNumber: order.orderNumber } })
    expect(matchingProjects).toHaveLength(1)

    const project = await db.project.findUniqueOrThrow({ where: { id: firstValue.projectId }, select: { collaborationProject: { select: { id: true } } } })
    expect(project.collaborationProject).toBeNull()
  })

  it('T7: eine projectNumber-Kollision mit einem FREMDEN, unabhängigen Project wird niemals automatisch übernommen — sauberer Konflikt statt falscher Order-Verknüpfung', async () => {
    const orderId = await createDirectOrder('Fremdkollision')
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { orderNumber: true } })

    const otherCustomer = await db.customer.create({ data: { number: `${marker}-KD-FREMD`, name: `${marker} Fremdkunde` } })
    const foreignProject = await db.project.create({
      data: { projectNumber: order.orderNumber, name: 'Fremdes, unabhängiges Project', customerId: otherCustomer.id, status: 'ACTIVE' },
    })

    const result = await handover.ensureProjectForOrder(orderId, actor)
    expect(result.status).toBe('failed')
    expect(result.error).toBeTruthy()

    const untouchedOrder = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { projectId: true } })
    expect(untouchedOrder.projectId).toBeNull()

    await db.project.deleteMany({ where: { id: foreignProject.id } })
    await db.customer.deleteMany({ where: { id: otherCustomer.id } })
  })

  it('T8: bewusste Freigabe ("Für Zusammenarbeit freigeben") erzeugt genau 1 CollaborationProject und die Actor-Membership', async () => {
    const orderId = await createDirectOrder('Freigabe')
    const projectResult = await handover.ensureProjectForOrder(orderId, actor)
    createdProjectIds.push(projectResult.projectId!)

    const beforeRelease = await db.project.findUniqueOrThrow({ where: { id: projectResult.projectId }, select: { collaborationProject: { select: { id: true } } } })
    expect(beforeRelease.collaborationProject).toBeNull()

    const collaboration = await releaseForCollaboration(projectResult.projectId!)
    createdCollaborationIds.push(collaboration.id)

    const project = await db.project.findUniqueOrThrow({ where: { id: projectResult.projectId }, select: { collaborationProject: { select: { id: true } } } })
    expect(project.collaborationProject?.id).toBe(collaboration.id)

    const memberships = await db.collaborationMembership.findMany({ where: { projectId: collaboration.id, userId: actor.userId } })
    expect(memberships).toHaveLength(1)
    expect(memberships[0].role).toBe('COLLAB_MANAGER')
    expect(memberships[0].active).toBe(true)
  })

  it('T9: Freigabe zweimal ausgeführt bleibt bei genau 1 CollaborationProject und 1 Membership', async () => {
    const orderId = await createDirectOrder('Freigabe-Zweimal')
    const projectResult = await handover.ensureProjectForOrder(orderId, actor)
    createdProjectIds.push(projectResult.projectId!)

    const first = await releaseForCollaboration(projectResult.projectId!)
    createdCollaborationIds.push(first.id)
    const second = await releaseForCollaboration(projectResult.projectId!)
    expect(second.id).toBe(first.id)

    const collaborationProjects = await db.collaborationProject.findMany({ where: { internalProjectId: projectResult.projectId } })
    expect(collaborationProjects).toHaveLength(1)
    const memberships = await db.collaborationMembership.findMany({ where: { projectId: first.id, userId: actor.userId } })
    expect(memberships).toHaveLength(1)
  })

  it('T10: der AKTUELLE Project.name wird bei erstmaliger Freigabe verwendet — nicht der Name zum Zeitpunkt der Order-Anlage', async () => {
    const orderId = await createDirectOrder('Umbenannt')
    const projectResult = await handover.ensureProjectForOrder(orderId, actor)
    createdProjectIds.push(projectResult.projectId!)

    const renamedName = 'Mercedes-Benz Mettingen – Demontage ZK-Linie AgiPro-3'
    await projectService.updateProject(
      projectResult.projectId!,
      { projectNumber: `${marker}-RENAMED`, name: renamedName, customerId, status: 'ACTIVE' },
      actor,
    )

    const collaboration = await releaseForCollaboration(projectResult.projectId!)
    createdCollaborationIds.push(collaboration.id)

    expect(collaboration.name).toBe(renamedName)
    const persisted = await db.collaborationProject.findUniqueOrThrow({ where: { id: collaboration.id }, select: { name: true } })
    expect(persisted.name).toBe(renamedName)
  })

  it('T11: ein bestehendes, manuell gepflegtes CollaborationProject wird bei erneuter Freigabe NICHT umbenannt/überschrieben', async () => {
    const preExistingProjectId = await projectService.createProject(
      { projectNumber: `${marker}-MANUAL`, name: `${marker} Manuell`, customerId, status: 'ACTIVE' },
      actor,
    )
    createdProjectIds.push(preExistingProjectId)
    const manualCollab = await db.collaborationProject.create({
      data: { projectNumber: `${marker}-MANUAL-CP`, name: 'Manuell benanntes Collab-Projekt', description: 'Von Hand gepflegt', internalProjectId: preExistingProjectId, active: true },
    })
    createdCollaborationIds.push(manualCollab.id)

    const result = await releaseForCollaboration(preExistingProjectId)
    expect(result.id).toBe(manualCollab.id)

    const unchanged = await db.collaborationProject.findUniqueOrThrow({ where: { id: manualCollab.id }, select: { name: true, description: true } })
    expect(unchanged.name).toBe('Manuell benanntes Collab-Projekt')
    expect(unchanged.description).toBe('Von Hand gepflegt')
  })

  it('T12: Order.CANCELLED löscht das Project nicht automatisch und deaktiviert eine bereits bestehende Zusammenarbeit nicht automatisch', async () => {
    const orderId = await createDirectOrder('Storno')
    const projectResult = await handover.ensureProjectForOrder(orderId, actor)
    createdProjectIds.push(projectResult.projectId!)
    const collaboration = await releaseForCollaboration(projectResult.projectId!)
    createdCollaborationIds.push(collaboration.id)

    const beforeProject = await db.project.findUniqueOrThrow({ where: { id: projectResult.projectId }, select: { deletedAt: true, status: true } })
    const beforeCollaboration = await db.collaborationProject.findUniqueOrThrow({ where: { id: collaboration.id }, select: { status: true, active: true, deletedAt: true } })

    await orderService.changeOrderStatus(orderId, OrderStatus.CANCELLED, actor.userId, actor.userEmail)
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })
    expect(order.status).toBe('CANCELLED')

    const afterProject = await db.project.findUniqueOrThrow({ where: { id: projectResult.projectId }, select: { deletedAt: true, status: true } })
    const afterCollaboration = await db.collaborationProject.findUniqueOrThrow({ where: { id: collaboration.id }, select: { status: true, active: true, deletedAt: true } })
    expect(afterProject).toEqual(beforeProject)
    expect(afterCollaboration).toEqual(beforeCollaboration)
  })

  it('T13: Order-Seite (getBusinessProcessForOrder) zeigt vor Freigabe den Projektzugang, aber keinen falschen Collaboration-Zugang', async () => {
    const orderId = await createDirectOrder('UI-Vor-Freigabe')
    const projectResult = await handover.ensureProjectForOrder(orderId, actor)
    createdProjectIds.push(projectResult.projectId!)

    const process = await businessProcessService.getBusinessProcessForOrder(orderId, actor.userId, RoleName.ADMIN)
    expect(process.project?.id).toBe(projectResult.projectId)
    expect(process.project?.collaborationProjectId ?? null).toBeNull()
  })

  it('T14: Order-Seite (getBusinessProcessForOrder) zeigt nach Freigabe den Collaboration-Zugang', async () => {
    const orderId = await createDirectOrder('UI-Nach-Freigabe')
    const projectResult = await handover.ensureProjectForOrder(orderId, actor)
    createdProjectIds.push(projectResult.projectId!)
    const collaboration = await releaseForCollaboration(projectResult.projectId!)
    createdCollaborationIds.push(collaboration.id)

    const process = await businessProcessService.getBusinessProcessForOrder(orderId, actor.userId, RoleName.ADMIN)
    expect(process.project?.collaborationProjectId).toBe(collaboration.id)
  })

  it('schützt GGA V1 (Referenzstand d41e55a): ein via Freigabe aktiviertes CollaborationProject enthält keinerlei GgaCabinet und startet im unveränderten DRAFT-Status', async () => {
    const orderId = await createDirectOrder('GGA-Isolation')
    const projectResult = await handover.ensureProjectForOrder(orderId, actor)
    createdProjectIds.push(projectResult.projectId!)
    const collaboration = await releaseForCollaboration(projectResult.projectId!)
    createdCollaborationIds.push(collaboration.id)

    const persisted = await db.collaborationProject.findUniqueOrThrow({
      where: { id: collaboration.id },
      select: { status: true, ggaCabinets: { select: { id: true } } },
    })
    expect(persisted.status).toBe('DRAFT')
    expect(persisted.ggaCabinets).toHaveLength(0)
  })
})
