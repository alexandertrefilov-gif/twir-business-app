import type { CollaborationHealthStatus, CollaborationProjectStatus, CollaborationStageStatus } from '@/types/enums'

export type CollaborationTaskSnapshot = {
  id: string
  title: string
  description?: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'SKIPPED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  dueDate: Date | null
  sequence: number
  isRequired: boolean
}

export type CollaborationChecklistSnapshot = {
  id: string
  title: string
  sequence: number
  isRequired: boolean
  completed: boolean
  completedAt: Date | null
  responsibleMembershipId?: string | null
}

export type CollaborationBlockerSnapshot = {
  id: string
  title: string
  description?: string | null
  status: 'OPEN' | 'RESOLVED'
  cause?: string | null
  resolution?: string | null
  stageId?: string | null
  taskId?: string | null
}

export type CollaborationApprovalSnapshot = {
  id: string
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED'
  requestedAt: Date
  decidedAt: Date | null
  decisionNote?: string | null
  // REQ-015.2: null = stage-weite Freigabe (z. B. generische Projektphasen
  // ohne GGA-Cabinet-Bezug, siehe CollaborationStageActions.tsx), gesetzt =
  // cabinet-bezogene Freigabe (z. B. GGA-ABNAHME je Schrank, siehe
  // GgaCabinetInspectionWizard.tsx). Beide Semantiken existieren produktiv
  // nebeneinander auf demselben Modell — siehe getStageCompletionBlocker().
  cabinetId?: string | null
}

// REQ-015.4: reine Mitgliedschafts-/Bereitschaftsangabe je GGA-Cabinet für
// EINE Stage — vom Aufrufer (collaboration-phase2.service.ts) aus
// GgaCabinet.projectId (Membership-SSOT) + deriveCabinetStatus()
// (Progress-SSOT) zusammengesetzt. Diese Datei kennt GgaCabinet selbst
// nicht — nur diese bereits fertig berechnete, minimale Sicht.
export type CollaborationStageCabinetReadiness = { id: string; ready: boolean }

export type CollaborationStageSnapshot = {
  id: string
  code: string
  title: string
  sequence: number
  status: CollaborationStageStatus
  weight: number
  isRequired: boolean
  requiresApproval?: boolean
  plannedEnd: Date | null
  blockedReason: string | null
  dependencies: Array<{ dependsOnStageId: string; requiredStatus: CollaborationStageStatus }>
  tasks?: CollaborationTaskSnapshot[]
  checklistItems?: CollaborationChecklistSnapshot[]
  blockers?: CollaborationBlockerSnapshot[]
  approvals?: CollaborationApprovalSnapshot[]
  // undefined = keine GGA-Cabinets für diese Stage relevant (Nicht-GGA-
  // Projekt oder Nicht-GGA-Stage-Code) — keine zusätzliche Einschränkung.
  // [] = GGA-Stage-Code, aber (noch) keine Cabinets im Projekt — vacuous
  // true, ebenfalls keine Einschränkung. Nur einzelne ready:false-Einträge
  // blockieren.
  cabinets?: CollaborationStageCabinetReadiness[]
}

export type DerivedCollaborationStage = CollaborationStageSnapshot & {
  derivedStatus: CollaborationStageStatus
}

const completeStatuses = new Set<CollaborationStageStatus>(['COMPLETED', 'SKIPPED'])

export const COLLABORATION_STAGE_TRANSITIONS: Record<CollaborationStageStatus, CollaborationStageStatus[]> = {
  NOT_STARTED: ['IN_PROGRESS'], READY: ['IN_PROGRESS'], IN_PROGRESS: ['WAITING_FOR_APPROVAL', 'COMPLETED', 'BLOCKED'],
  WAITING_FOR_APPROVAL: ['COMPLETED'], BLOCKED: ['IN_PROGRESS'], COMPLETED: [], SKIPPED: [],
}

export function isCollaborationStageTransitionAllowed(from: CollaborationStageStatus, to: CollaborationStageStatus) {
  return COLLABORATION_STAGE_TRANSITIONS[from]?.includes(to) ?? false
}

// REQ-015.2: eine Stage kann sowohl stage-weite (cabinetId null, generische
// Projektphasen) als auch cabinet-bezogene Freigaben (GGA-ABNAHME je Schrank)
// tragen — siehe CollaborationApprovalSnapshot.cabinetId. Sobald mindestens
// eine cabinet-bezogene Freigabe existiert, gilt die Stage nur dann als
// freigegeben, wenn JEDES Cabinet, das auf dieser Stage überhaupt eine
// Freigabe angefragt hat, eine APPROVED-Freigabe vorweisen kann — eine
// einzelne APPROVED-Zeile eines anderen Cabinets reicht nicht mehr aus
// (vorheriger Fehler: „Multi-Cabinet Approval Undercounting"). Existieren
// ausschließlich stage-weite Freigaben (kein GGA-Cabinet-Bezug), bleibt das
// bisherige Verhalten unverändert.
function isStageApprovalSatisfied(approvals: CollaborationApprovalSnapshot[] | undefined): boolean {
  const list = approvals ?? []
  const cabinetScoped = list.filter((approval) => approval.cabinetId != null)
  if (cabinetScoped.length === 0) return list.some((approval) => approval.status === 'APPROVED')
  const cabinetIds = new Set(cabinetScoped.map((approval) => approval.cabinetId))
  return [...cabinetIds].every((cabinetId) => cabinetScoped.some((approval) => approval.cabinetId === cabinetId && approval.status === 'APPROVED'))
}

// REQ-015.4: schließt den "Multi-Cabinet Completion"-Bypass, der bei
// REQ-015.2-C bewusst offen blieb — ein Cabinet OHNE jede Task-/
// Checklisten-/Approval-Zeile war für obige Prüfungen unsichtbar, weil
// diese ausschließlich vorhandene Zeilen auswerten. cabinets wird vom
// Aufrufer aus der vollständigen, von GgaCabinet.projectId bestimmten
// Cabinet-Menge befüllt (Membership), ready aus deriveCabinetStatus()
// (Progress) — siehe CollaborationStageCabinetReadiness oben.
function isStageCabinetMembershipSatisfied(cabinets: CollaborationStageCabinetReadiness[] | undefined): boolean {
  return (cabinets ?? []).every((cabinet) => cabinet.ready)
}

export function getStageCompletionBlocker(stage: CollaborationStageSnapshot): string | null {
  if (stage.blockers?.some((blocker) => blocker.status === 'OPEN')) return 'Offene Blocker verhindern den Abschluss'
  if (stage.tasks?.some((task) => task.isRequired && !['DONE', 'SKIPPED'].includes(task.status))) return 'Erforderliche Aufgaben sind noch offen'
  if (stage.checklistItems?.some((item) => item.isRequired && !item.completed)) return 'Erforderliche Checklistenpunkte sind noch offen'
  if (!isStageCabinetMembershipSatisfied(stage.cabinets)) return 'Nicht alle GGA-Schränke dieser Phase sind fachlich abgeschlossen'
  if (stage.requiresApproval === true && !isStageApprovalSatisfied(stage.approvals)) return 'Erforderliche Freigabe fehlt'
  return null
}

function satisfiesRequiredStatus(actual: CollaborationStageStatus, required: CollaborationStageStatus) {
  if (required === 'COMPLETED' || required === 'SKIPPED') return completeStatuses.has(actual)
  return actual === required
}

export function deriveStageStatuses(stages: CollaborationStageSnapshot[]): DerivedCollaborationStage[] {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  const resolving = new Set<string>()
  const resolved = new Map<string, CollaborationStageStatus>()

  function resolveStatus(stage: CollaborationStageSnapshot): CollaborationStageStatus {
    const cached = resolved.get(stage.id)
    if (cached) return cached
    const openBlocker = stage.blockers?.some((blocker) => blocker.status === 'OPEN')
    if (openBlocker) { resolved.set(stage.id, 'BLOCKED'); return 'BLOCKED' }
    if (stage.status !== 'NOT_STARTED') {
      const waiting = stage.status === 'IN_PROGRESS' && (
        !isStageCabinetMembershipSatisfied(stage.cabinets) ||
        (stage.requiresApproval === true && !isStageApprovalSatisfied(stage.approvals))
      )
      const status = waiting ? 'WAITING_FOR_APPROVAL' : stage.status
      resolved.set(stage.id, status)
      return status
    }
    if (resolving.has(stage.id)) return 'NOT_STARTED'
    resolving.add(stage.id)
    const ready = stage.dependencies.every((dependency) => {
      const dependencyStage = byId.get(dependency.dependsOnStageId)
      return dependencyStage && satisfiesRequiredStatus(resolveStatus(dependencyStage), dependency.requiredStatus)
    })
    resolving.delete(stage.id)
    const status = ready ? 'READY' : 'NOT_STARTED'
    resolved.set(stage.id, status)
    return status
  }

  return [...stages]
    .sort((a, b) => a.sequence - b.sequence)
    .map((stage) => ({ ...stage, derivedStatus: resolveStatus(stage) }))
}

export function calculateProjectProgress(stages: CollaborationStageSnapshot[]): number | null {
  const weighted = stages.filter((stage) => stage.isRequired && stage.weight > 0)
  if (weighted.length === 0) return null
  const totalWeight = weighted.reduce((sum, stage) => sum + stage.weight, 0)
  const completedWeight = weighted
    .filter((stage) => completeStatuses.has(stage.status) && !getStageCompletionBlocker(stage))
    .reduce((sum, stage) => sum + stage.weight, 0)
  return Math.round((completedWeight / totalWeight) * 100)
}

export function calculateProjectHealth(
  stages: CollaborationStageSnapshot[],
  now = new Date(),
): CollaborationHealthStatus {
  if (stages.some((stage) => stage.isRequired && (stage.status === 'BLOCKED' || (stage.blockedReason ?? '').trim() || stage.blockers?.some((blocker) => blocker.status === 'OPEN')))) return 'RED'
  if (stages.some((stage) => stage.isRequired && stage.tasks?.some((task) => task.isRequired && task.dueDate && task.dueDate < now && !['DONE', 'SKIPPED'].includes(task.status)))) return 'YELLOW'
  if (stages.some((stage) => stage.isRequired && stage.requiresApproval === true && stage.status === 'WAITING_FOR_APPROVAL')) return 'YELLOW'
  if (stages.some((stage) => stage.isRequired && stage.plannedEnd && stage.plannedEnd < now && !completeStatuses.has(stage.status))) return 'YELLOW'
  return 'GREEN'
}

export function deriveNextAction(stages: DerivedCollaborationStage[]): string {
  const blocked = stages.find((stage) => stage.derivedStatus === 'BLOCKED')
  if (blocked) return blocked.blockers?.find((item) => item.status === 'OPEN')?.title || blocked.blockedReason || `${blocked.title} entblocken`
  const blocker = stages.flatMap((stage) => stage.blockers ?? []).find((item) => item.status === 'OPEN')
  if (blocker) return blocker.title
  const approval = stages.find((stage) => stage.derivedStatus === 'WAITING_FOR_APPROVAL')
  if (approval) return `${approval.title} freigeben`
  const task = stages.flatMap((stage) => stage.tasks ?? []).filter((item) => item.isRequired && !['DONE', 'SKIPPED'].includes(item.status)).sort((a, b) => a.sequence - b.sequence)[0]
  if (task) return task.title
  const checklist = stages.flatMap((stage) => stage.checklistItems ?? []).filter((item) => item.isRequired && !item.completed).sort((a, b) => a.sequence - b.sequence)[0]
  if (checklist) return checklist.title
  const ready = stages.find((stage) => stage.derivedStatus === 'READY')
  if (ready) return `${ready.title} starten`
  const active = stages.find((stage) => stage.derivedStatus === 'IN_PROGRESS')
  if (active) return `${active.title} abschließen`
  if (stages.length > 0 && stages.every((stage) => !stage.isRequired || completeStatuses.has(stage.derivedStatus))) return 'Projektabschluss prüfen'
  return 'Projektstatus prüfen'
}

// ── Projektabschluss (REQ-016) ────────────────────────────────
// CollaborationProject.status existierte bereits im Schema (DRAFT/PLANNED/
// ACTIVE/ON_HOLD/COMPLETED/CANCELLED), wurde aber von keinem Codepfad
// jemals gesetzt (activateCollaboration() legt das Projekt nur an, ändert
// nie den Status — siehe GGA-05-Audit). Analog zu COLLABORATION_STAGE_
// TRANSITIONS/isCollaborationStageTransitionAllowed oben, keine neue
// Statuslogik oder Datenstruktur — dasselbe Muster auf Projektebene.
export const COLLABORATION_PROJECT_STATUS_TRANSITIONS: Record<CollaborationProjectStatus, CollaborationProjectStatus[]> = {
  DRAFT: ['PLANNED', 'ACTIVE', 'CANCELLED'],
  PLANNED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function isCollaborationProjectStatusTransitionAllowed(from: CollaborationProjectStatus, to: CollaborationProjectStatus) {
  return COLLABORATION_PROJECT_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

// Projektebenen-Analogon zu getStageCompletionBlocker() oben: nutzt
// ausschließlich die bereits bestehende deriveStageStatuses()-Ableitung
// (dieselbe, die auch deriveNextAction()'s "Projektabschluss prüfen"
// bereits verwendet) — keine zweite Vollständigkeitsprüfung. Schrank-
// bezogene Tasks/Checklistenpunkte/Freigaben sind bereits Teil der Stage-
// Snapshots (sie teilen sich dieselbe stageId), daher fließt GGA-Cabinet-
// Fortschritt hier automatisch mit ein, ohne dass diese Funktion GgaCabinet
// selbst kennen muss (keine neue parallele Lifecycle-Logik, siehe GGA-05.2).
export function getProjectCompletionBlocker(stages: DerivedCollaborationStage[]): string | null {
  if (stages.length === 0) return 'Projekt hat keine Phasen — Projektabschluss ist nicht sinnvoll möglich'
  const blocker = stages.find((stage) => stage.isRequired && !completeStatuses.has(stage.derivedStatus))
  if (blocker) return `Phase „${blocker.title}“ ist noch nicht abgeschlossen`
  return null
}
