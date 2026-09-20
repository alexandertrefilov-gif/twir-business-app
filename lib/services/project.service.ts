import { Prisma, type ProjectStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { BusinessRuleError, ConflictError, NotFoundError } from '@/lib/auth/permissions'
import { ProjectInputSchema, ProjectParticipantInputSchema } from '@/lib/validators/project.schema'

type Actor = { userId: string; userEmail: string }
const projectInclude = {
  customer: { select: { id: true, number: true, name: true } }, leadUser: { select: { id: true, firstName: true, lastName: true } },
  participants: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, status: true, deletedAt: true } } } },
  offers: { where: { deletedAt: null }, select: { id: true, offerNumber: true, title: true, status: true } },
  orders: { where: { deletedAt: null }, select: { id: true, orderNumber: true, title: true, status: true, serviceReports: { select: { id: true, reportNumber: true, status: true } } } },
  invoices: { select: { id: true, invoiceNumber: true, status: true, totalGross: true } },
  documents: { where: { deletedAt: null }, select: { id: true, originalName: true, type: true, createdAt: true } },
  collaborationProject: { select: { id: true, projectNumber: true, name: true, status: true, healthStatus: true } },
} as const

async function projectOrThrow(id: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const project = await tx.project.findFirst({ where: { id, deletedAt: null }, include: projectInclude })
  if (!project) throw new NotFoundError('Projekt nicht gefunden')
  return project
}
async function activeCustomer(id: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const customer = await tx.customer.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
  if (!customer) throw new NotFoundError('Kunde nicht gefunden')
}
async function activeUser(id: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const user = await tx.user.findFirst({ where: { id, status: 'ACTIVE', deletedAt: null }, select: { id: true } })
  if (!user) throw new NotFoundError('Aktiver Benutzer nicht gefunden')
}
function assertDates(data: { plannedStart?: Date | null; plannedEnd?: Date | null; actualStart?: Date | null; actualEnd?: Date | null }) {
  if (data.plannedStart && data.plannedEnd && data.plannedStart > data.plannedEnd) throw new BusinessRuleError('Das geplante Ende liegt vor dem geplanten Beginn.')
  if (data.actualStart && data.actualEnd && data.actualStart > data.actualEnd) throw new BusinessRuleError('Das tatsächliche Ende liegt vor dem tatsächlichen Beginn.')
}

export async function getProject(id: string) { return projectOrThrow(id) }
export async function listProjects(params: { search?: string; status?: ProjectStatus } = {}) {
  const { search, status } = params
  return prisma.project.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search ? { OR: [
        { projectNumber: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ] } : {}),
    },
    include: { customer: { select: { number: true, name: true } }, leadUser: { select: { firstName: true, lastName: true } }, collaborationProject: { select: { id: true } } },
    orderBy: [{ status: 'asc' }, { projectNumber: 'asc' }],
  })
}
export async function listProjectsForCustomer(customerId: string) { return prisma.project.findMany({ where: { customerId, deletedAt: null }, select: { id: true, projectNumber: true, name: true }, orderBy: { projectNumber: 'asc' } }) }

export async function createProject(input: unknown, actor: Actor) {
  const data = ProjectInputSchema.parse(input); assertDates(data)
  try {
    return await prisma.$transaction(async tx => {
      await activeCustomer(data.customerId, tx); if (data.leadUserId) await activeUser(data.leadUserId, tx)
      const project = await tx.project.create({ data })
      if (data.leadUserId) await tx.projectParticipant.create({ data: { projectId: project.id, userId: data.leadUserId, role: 'PROJECT_LEAD' } })
      await buildAuditLogCreate(tx, { ...actor, action: 'CREATE', entityType: 'project', entityId: project.id, newValue: { projectNumber: project.projectNumber, customerId: project.customerId } })
      return project.id
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('Diese Projektnummer ist bereits vergeben.')
    }
    throw error
  }
}
export async function updateProject(id: string, input: unknown, actor: Actor) {
  const data = ProjectInputSchema.parse(input); assertDates(data)
  return prisma.$transaction(async tx => {
    const existing = await projectOrThrow(id, tx); if (existing.customerId !== data.customerId && (existing.offers.length || existing.orders.length || existing.invoices.length)) throw new BusinessRuleError('Der Kunde eines bereits zugeordneten Projekts kann nicht geändert werden.')
    await activeCustomer(data.customerId, tx); if (data.leadUserId) await activeUser(data.leadUserId, tx)
    const project = await tx.project.update({ where: { id }, data })
    await buildAuditLogCreate(tx, { ...actor, action: 'UPDATE', entityType: 'project', entityId: id, oldValue: { status: existing.status, customerId: existing.customerId }, newValue: { status: project.status, customerId: project.customerId } })
    return project
  })
}
export async function changeProjectStatus(id: string, status: ProjectStatus, actor: Actor) { const project = await projectOrThrow(id); return prisma.$transaction(async tx => { const value = await tx.project.update({ where: { id }, data: { status } }); await buildAuditLogCreate(tx, { ...actor, action: 'STATUS_CHANGE', entityType: 'project', entityId: id, oldValue: { status: project.status }, newValue: { status } }); return value }) }
export async function addProjectParticipant(projectId: string, input: unknown, actor: Actor) { const data = ProjectParticipantInputSchema.parse(input); return prisma.$transaction(async tx => { await projectOrThrow(projectId, tx); await activeUser(data.userId, tx); const existing = await tx.projectParticipant.findUnique({ where: { projectId_userId: { projectId, userId: data.userId } } }); if (existing) throw new ConflictError('Benutzer ist bereits Projektteilnehmer'); const participant = await tx.projectParticipant.create({ data: { projectId, ...data } }); await buildAuditLogCreate(tx, { ...actor, action: 'CREATE', entityType: 'project_participant', entityId: participant.id, newValue: { projectId, userId: data.userId, role: data.role } }); return participant }) }
export async function removeProjectParticipant(projectId: string, userId: string, actor: Actor) { return prisma.$transaction(async tx => { await projectOrThrow(projectId, tx); const item = await tx.projectParticipant.findUnique({ where: { projectId_userId: { projectId, userId } } }); if (!item) throw new NotFoundError('Projektteilnehmer nicht gefunden'); await tx.projectParticipant.delete({ where: { id: item.id } }); await buildAuditLogCreate(tx, { ...actor, action: 'DELETE', entityType: 'project_participant', entityId: item.id, oldValue: { projectId, userId } }) }) }

async function assign(projectId: string, kind: 'offer'|'order'|'invoice'|'document', id: string, actor: Actor, attach: boolean) {
  return prisma.$transaction(async tx => {
    const project = await projectOrThrow(projectId, tx)
    const record = kind === 'offer'
      ? await tx.offer.findUnique({ where: { id }, select: { id: true, customerId: true, projectId: true } })
      : kind === 'order'
        ? await tx.order.findUnique({ where: { id }, select: { id: true, customerId: true, projectId: true } })
        : kind === 'invoice'
          ? await tx.invoice.findUnique({ where: { id }, select: { id: true, customerId: true, projectId: true, order: { select: { projectId: true } } } })
          : await tx.document.findUnique({ where: { id }, select: { id: true, customerId: true, projectId: true, offer: { select: { customerId: true } }, order: { select: { customerId: true } }, invoice: { select: { customerId: true } }, customerPurchaseOrder: { select: { customerId: true } } } })
    if (!record) throw new NotFoundError('Zuzuordnendes Objekt nicht gefunden')
    const linkedCustomers = [record.customerId, 'offer' in record ? record.offer?.customerId : null, 'order' in record ? record.order?.customerId : null, 'invoice' in record ? record.invoice?.customerId : null, 'customerPurchaseOrder' in record ? record.customerPurchaseOrder?.customerId : null].filter(Boolean)
    if (attach && linkedCustomers.some(customerId => customerId !== project.customerId)) throw new BusinessRuleError('Objekt und Projekt gehören nicht zum selben Kunden')
    if (attach && kind === 'invoice') {
      const invoiceOrder = await tx.invoice.findUnique({ where: { id }, select: { order: { select: { projectId: true } } } })
      if (invoiceOrder?.order?.projectId && invoiceOrder.order.projectId !== projectId) throw new BusinessRuleError('Die Rechnung gehört zu einem Auftrag eines anderen Projekts')
    }
    if (!attach && record.projectId !== projectId) throw new NotFoundError('Objekt gehört nicht zu diesem Projekt')
    // Optimistische Bedingung auf den zuletzt gelesenen projectId-Wert:
    // verhindert, dass zwei parallele Zuordnungen desselben Objekts (z.B. zu
    // zwei unterschiedlichen Projekten) sich gegenseitig überschreiben.
    const newProjectId = attach ? projectId : null
    const where = { id, projectId: record.projectId }
    const data = { projectId: newProjectId }
    const updated = kind === 'offer' ? await tx.offer.updateMany({ where, data })
      : kind === 'order' ? await tx.order.updateMany({ where, data })
      : kind === 'invoice' ? await tx.invoice.updateMany({ where, data })
      : await tx.document.updateMany({ where, data })
    if (updated.count === 0) throw new ConflictError('Die Zuordnung wurde zwischenzeitlich geändert.')
    await buildAuditLogCreate(tx, { ...actor, action: 'UPDATE', entityType: kind, entityId: id, oldValue: { projectId: record.projectId ?? null }, newValue: { projectId: newProjectId } })
  })
}
export const assignOfferToProject = (projectId: string, offerId: string, actor: Actor) => assign(projectId, 'offer', offerId, actor, true)
export const removeOfferFromProject = (projectId: string, offerId: string, actor: Actor) => assign(projectId, 'offer', offerId, actor, false)
export const assignOrderToProject = (projectId: string, orderId: string, actor: Actor) => assign(projectId, 'order', orderId, actor, true)
export const removeOrderFromProject = (projectId: string, orderId: string, actor: Actor) => assign(projectId, 'order', orderId, actor, false)
export const assignInvoiceToProject = (projectId: string, invoiceId: string, actor: Actor) => assign(projectId, 'invoice', invoiceId, actor, true)
export const removeInvoiceFromProject = (projectId: string, invoiceId: string, actor: Actor) => assign(projectId, 'invoice', invoiceId, actor, false)
export const assignDocumentToProject = (projectId: string, documentId: string, actor: Actor) => assign(projectId, 'document', documentId, actor, true)
export const removeDocumentFromProject = (projectId: string, documentId: string, actor: Actor) => assign(projectId, 'document', documentId, actor, false)

export async function activateCollaboration(projectId: string, actor: Actor) { return prisma.$transaction(async tx => { const project = await projectOrThrow(projectId, tx); if (project.status === 'CANCELLED' || project.status === 'COMPLETED') throw new BusinessRuleError('Zusammenarbeit kann für dieses Projekt nicht aktiviert werden'); if (project.collaborationProject) return project.collaborationProject; const collaboration = await tx.collaborationProject.create({ data: { internalProjectId: project.id, projectNumber: project.projectNumber, name: project.name, description: project.description, location: project.location, building: project.building, floor: project.floor, area: project.area, plannedStart: project.plannedStart, plannedEnd: project.plannedEnd, active: true } }); await buildAuditLogCreate(tx, { ...actor, action: 'CREATE', entityType: 'collaboration_project', entityId: collaboration.id, newValue: { internalProjectId: project.id } }); return collaboration }) }

// ── Verknüpfung eines bestehenden CollaborationProject ────────
// Setzt ausschließlich die Relation (internalProjectId). Bestehende
// Collaboration-Inhalte (Name, Beschreibung, Standort, Memberships,
// Stages, Tasks, Checklists, Blockers, Approvals) bleiben unverändert.
export async function listLinkableCollaborationProjects() {
  return prisma.collaborationProject.findMany({
    where: { internalProjectId: null, active: true, deletedAt: null },
    select: { id: true, projectNumber: true, name: true, status: true },
    orderBy: { name: 'asc' },
  })
}

export async function linkExistingCollaborationProject(projectId: string, collaborationProjectId: string, actor: Actor) {
  try {
    return await prisma.$transaction(async tx => {
      const project = await projectOrThrow(projectId, tx)
      if (project.status === 'CANCELLED') throw new BusinessRuleError('Zusammenarbeit kann für dieses Projekt nicht verknüpft werden')
      const collaboration = await tx.collaborationProject.findFirst({ where: { id: collaborationProjectId, deletedAt: null, active: true } })
      if (!collaboration) throw new NotFoundError('Collaboration-Projekt nicht gefunden')
      // Idempotent: exakt dieselbe Verknüpfung besteht bereits.
      if (project.collaborationProject?.id === collaborationProjectId) return collaboration
      if (project.collaborationProject) throw new ConflictError('Projekt ist bereits mit einer anderen Zusammenarbeit verbunden')
      if (collaboration.internalProjectId) throw new ConflictError('Collaboration-Projekt ist bereits mit einem anderen internen Projekt verbunden')
      const updated = await tx.collaborationProject.update({ where: { id: collaborationProjectId }, data: { internalProjectId: project.id } })
      await buildAuditLogCreate(tx, { ...actor, action: 'UPDATE', entityType: 'collaboration_project', entityId: collaborationProjectId, oldValue: { internalProjectId: null }, newValue: { internalProjectId: project.id } })
      return updated
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('Diese Zusammenarbeit wurde inzwischen einem anderen Projekt zugeordnet.')
    }
    throw error
  }
}

// ── DELETE-SAFETY-001: kontrollierte Projektlöschung ───────────
// Soft Delete über das bereits vorhandene, bislang ungenutzte deletedAt-Feld
// (siehe listProjects/getProject, die bereits deletedAt:null filtern) statt
// echtem prisma.project.delete() — kein Cascade über die im Schema
// definierten SetNull-Relationen (Offer/Order/Invoice/Document) hinaus.
// Blockiert vollständig, sobald geschäftliche Vorgänge ODER eine
// Zusammenarbeit verknüpft sind — kein stilles Orphaning, kein Cascade in
// CollaborationProject/GGA. Nimmt bewusst das bereits geladene
// projectInclude-Ergebnis entgegen, damit die Projektseite (die das Projekt
// ohnehin lädt) keine zusätzliche Query für die Anzeige der Blocker braucht.
export type ProjectWithRelations = Awaited<ReturnType<typeof projectOrThrow>>
export function getProjectDeleteBlockers(project: ProjectWithRelations): string[] {
  const reasons: string[] = []
  const orderCount = project.orders.length
  if (orderCount > 0) reasons.push(`${orderCount} ${orderCount === 1 ? 'Auftrag' : 'Aufträge'}`)
  const serviceCount = project.orders.reduce((sum, o) => sum + o.serviceReports.length, 0)
  if (serviceCount > 0) reasons.push(`${serviceCount} ${serviceCount === 1 ? 'Leistung' : 'Leistungen'}`)
  const offerCount = project.offers.length
  if (offerCount > 0) reasons.push(`${offerCount} ${offerCount === 1 ? 'Angebot' : 'Angebote'}`)
  const invoiceCount = project.invoices.length
  if (invoiceCount > 0) reasons.push(`${invoiceCount} ${invoiceCount === 1 ? 'Rechnung' : 'Rechnungen'}`)
  const documentCount = project.documents.length
  if (documentCount > 0) reasons.push(`${documentCount} ${documentCount === 1 ? 'Dokument' : 'Dokumente'}`)
  if (project.collaborationProject) reasons.push('Zusammenarbeit aktiv')
  return reasons
}

export async function deleteProject(projectId: string, confirmedProjectNumber: string, actor: Actor) {
  return prisma.$transaction(async tx => {
    // Serverseitig frisch geladen (nicht der ggf. veraltete Stand der UI) —
    // die Bestätigung und der Abhängigkeits-Check gelten für den aktuellen
    // Zustand, nicht für einen möglicherweise überholten Client-Snapshot.
    const project = await projectOrThrow(projectId, tx)
    if (confirmedProjectNumber !== project.projectNumber) {
      throw new BusinessRuleError('Die eingegebene Projektnummer stimmt nicht mit der Projektnummer dieses Projekts überein.')
    }
    const blockers = getProjectDeleteBlockers(project)
    if (blockers.length > 0) {
      throw new BusinessRuleError(`Dieses Projekt kann nicht gelöscht werden, weil bereits geschäftliche Vorgänge damit verknüpft sind:\n${blockers.join('\n')}`)
    }
    // updateMany mit deletedAt:null-Guard statt update(): eine doppelte
    // Löschanfrage (T11, z.B. Doppelklick/Retry) findet beim zweiten Versuch
    // count===0 und beendet sich sauber, ohne Fehler oder doppelten Audit-Eintrag.
    const result = await tx.project.updateMany({ where: { id: projectId, deletedAt: null }, data: { deletedAt: new Date() } })
    if (result.count === 0) return
    await buildAuditLogCreate(tx, {
      ...actor,
      action: 'DELETE',
      entityType: 'project',
      entityId: projectId,
      oldValue: { projectNumber: project.projectNumber, name: project.name },
    })
  })
}

// ── DELETE-SAFETY-004: kontrollierter Rückbau Internal Project ↔ Collaboration ──
// "Zusammenarbeit aufheben" ist bewusst das genaue Gegenstück zu
// linkExistingCollaborationProject(): setzt ausschließlich
// CollaborationProject.internalProjectId zurück auf null. Kein Soft/Hard
// Delete des CollaborationProject, kein Cascade — Memberships/Stages/Tasks/
// Checklisten/Blocker/Freigaben/Dokumente/GGA-Schränke/Prüfnachweise bleiben
// vollständig erhalten. Ein derart "gelöstes" CollaborationProject erscheint
// danach wieder in listLinkableCollaborationProjects() (dieselbe
// internalProjectId:null-Bedingung) — die Zusammenarbeit selbst geht nicht
// verloren, sie ist nur nicht mehr an dieses interne Projekt gebunden.
//
// Blocker-Kriterien: Stages und Memberships werden bewusst NICHT geprüft —
// beide entstehen automatisch bei jeder Aktivierung (activateCollaboration/
// ensureActorMembership) und würden sonst jede jemals aktivierte
// Zusammenarbeit permanent unlösbar machen, auch eine faktisch leere. Audit-
// Historie wird nicht geprüft, da sie durch das Aufheben nicht verändert
// oder unerreichbar wird (AuditLog ist ohnehin unveränderlich).
async function getCollaborationReleaseBlockers(collaborationProjectId: string, tx: Prisma.TransactionClient | typeof prisma = prisma): Promise<string[]> {
  const [cabinetCount, taskCount, checklistCount, openBlockerCount, approvalCount, documentCount, pruefnachweisCount] = await Promise.all([
    tx.ggaCabinet.count({ where: { projectId: collaborationProjectId, deletedAt: null } }),
    tx.collaborationTask.count({ where: { projectId: collaborationProjectId } }),
    tx.collaborationChecklistItem.count({ where: { projectId: collaborationProjectId } }),
    tx.collaborationBlocker.count({ where: { projectId: collaborationProjectId, status: 'OPEN' } }),
    tx.collaborationApproval.count({ where: { projectId: collaborationProjectId } }),
    tx.collaborationDocument.count({ where: { projectId: collaborationProjectId, deletedAt: null } }),
    tx.ggaCabinetPruefnachweis.count({ where: { cabinet: { projectId: collaborationProjectId } } }),
  ])
  const reasons: string[] = []
  if (cabinetCount > 0) reasons.push(`${cabinetCount} ${cabinetCount === 1 ? 'GGA-Schrank' : 'GGA-Schränke'}`)
  if (taskCount > 0) reasons.push(`${taskCount} ${taskCount === 1 ? 'Aufgabe' : 'Aufgaben'}`)
  if (checklistCount > 0) reasons.push(`${checklistCount} ${checklistCount === 1 ? 'Checklistenpunkt' : 'Checklistenpunkte'}`)
  if (openBlockerCount > 0) reasons.push(`${openBlockerCount} ${openBlockerCount === 1 ? 'offener Blocker' : 'offene Blocker'}`)
  if (approvalCount > 0) reasons.push(`${approvalCount} ${approvalCount === 1 ? 'Freigabe' : 'Freigaben'}`)
  if (documentCount > 0) reasons.push(`${documentCount} ${documentCount === 1 ? 'Dokument' : 'Dokumente'}`)
  if (pruefnachweisCount > 0) reasons.push(`${pruefnachweisCount} ${pruefnachweisCount === 1 ? 'Prüfnachweis' : 'Prüfnachweise'}`)
  return reasons
}

// Für die UI: dieselbe Prüfung, ohne zu mutieren — damit vorab entschieden
// werden kann, ob FALL A (blockiert) oder FALL B (bestätigbar) angezeigt wird.
export async function getCollaborationReleaseBlockersFor(collaborationProjectId: string): Promise<string[]> {
  return getCollaborationReleaseBlockers(collaborationProjectId)
}

export async function releaseCollaboration(projectId: string, confirmedProjectNumber: string, actor: Actor) {
  return prisma.$transaction(async tx => {
    const project = await projectOrThrow(projectId, tx)
    if (confirmedProjectNumber !== project.projectNumber) {
      throw new BusinessRuleError('Die eingegebene Projektnummer stimmt nicht mit der Projektnummer dieses Projekts überein.')
    }
    // Idempotent: bereits aufgehoben (z.B. durch eine parallele Anfrage,
    // die inzwischen committet hat) — sauberer No-op statt Fehler.
    if (!project.collaborationProject) return

    const collaborationId = project.collaborationProject.id
    const blockers = await getCollaborationReleaseBlockers(collaborationId, tx)
    if (blockers.length > 0) {
      throw new BusinessRuleError(`Die Zusammenarbeit kann derzeit nicht aufgehoben werden, weil bereits fachliche Daten vorhanden sind:\n${blockers.join('\n')}`)
    }

    // updateMany mit internalProjectId-Guard statt update(): eine doppelte/
    // parallele Aufhebungsanfrage findet beim zweiten Versuch count===0 und
    // beendet sich sauber, ohne Fehler oder doppelten Audit-Eintrag.
    const result = await tx.collaborationProject.updateMany({
      where: { id: collaborationId, internalProjectId: projectId },
      data: { internalProjectId: null },
    })
    if (result.count === 0) return

    await buildAuditLogCreate(tx, {
      ...actor,
      action: 'UPDATE',
      entityType: 'collaboration_project',
      entityId: collaborationId,
      oldValue: { internalProjectId: projectId },
      newValue: { internalProjectId: null },
      metadata: { reason: 'Zusammenarbeit vom internen Projekt aufgehoben' },
    })
  })
}
