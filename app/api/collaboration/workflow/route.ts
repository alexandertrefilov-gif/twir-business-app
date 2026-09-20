import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ValidationError } from '@/lib/auth/permissions'
import {
  decideCollaborationApproval,
  createCollaborationBlocker,
  createCollaborationChecklistItem,
  createCollaborationTask,
  updateCollaborationTask,
  requestCollaborationApproval,
  resolveCollaborationBlocker,
  restructureCollaborationProjectStages,
  setCollaborationChecklistCompleted,
  setCollaborationTaskStatus,
  transitionCollaborationStage,
  transitionCollaborationProjectStatus,
} from '@/lib/services/collaboration-phase2.service'
import {
  createGgaCabinet,
  updateGgaCabinet,
  softDeleteGgaCabinet,
  setCabinetOnEntity,
  applyGgaCabinetChecklistTemplate,
  setGgaCabinetInspectionItem,
  requestGgaCabinetOperatorApproval,
  decideGgaCabinetOperatorApproval,
  recordGgaCabinetPruefnachweis,
} from '@/lib/services/gga-cabinet.service'
import { setCollaborationDocumentVisibility } from '@/lib/services/collaboration-document.service'

const bodySchema = z.object({
  action: z.enum([
    'create-task', 'update-task', 'task-status', 'create-checklist', 'checklist',
    'create-blocker', 'resolve-blocker', 'request-approval', 'decide-approval',
    'transition-stage', 'transition-project', 'restructure-stages',
    'create-cabinet', 'update-cabinet', 'delete-cabinet', 'set-cabinet',
    'apply-cabinet-checklist-template', 'set-cabinet-inspection-item',
    'request-operator-approval', 'decide-operator-approval', 'set-document-visibility',
    'record-pruefnachweis',
  ]),
  id: z.string().min(1),
  projectId: z.string().min(1).optional(),
  data: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  completed: z.boolean().optional(),
  resolution: z.string().max(2000).optional(),
  confirmedKennung: z.string().optional(),
  decision: z.enum(['APPROVED', 'REJECTED']).optional(),
  decisionNote: z.string().max(2000).optional(),
  plan: z.array(z.object({ code: z.string(), title: z.string(), weight: z.number(), requiresApproval: z.boolean().optional() })).optional(),
  entityType: z.enum(['task', 'checklist-item', 'blocker', 'approval']).optional(),
  cabinetId: z.string().min(1).nullable().optional(),
  templateKey: z.enum(['BESTANDSAUFNAHME', 'PLANUNG', 'ABNAHME']).optional(),
  title: z.string().min(1).max(200).optional(),
  unterlagenGeprueft: z.boolean().optional(),
  visibility: z.enum(['INTERNAL', 'EXTERNAL']).optional(),
  pruefart: z.enum(['LUEFTUNG', 'ELEKTRO', 'VDE']).optional(),
  ergebnis: z.enum(['OFFEN', 'BESTANDEN', 'NICHT_BESTANDEN']).optional(),
})

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await request.json())
    let result: unknown
    if (input.action === 'create-task') result = await createCollaborationTask(input.id, input.data ?? {})
    else if (input.action === 'update-task') result = await updateCollaborationTask(input.id, input.data ?? {})
    else if (input.action === 'task-status') result = await setCollaborationTaskStatus(input.id, input.status ?? '')
    else if (input.action === 'create-checklist') result = await createCollaborationChecklistItem(input.id, input.data ?? {})
    else if (input.action === 'checklist') result = await setCollaborationChecklistCompleted(input.id, input.completed === true)
    else if (input.action === 'create-blocker') {
      if (!input.projectId) throw new ValidationError('Projekt fehlt')
      result = await createCollaborationBlocker(input.projectId, { ...(input.data ?? {}), stageId: input.id || undefined })
    }
    else if (input.action === 'resolve-blocker') {
      const resolution = input.resolution?.trim()
      if (!resolution) throw new ValidationError('Eine Behebungsbeschreibung ist erforderlich')
      result = await resolveCollaborationBlocker(input.id, resolution)
    }
    else if (input.action === 'request-approval') result = await requestCollaborationApproval(input.id, input.cabinetId ?? undefined)
    else if (input.action === 'decide-approval') {
      if (!input.decision) throw new ValidationError('Entscheidung fehlt')
      result = await decideCollaborationApproval(input.id, input.decision, input.decisionNote)
    }
    else if (input.action === 'restructure-stages') {
      if (!input.plan) throw new ValidationError('Phasenplan fehlt')
      result = await restructureCollaborationProjectStages(input.id, input.plan)
    }
    else if (input.action === 'create-cabinet') result = await createGgaCabinet(input.id, input.data ?? {})
    else if (input.action === 'update-cabinet') result = await updateGgaCabinet(input.id, input.data ?? {})
    else if (input.action === 'delete-cabinet') {
      if (!input.confirmedKennung) throw new ValidationError('Zur Bestätigung wird die Kennung des Schranks benötigt')
      result = await softDeleteGgaCabinet(input.id, input.confirmedKennung, input.resolution)
    }
    else if (input.action === 'set-cabinet') {
      if (!input.entityType) throw new ValidationError('Entitätstyp fehlt')
      result = await setCabinetOnEntity(input.entityType, input.id, input.cabinetId ?? null)
    }
    else if (input.action === 'apply-cabinet-checklist-template') {
      if (!input.templateKey) throw new ValidationError('Vorlage fehlt')
      result = await applyGgaCabinetChecklistTemplate(input.id, input.templateKey)
    }
    else if (input.action === 'set-cabinet-inspection-item') {
      if (!input.title) throw new ValidationError('Prüfpunkt fehlt')
      result = await setGgaCabinetInspectionItem(input.id, input.title, input.completed === true)
    }
    else if (input.action === 'request-operator-approval') result = await requestGgaCabinetOperatorApproval(input.id)
    else if (input.action === 'decide-operator-approval') {
      if (!input.decision) throw new ValidationError('Entscheidung fehlt')
      result = await decideGgaCabinetOperatorApproval(input.id, { decision: input.decision, unterlagenGeprueft: input.unterlagenGeprueft, decisionNote: input.decisionNote })
    }
    else if (input.action === 'set-document-visibility') {
      if (!input.visibility) throw new ValidationError('Sichtbarkeit fehlt')
      result = await setCollaborationDocumentVisibility(input.id, input.visibility)
    }
    else if (input.action === 'record-pruefnachweis') {
      if (!input.pruefart) throw new ValidationError('Prüfart fehlt')
      if (!input.ergebnis) throw new ValidationError('Ergebnis fehlt')
      result = await recordGgaCabinetPruefnachweis(input.id, input.pruefart, input.ergebnis, input.data ?? {})
    }
    else if (input.action === 'transition-project') result = await transitionCollaborationProjectStatus(input.id, input.status ?? '')
    else result = await transitionCollaborationStage(input.id, input.status ?? '')
    return NextResponse.json({ ok: true, result })
  } catch (error: unknown) {
    const status = typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : error instanceof z.ZodError ? 400 : 500
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Interner Fehler' }, { status })
  }
}
