// lib/services/gga-cabinet.service.ts
// GGA-Cabinet-Foundation: Service-Layer für reale GGA-/Gefahrstoffschränke.
//
// Sicherheitsprinzip (IDOR): jede cabinetId wird serverseitig über
// requireCollaborationCabinetAccess zu ihrer projectId aufgelöst, BEVOR
// irgendeine Berechtigung geprüft wird. Eine vom Client mitgesendete
// projectId wird nie vertraut.
//
// Statusprinzip: GgaCabinet speichert keinen Planungs-/Montage-/Prüfstatus.
// Diese werden bei jedem Lesevorgang aus Tasks/Checklisten/Blockern/
// Approvals abgeleitet (lib/collaboration/cabinet-workflow.ts).

import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import {
  internalCollaborationRoles,
  requireCollaborationCabinetAccess,
  requireCollaborationProjectAccess,
  requireCollaborationSession,
  requireInternalCollaborationProjectAccess,
} from '@/lib/auth/collaboration-guards'
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/auth/permissions'
import { buildAuditLogCreate, writeAuditLog } from '@/lib/services/audit.service'
import { editorRoles, setCollaborationChecklistCompleted } from '@/lib/services/collaboration-phase2.service'
import {
  deriveCabinetStatus, deriveGgaCabinetControlTowerSummary, deriveGgaControlTowerOverview, deriveGgaProjectWorklist,
  type GgaCabinetSnapshot, type GgaControlTowerCabinetEntry,
} from '@/lib/collaboration/cabinet-workflow'
import { getVisibleCollaborationProjects } from '@/lib/services/collaboration-project.service'
import { Prisma } from '@prisma/client'

// Stammdaten-Pflege ist enger gefasst als die allgemeinen Collaboration-
// editorRoles: ein GGA-Schrank ist ein strukturelles Fachobjekt, vergleichbar
// mit der Phasenkonfiguration eines Projekts (restructureCollaborationProjectStages).
export const cabinetEditorRoles = ['COLLAB_MANAGER', 'INTERNAL_PLANNER'] as const

const decimalField = z.union([z.number(), z.string()]).transform((v) => new Prisma.Decimal(v))

const cabinetInputSchema = z.object({
  kennung: z.string().trim().min(1).max(50),
  bezeichnung: z.string().trim().min(1).max(200),
  herstellerName: z.string().trim().max(200).nullable().optional(),
  herstellerTyp: z.string().trim().max(200).nullable().optional(),
  seriennummer: z.string().trim().max(200).nullable().optional(),
  baujahr: z.number().int().min(1900).max(2100).nullable().optional(),

  gebaeude: z.string().trim().max(200).nullable().optional(),
  ebene: z.string().trim().max(200).nullable().optional(),
  raumbezeichnung: z.string().trim().max(200).nullable().optional(),
  standortBeschreibung: z.string().trim().max(2000).nullable().optional(),

  nutzungsart: z.string().trim().max(200).nullable().optional(),
  lagerklasse: z.string().trim().max(50).nullable().optional(),
  maxLagermengeKg: decimalField.nullable().optional(),

  bestandsBeschreibung: z.string().trim().max(2000).nullable().optional(),
  bestandsaufnahmeAm: z.coerce.date().nullable().optional(),

  abluftVorhanden: z.boolean().default(false),
  abluftAnschlussdurchmesserSollMm: z.number().int().nonnegative().nullable().optional(),
  abluftVolumenstromSollM3h: decimalField.nullable().optional(),
  abluftUeberwachung: z.boolean().default(false),
  abluftVolumenstromIstM3h: decimalField.nullable().optional(),

  elektrischAusgestattet: z.boolean().default(false),
  spannungVolt: decimalField.nullable().optional(),
  potentialausgleich: z.boolean().default(false),

  exAssessmentStatus: z.enum(['NOT_ASSESSED', 'REQUIRED', 'NOT_REQUIRED']).default('NOT_ASSESSED'),
  exZoneKlassifikation: z.string().trim().max(200).nullable().optional(),

  pruefintervallMonate: z.number().int().positive().nullable().optional(),
  letztePruefungAm: z.coerce.date().nullable().optional(),
  pruefpflichtNorm: z.string().trim().max(200).nullable().optional(),

  responsibleMembershipId: z.string().min(1).nullable().optional(),
})

// ── CREATE ───────────────────────────────────────────────────

export async function createGgaCabinet(projectId: string, input: unknown) {
  const { userId, userEmail } = await requireCollaborationSession()
  const membership = await requireCollaborationProjectAccess(userId, projectId)
  if (!(cabinetEditorRoles as readonly string[]).includes(membership.role)) {
    throw new ForbiddenError('Keine Berechtigung zum Anlegen von GGA-Schränken')
  }
  const data = cabinetInputSchema.parse(input)

  if (data.responsibleMembershipId) {
    const responsible = await prisma.collaborationMembership.findFirst({ where: { id: data.responsibleMembershipId, projectId, active: true } })
    if (!responsible) throw new NotFoundError('Verantwortliches Mitglied nicht gefunden')
  }

  try {
    const cabinet = await prisma.$transaction(async (tx) => {
      const created = await tx.ggaCabinet.create({ data: { ...data, projectId, createdById: userId } })
      await buildAuditLogCreate(tx, { userId, userEmail, action: 'CREATE', entityType: 'gga_cabinet', entityId: created.id, newValue: { kennung: created.kennung, bezeichnung: created.bezeichnung, projectId } })
      return created
    })
    return cabinet
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BusinessRuleError(`Die Kennung „${data.kennung}“ wird in diesem Projekt bereits verwendet.`)
    }
    throw error
  }
}

// ── UPDATE ───────────────────────────────────────────────────

export async function updateGgaCabinet(cabinetId: string, input: unknown) {
  const { userId, userEmail } = await requireCollaborationSession()
  const access = await requireCollaborationCabinetAccess(userId, cabinetId, cabinetEditorRoles)
  const data = cabinetInputSchema.partial().parse(input)

  if (data.responsibleMembershipId) {
    const responsible = await prisma.collaborationMembership.findFirst({ where: { id: data.responsibleMembershipId, projectId: access.projectId, active: true } })
    if (!responsible) throw new NotFoundError('Verantwortliches Mitglied nicht gefunden')
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.ggaCabinet.update({ where: { id: cabinetId }, data })
      await buildAuditLogCreate(tx, { userId, userEmail, action: 'UPDATE', entityType: 'gga_cabinet', entityId: cabinetId, newValue: data })
      return value
    })
    return updated
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BusinessRuleError(`Die Kennung „${data.kennung}“ wird in diesem Projekt bereits verwendet.`)
    }
    throw error
  }
}

// ── DELETE (soft) ────────────────────────────────────────────

export async function softDeleteGgaCabinet(cabinetId: string, reason: string) {
  const { userId, userEmail } = await requireCollaborationSession()
  const access = await requireCollaborationCabinetAccess(userId, cabinetId, ['COLLAB_MANAGER'])

  await prisma.$transaction(async (tx) => {
    await tx.ggaCabinet.update({ where: { id: cabinetId }, data: { deletedAt: new Date() } })
    await buildAuditLogCreate(tx, { userId, userEmail, action: 'DELETE', entityType: 'gga_cabinet', entityId: cabinetId, oldValue: { kennung: access.kennung, bezeichnung: access.bezeichnung }, metadata: { reason } })
  })
}

// ── LIST (Schrankliste) ──────────────────────────────────────

const cabinetListSelect = {
  id: true, projectId: true, kennung: true, bezeichnung: true,
  herstellerName: true, herstellerTyp: true,
  gebaeude: true, ebene: true, raumbezeichnung: true,
  bestandsaufnahmeAm: true,
  pruefintervallMonate: true, letztePruefungAm: true,
  responsibleMembershipId: true,
  responsibleMembership: { select: { user: { select: { firstName: true, lastName: true } } } },
  project: { select: { id: true, name: true, projectNumber: true } },
  // dueDate/responsibleMembership werden nur für die REQ-013-Arbeitsliste
  // benötigt (deriveCabinetStatus() selbst liest sie nicht) — hier trotzdem
  // im gemeinsamen Select, um keine zweite Cabinet-Abfrage einzuführen.
  tasks: { select: { id: true, title: true, status: true, isRequired: true, sequence: true, dueDate: true, stage: { select: { code: true } }, responsibleMembership: { select: { user: { select: { firstName: true, lastName: true } } } } } },
  checklistItems: { select: { id: true, title: true, completed: true, isRequired: true, sequence: true, stage: { select: { code: true } } } },
  blockers: { select: { id: true, title: true, status: true, responsibleMembership: { select: { user: { select: { firstName: true, lastName: true } } } } } },
  approvals: { select: { id: true, status: true, approvalType: true, requestedAt: true, decidedAt: true, stage: { select: { code: true } } } },
} satisfies Prisma.GgaCabinetSelect

function toCabinetSnapshot(cabinet: Prisma.GgaCabinetGetPayload<{ select: typeof cabinetListSelect }>): GgaCabinetSnapshot {
  return {
    bestandsaufnahmeAm: cabinet.bestandsaufnahmeAm,
    pruefintervallMonate: cabinet.pruefintervallMonate,
    letztePruefungAm: cabinet.letztePruefungAm,
    tasks: cabinet.tasks.map((task) => ({ id: task.id, title: task.title, status: task.status as never, isRequired: task.isRequired, sequence: task.sequence, stageCode: task.stage.code })),
    checklistItems: cabinet.checklistItems.map((item) => ({ id: item.id, title: item.title, completed: item.completed, isRequired: item.isRequired, sequence: item.sequence, stageCode: item.stage.code })),
    blockers: cabinet.blockers.map((blocker) => ({ id: blocker.id, title: blocker.title, status: blocker.status as never })),
    approvals: cabinet.approvals.map((approval) => ({ id: approval.id, status: approval.status as never, approvalType: approval.approvalType as never, requestedAt: approval.requestedAt, decidedAt: approval.decidedAt, stageCode: approval.stage.code })),
  }
}

export async function getVisibleGgaCabinets(filters?: { projectId?: string }) {
  const { userId } = await requireCollaborationSession()
  const memberships = await prisma.collaborationMembership.findMany({ where: { userId, active: true, project: { active: true, deletedAt: null } }, select: { project: { select: { id: true } } } })
  const projectIds = memberships.map(({ project }) => project.id)

  const cabinets = await prisma.ggaCabinet.findMany({
    where: { deletedAt: null, projectId: filters?.projectId ? { equals: filters.projectId } : { in: projectIds } },
    orderBy: [{ kennung: 'asc' }],
    select: cabinetListSelect,
  })

  return cabinets.map((cabinet) => ({
    id: cabinet.id,
    projectId: cabinet.projectId,
    project: cabinet.project,
    kennung: cabinet.kennung,
    bezeichnung: cabinet.bezeichnung,
    herstellerName: cabinet.herstellerName,
    herstellerTyp: cabinet.herstellerTyp,
    standort: [cabinet.gebaeude, cabinet.ebene, cabinet.raumbezeichnung].filter(Boolean).join(' · ') || null,
    verantwortlicher: cabinet.responsibleMembership?.user ? `${cabinet.responsibleMembership.user.firstName} ${cabinet.responsibleMembership.user.lastName}` : null,
    ...deriveCabinetStatus(toCabinetSnapshot(cabinet)),
  }))
}

// ── DETAIL (Schrankdetail) ───────────────────────────────────

export async function getGgaCabinetDetail(cabinetId: string) {
  const { userId } = await requireCollaborationSession()
  const access = await requireCollaborationCabinetAccess(userId, cabinetId)

  const cabinet = await prisma.ggaCabinet.findUnique({
    where: { id: cabinetId },
    include: {
      project: { select: { id: true, name: true, projectNumber: true, stages: { orderBy: { sequence: 'asc' }, select: { id: true, code: true, title: true } } } },
      responsibleMembership: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
      createdBy: { select: { firstName: true, lastName: true } },
      tasks: { orderBy: { sequence: 'asc' }, select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, isRequired: true, sequence: true, completedAt: true, stage: { select: { id: true, code: true, title: true } }, responsibleMembership: { select: { user: { select: { firstName: true, lastName: true } } } } } },
      checklistItems: { orderBy: { sequence: 'asc' }, select: { id: true, title: true, completed: true, isRequired: true, sequence: true, completedAt: true, stage: { select: { id: true, code: true, title: true } } } },
      blockers: { orderBy: { createdAt: 'desc' }, select: { id: true, title: true, description: true, status: true, cause: true, resolution: true, createdAt: true, resolvedAt: true } },
      approvals: { orderBy: { requestedAt: 'desc' }, select: { id: true, status: true, approvalType: true, requestedAt: true, decidedAt: true, decisionNote: true, stage: { select: { code: true, title: true } }, requestedBy: { select: { firstName: true, lastName: true } }, decidedBy: { select: { firstName: true, lastName: true } } } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, documentKind: true, originalName: true, mimeType: true, fileSize: true, visibility: true, createdAt: true, uploadedBy: { select: { firstName: true, lastName: true } } } },
    },
  })
  if (!cabinet) throw new NotFoundError('Schrank nicht gefunden')

  const status = deriveCabinetStatus({
    bestandsaufnahmeAm: cabinet.bestandsaufnahmeAm,
    pruefintervallMonate: cabinet.pruefintervallMonate,
    letztePruefungAm: cabinet.letztePruefungAm,
    tasks: cabinet.tasks.map((task) => ({ id: task.id, title: task.title, status: task.status as never, isRequired: task.isRequired, sequence: task.sequence, stageCode: task.stage.code })),
    checklistItems: cabinet.checklistItems.map((item) => ({ id: item.id, title: item.title, completed: item.completed, isRequired: item.isRequired, sequence: item.sequence, stageCode: item.stage.code })),
    blockers: cabinet.blockers.map((blocker) => ({ id: blocker.id, title: blocker.title, status: blocker.status as never })),
    approvals: cabinet.approvals.map((approval) => ({ id: approval.id, status: approval.status as never, approvalType: approval.approvalType as never, requestedAt: approval.requestedAt, decidedAt: approval.decidedAt, stageCode: approval.stage.code })),
  })

  return { ...cabinet, role: access.membership.role, status }
}

// ── Cabinet-Zuordnung auf Task/Checklist/Blocker/Approval ─────
// Setzt/löscht cabinetId auf einer bestehenden Entität. Auditiert als
// UPDATE, weil sich dadurch die fachliche Zuordnung ändert (Abschnitt 10
// des GGA-Cabinet-Reports).

const assignableEntities = ['task', 'checklist-item', 'blocker', 'approval'] as const
type AssignableEntity = (typeof assignableEntities)[number]

const entityConfig: Record<AssignableEntity, { model: 'collaborationTask' | 'collaborationChecklistItem' | 'collaborationBlocker' | 'collaborationApproval'; entityType: string }> = {
  'task': { model: 'collaborationTask', entityType: 'collaboration_task' },
  'checklist-item': { model: 'collaborationChecklistItem', entityType: 'collaboration_checklist_item' },
  'blocker': { model: 'collaborationBlocker', entityType: 'collaboration_blocker' },
  'approval': { model: 'collaborationApproval', entityType: 'collaboration_approval' },
}

export async function setCabinetOnEntity(entity: AssignableEntity, entityId: string, cabinetId: string | null) {
  const { userId, userEmail } = await requireCollaborationSession()
  const config = entityConfig[entity]
  const delegate = (prisma as never as Record<string, { findUnique: (a: unknown) => Promise<{ id: string; projectId: string; cabinetId: string | null } | null>; update: (a: unknown) => Promise<unknown> }>)[config.model]

  const record = await delegate.findUnique({ where: { id: entityId }, select: { id: true, projectId: true, cabinetId: true } })
  if (!record) throw new NotFoundError('Eintrag nicht gefunden')

  const membership = await requireCollaborationProjectAccess(userId, record.projectId)
  if (!(editorRoles as readonly string[]).includes(membership.role)) throw new ForbiddenError('Keine Berechtigung für diese Änderung')

  if (cabinetId) {
    const cabinet = await prisma.ggaCabinet.findFirst({ where: { id: cabinetId, projectId: record.projectId, deletedAt: null } })
    if (!cabinet) throw new NotFoundError('Schrank nicht gefunden')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const value = await (tx as never as Record<string, { update: (a: unknown) => Promise<unknown> }>)[config.model].update({ where: { id: entityId }, data: { cabinetId } })
    await buildAuditLogCreate(tx, { userId, userEmail, action: 'UPDATE', entityType: config.entityType, entityId, oldValue: { cabinetId: record.cabinetId }, newValue: { cabinetId } })
    return value
  })
  return updated
}

// ── Wiederverwendbare GGA-Checklisten-Vorlagen ───────────────
// Keine neue Vorlagen-Tabelle: die vorhandene CollaborationChecklistItem-
// Architektur (projectId/stageId/cabinetId/title/sequence/isRequired) reicht
// vollständig aus. Eine "Vorlage" ist hier bewusst nur eine statische Liste
// von Titeln je Phase, die beim Anwenden als normale Checklistenpunkte
// angelegt werden — completed bleibt dabei immer false.
export const GGA_CABINET_CHECKLIST_TEMPLATES = {
  BESTANDSAUFNAHME: {
    stageCode: 'KONZEPT',
    items: ['Kennung geprüft', 'Typenschild aufgenommen', 'Standort dokumentiert', 'Nutzung erfasst', 'Abluft aufgenommen', 'Elektro aufgenommen', 'Ex-Anforderung bewertet', 'Fotos vollständig'],
  },
  PLANUNG: {
    stageCode: 'PLANUNG',
    items: ['Bestandsdaten geprüft', 'Soll-Abluft definiert', 'Elektro-Maßnahmen definiert', 'Ex-Thema geklärt', 'Maßnahmen vollständig', 'Betreiberfreigabe erforderlich/geklärt'],
  },
  ABNAHME: {
    stageCode: 'ABNAHME',
    items: ['Maßnahmen abgeschlossen', 'Abluft geprüft', 'Ist-Volumenstrom dokumentiert', 'Elektro/VDE geprüft', 'Potentialausgleich geprüft', 'Ex-Anforderungen erfüllt', 'Kennzeichnung geprüft', 'Dokumentation vollständig'],
  },
} as const

export type GgaCabinetChecklistTemplateKey = keyof typeof GGA_CABINET_CHECKLIST_TEMPLATES

export async function applyGgaCabinetChecklistTemplate(cabinetId: string, templateKey: GgaCabinetChecklistTemplateKey) {
  const { userId, userEmail } = await requireCollaborationSession()
  const access = await requireCollaborationCabinetAccess(userId, cabinetId, editorRoles)
  const template = GGA_CABINET_CHECKLIST_TEMPLATES[templateKey]
  if (!template) throw new NotFoundError('Vorlage nicht gefunden')

  const stage = await prisma.collaborationProjectStage.findFirst({ where: { projectId: access.projectId, code: template.stageCode } })
  if (!stage) throw new BusinessRuleError(`Projekt hat keine Phase mit Code „${template.stageCode}“ — Vorlage kann nicht angewendet werden.`)

  const existing = await prisma.collaborationChecklistItem.findMany({ where: { cabinetId, stageId: stage.id }, select: { title: true } })
  const existingTitles = new Set(existing.map((item) => item.title))
  const toCreate = template.items.filter((title) => !existingTitles.has(title))
  if (toCreate.length === 0) return { created: 0, items: [] }

  const created = await prisma.$transaction(async (tx) => {
    const rows = []
    for (const [index, title] of toCreate.entries()) {
      const row = await tx.collaborationChecklistItem.create({ data: { projectId: access.projectId, stageId: stage.id, cabinetId, title, sequence: existingTitles.size + index, isRequired: true } })
      rows.push(row)
    }
    await buildAuditLogCreate(tx, { userId, userEmail, action: 'CREATE', entityType: 'gga_cabinet', entityId: cabinetId, newValue: { checklistTemplateApplied: templateKey, items: toCreate } })
    return rows
  })
  return { created: created.length, items: created }
}

// Findet-oder-erstellt den benannten ABNAHME-Checklistenpunkt für ein
// Cabinet und setzt seinen Status — der geführte Prüfprozess (Phase "GGA-
// UMSETZUNG, PRÜFUNG, ABNAHME") funktioniert damit unabhängig davon, ob die
// Checklisten-Vorlage vorher angewendet wurde. Reine Wiederverwendung von
// CollaborationChecklistItem + der bestehenden setCollaborationChecklistCompleted.
export async function setGgaCabinetInspectionItem(cabinetId: string, title: string, completed: boolean) {
  const { userId } = await requireCollaborationSession()
  const access = await requireCollaborationCabinetAccess(userId, cabinetId, editorRoles)

  const stage = await prisma.collaborationProjectStage.findFirst({ where: { projectId: access.projectId, code: 'ABNAHME' } })
  if (!stage) throw new BusinessRuleError('Projekt hat keine ABNAHME-Phase — Prüfprozess kann nicht abgebildet werden.')

  let item = await prisma.collaborationChecklistItem.findFirst({ where: { cabinetId, stageId: stage.id, title } })
  if (!item) {
    item = await prisma.collaborationChecklistItem.create({ data: { projectId: access.projectId, stageId: stage.id, cabinetId, title, isRequired: true } })
  }
  return setCollaborationChecklistCompleted(item.id, completed)
}

// ── Historie (Audit-Trail) ────────────────────────────────────
// Vollständige Historie: eigene Cabinet-Einträge PLUS alle Audit-Einträge
// der aktuell verknüpften Tasks/Checklistenpunkte/Blocker/Freigaben/
// Dokumente. Bestehendes AuditLog wird nur breiter abgefragt — keine zweite
// Historientabelle.
export async function getGgaCabinetAuditHistory(cabinetId: string) {
  const { userId } = await requireCollaborationSession()
  // Nur intern genutzt (Historie-Sektion der internen Schrankseite) — anders
  // als getGgaCabinetDetail() nicht vom Betreiberportal aufgerufen, deshalb
  // hier ausdrücklich auf interne Rollen beschränkt.
  await requireCollaborationCabinetAccess(userId, cabinetId, internalCollaborationRoles)

  const [tasks, checklistItems, blockers, approvals, documents] = await Promise.all([
    prisma.collaborationTask.findMany({ where: { cabinetId }, select: { id: true } }),
    prisma.collaborationChecklistItem.findMany({ where: { cabinetId }, select: { id: true } }),
    prisma.collaborationBlocker.findMany({ where: { cabinetId }, select: { id: true } }),
    prisma.collaborationApproval.findMany({ where: { cabinetId }, select: { id: true } }),
    prisma.collaborationDocument.findMany({ where: { cabinetId }, select: { id: true } }),
  ])

  return prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'gga_cabinet', entityId: cabinetId },
        { entityType: 'collaboration_task', entityId: { in: tasks.map((t) => t.id) } },
        { entityType: 'collaboration_checklist_item', entityId: { in: checklistItems.map((c) => c.id) } },
        { entityType: 'collaboration_blocker', entityId: { in: blockers.map((b) => b.id) } },
        { entityType: 'collaboration_approval', entityId: { in: approvals.map((a) => a.id) } },
        { entityType: 'collaboration_document', entityId: { in: documents.map((d) => d.id) } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, action: true, entityType: true, userEmail: true, oldValue: true, newValue: true, metadata: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
  })
}

// ── Control-Tower-Aggregation (Schränke-Kachel) ──────────────
// Nur DB-Zugriff + Berechtigung; die eigentliche Aggregation ist reine,
// unit-testbare Logik in cabinet-workflow.ts (deriveGgaCabinetControlTowerSummary).
// Liefert bei einem Projekt ohne Schränke bewusst konsistente Nullwerte
// (kein null) — die aufrufende Seite muss keinen Leerfall gesondert behandeln.
export async function getGgaCabinetControlTowerSummary(projectId: string) {
  const { userId } = await requireCollaborationSession()
  await requireInternalCollaborationProjectAccess(userId, projectId)

  const cabinets = await prisma.ggaCabinet.findMany({ where: { projectId, deletedAt: null }, select: cabinetListSelect })
  const derived = cabinets.map((cabinet) => ({ id: cabinet.id, kennung: cabinet.kennung, ...deriveCabinetStatus(toCabinetSnapshot(cabinet)) }))
  return deriveGgaCabinetControlTowerSummary(derived)
}

function membershipName(membership: { user: { firstName: string; lastName: string } } | null): string | null {
  return membership ? `${membership.user.firstName} ${membership.user.lastName}` : null
}

// ── Projekt-Arbeitsliste "Fristen & nächste Aktionen" (REQ-013) ──────────
// Nur DB-Zugriff + Berechtigung; die eigentliche Ableitung ist reine,
// unit-testbare Logik in cabinet-workflow.ts (deriveGgaProjectWorklist).
// Ausschließlich Daten des angefragten Projekts — keine projektübergreifende
// Aggregation (das ist REQ-014, hier bewusst nicht vorweggenommen).
export async function getGgaCabinetProjectWorklist(projectId: string) {
  const { userId } = await requireCollaborationSession()
  await requireInternalCollaborationProjectAccess(userId, projectId)

  const cabinets = await prisma.ggaCabinet.findMany({ where: { projectId, deletedAt: null }, select: cabinetListSelect })
  const input = cabinets.map((cabinet) => ({
    id: cabinet.id,
    kennung: cabinet.kennung,
    standort: [cabinet.gebaeude, cabinet.ebene, cabinet.raumbezeichnung].filter(Boolean).join(' · ') || null,
    status: deriveCabinetStatus(toCabinetSnapshot(cabinet)),
    openBlockers: cabinet.blockers
      .filter((blocker) => blocker.status === 'OPEN')
      .map((blocker) => ({ id: blocker.id, title: blocker.title, verantwortlich: membershipName(blocker.responsibleMembership) })),
    openRequiredTasks: cabinet.tasks
      .filter((task) => task.isRequired && !['DONE', 'SKIPPED'].includes(task.status))
      .map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, verantwortlich: membershipName(task.responsibleMembership) })),
  }))
  return deriveGgaProjectWorklist(input)
}

// ── Projektübergreifender GGA Control Tower (REQ-014) ─────────────────
// Nur DB-Zugriff + Berechtigung; die eigentliche Aggregation ist reine,
// unit-testbare Logik in cabinet-workflow.ts (deriveGgaControlTowerOverview).
//
// Scoping: getVisibleCollaborationProjects() liefert ausschließlich Projekte,
// in denen der Nutzer eine aktive Mitgliedschaft hat (bestehender, wieder-
// verwendeter Mechanismus) — keine clientseitig übergebene projectId wird
// jemals als Vertrauensanker verwendet. Projekte, in denen die Rolle des
// Nutzers OPERATOR ist, werden zusätzlich herausgefiltert: der interne
// Control Tower ist keine Betreiberansicht — OPERATOR-Mitgliedschaften sind
// ausschließlich für das getrennte Betreiberportal bestimmt (siehe
// requestGgaCabinetOperatorApproval/decideGgaCabinetOperatorApproval unten
// und PROJECT_MAP → Auth-Domains/Invariante 5).
export async function getGgaControlTowerOverview() {
  await requireCollaborationSession()
  const projects = await getVisibleCollaborationProjects()
  const internalProjects = projects.filter((project) => project.role !== 'OPERATOR')
  const projectIds = internalProjects.map((project) => project.id)
  const activeProjectIds = new Set(internalProjects.filter((project) => project.status === 'ACTIVE').map((project) => project.id))

  if (projectIds.length === 0) return deriveGgaControlTowerOverview([], activeProjectIds)

  const cabinets = await prisma.ggaCabinet.findMany({ where: { projectId: { in: projectIds }, deletedAt: null }, select: cabinetListSelect })
  const entries: GgaControlTowerCabinetEntry[] = cabinets.map((cabinet) => ({
    id: cabinet.id,
    kennung: cabinet.kennung,
    standort: [cabinet.gebaeude, cabinet.ebene, cabinet.raumbezeichnung].filter(Boolean).join(' · ') || null,
    projectId: cabinet.projectId,
    projectNumber: cabinet.project.projectNumber,
    projectName: cabinet.project.name,
    ...deriveCabinetStatus(toCabinetSnapshot(cabinet)),
  }))
  return deriveGgaControlTowerOverview(entries, activeProjectIds)
}

// ── Betreiberfreigabe (OPERATOR_ACCEPTANCE) ───────────────────
// Eigener, eng gefasster Service-Layer für echte externe Betreiberfreigaben.
// Nutzt ausschließlich das bestehende CollaborationApproval-Modell — keine
// zweite Freigabetabelle. approvalType ist Bestandteil des Datensatzes
// selbst (nie aus Rolle/Stage erschlossen).

const BETREIBERFREIGABE_CHECKLIST_TITLE = 'Betreiberfreigabe erforderlich/geklärt'

/** Spiegelt den bestehenden Checklistenpunkt auf den echten Betreiber-Approval — nie umgekehrt. */
async function syncBetreiberfreigabeChecklistItem(tx: Prisma.TransactionClient, projectId: string, cabinetId: string, completed: boolean) {
  const existing = await tx.collaborationChecklistItem.findFirst({ where: { cabinetId, title: BETREIBERFREIGABE_CHECKLIST_TITLE } })
  if (existing) {
    await tx.collaborationChecklistItem.update({ where: { id: existing.id }, data: { completed, completedAt: completed ? new Date() : null } })
    return
  }
  const abnahmeStage = await tx.collaborationProjectStage.findFirst({ where: { projectId, code: 'ABNAHME' } })
  if (!abnahmeStage) return
  await tx.collaborationChecklistItem.create({ data: { projectId, stageId: abnahmeStage.id, cabinetId, title: BETREIBERFREIGABE_CHECKLIST_TITLE, isRequired: true, completed, completedAt: completed ? new Date() : null } })
}

/**
 * Fordert eine neue Betreiberfreigabe an. Nur interne Stammdaten-Rollen.
 * Serverseitig geprüft: Cabinet existiert + gehört zum Projekt, keine bereits
 * offene OPERATOR_ACCEPTANCE (Vorab-Check + DB-seitiger partieller Unique-
 * Index als Race-Schutz gegen Doppelklick/parallele Requests).
 */
export async function requestGgaCabinetOperatorApproval(cabinetId: string) {
  const { userId, userEmail } = await requireCollaborationSession()
  const access = await requireCollaborationCabinetAccess(userId, cabinetId, cabinetEditorRoles)

  const abnahmeStage = await prisma.collaborationProjectStage.findFirst({ where: { projectId: access.projectId, code: 'ABNAHME' } })
  if (!abnahmeStage) throw new BusinessRuleError('Projekt hat keine ABNAHME-Phase — Betreiberfreigabe kann nicht angefordert werden.')

  const openExisting = await prisma.collaborationApproval.findFirst({ where: { cabinetId, approvalType: 'OPERATOR_ACCEPTANCE', status: 'REQUESTED' } })
  if (openExisting) throw new BusinessRuleError('Es liegt bereits eine offene Betreiberfreigabe für diesen Schrank vor.')

  try {
    const approval = await prisma.$transaction(async (tx) => {
      const created = await tx.collaborationApproval.create({ data: { projectId: access.projectId, stageId: abnahmeStage.id, cabinetId, approvalType: 'OPERATOR_ACCEPTANCE', requestedById: userId } })
      await syncBetreiberfreigabeChecklistItem(tx, access.projectId, cabinetId, false)
      await buildAuditLogCreate(tx, { userId, userEmail, action: 'CREATE', entityType: 'collaboration_approval', entityId: created.id, newValue: { approvalType: 'OPERATOR_ACCEPTANCE', status: 'REQUESTED', cabinetId }, metadata: { reason: 'Betreiberfreigabe angefordert' } })
      return created
    })
    return approval
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BusinessRuleError('Es liegt bereits eine offene Betreiberfreigabe für diesen Schrank vor.')
    }
    throw error
  }
}

export interface DecideGgaCabinetOperatorApprovalInput {
  decision: 'APPROVED' | 'REJECTED'
  unterlagenGeprueft?: boolean
  decisionNote?: string
}

/**
 * Enger Entrypoint AUSSCHLIESSLICH für Betreiberfreigaben. Entscheidet
 * niemals INTERNAL-Approvals — nutzt dafür weiterhin decideCollaborationApproval.
 */
export async function decideGgaCabinetOperatorApproval(approvalId: string, input: DecideGgaCabinetOperatorApprovalInput) {
  const { userId, userEmail } = await requireCollaborationSession()

  const approval = await prisma.collaborationApproval.findUnique({ where: { id: approvalId }, select: { id: true, projectId: true, cabinetId: true, approvalType: true, status: true } })
  if (!approval) throw new NotFoundError('Freigabe nicht gefunden')
  if (approval.approvalType !== 'OPERATOR_ACCEPTANCE' || !approval.cabinetId) throw new NotFoundError('Freigabe nicht gefunden')

  // OPERATOR darf ausschließlich für sein eigenes Cabinet/Projekt entscheiden —
  // niemals ein INTERNAL-Approval, niemals ein fremdes Projekt.
  const access = await requireCollaborationCabinetAccess(userId, approval.cabinetId, ['OPERATOR'])
  if (access.projectId !== approval.projectId) throw new NotFoundError('Freigabe nicht gefunden')
  if (approval.status !== 'REQUESTED') throw new ValidationError('Diese Freigabe ist bereits entschieden')

  if (input.decision === 'APPROVED' && input.unterlagenGeprueft !== true) {
    throw new ValidationError('Bitte bestätigen Sie, dass die bereitgestellten Unterlagen geprüft wurden.')
  }
  if (input.decision === 'REJECTED' && !input.decisionNote?.trim()) {
    throw new ValidationError('Eine Beanstandung erfordert eine Begründung')
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Optimistische Bedingung auf den Ausgangsstatus: verhindert, dass zwei
    // parallele Entscheidungen (z.B. Doppelklick oder zwei Tabs) dieselbe
    // sicherheitsrelevante Betreiberfreigabe beide "erfolgreich" entscheiden
    // und sich dabei gegenseitig überschreiben.
    const result = await tx.collaborationApproval.updateMany({
      where: { id: approvalId, status: 'REQUESTED' },
      data: { status: input.decision, decisionNote: input.decisionNote?.trim() || null, decidedAt: new Date(), decidedById: userId },
    })
    if (result.count === 0) throw new ConflictError('Diese Freigabe wurde zwischenzeitlich bereits entschieden.')
    const value = await tx.collaborationApproval.findUniqueOrThrow({ where: { id: approvalId } })
    await syncBetreiberfreigabeChecklistItem(tx, approval.projectId, approval.cabinetId!, input.decision === 'APPROVED')
    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action: 'STATUS_CHANGE', entityType: 'collaboration_approval', entityId: approvalId,
      oldValue: { status: 'REQUESTED' }, newValue: { status: input.decision, decisionNote: input.decisionNote ?? null },
      metadata: { reason: input.decision === 'APPROVED' ? 'Betreiberfreigabe erteilt' : 'Betreiberfreigabe abgelehnt (Beanstandung)', cabinetId: approval.cabinetId },
    })
    return value
  })
  return updated
}
