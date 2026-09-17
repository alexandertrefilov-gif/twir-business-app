import Link from 'next/link'
import { getGgaCabinetDetail, cabinetEditorRoles, GGA_CABINET_CHECKLIST_TEMPLATES } from '@/lib/services/gga-cabinet.service'
import { editorRoles, approverRoles } from '@/lib/services/collaboration-phase2.service'
import { GgaCabinetInspectionWizard } from '@/components/collaboration/GgaCabinetInspectionWizard'
import { handleCollaborationPageError } from '@/lib/auth/collaboration-guards'

function toDecimalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}
function toDateInput(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

export default async function GgaCabinetInspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let cabinet: Awaited<ReturnType<typeof getGgaCabinetDetail>>
  try {
    cabinet = await getGgaCabinetDetail(id)
  } catch (error) {
    handleCollaborationPageError(error)
  }

  const abnahmeStage = cabinet.project.stages.find((s) => s.code === 'ABNAHME')
  if (!abnahmeStage) {
    return <div><p className="text-sm text-muted-foreground">Dieses Projekt hat keine ABNAHME-Phase — der Prüfprozess ist nicht verfügbar.</p></div>
  }

  const abnahmeChecklistTitles = GGA_CABINET_CHECKLIST_TEMPLATES.ABNAHME.items
  const checklist: Record<string, boolean> = {}
  for (const title of abnahmeChecklistTitles) {
    const item = cabinet.checklistItems.find((c) => c.stage.code === 'ABNAHME' && c.title === title)
    checklist[title] = item?.completed ?? false
  }

  const internalAbnahmeApprovals = cabinet.approvals.filter((a) => a.stage.code === 'ABNAHME' && a.approvalType === 'INTERNAL')
  const latestApprovalStatus = internalAbnahmeApprovals[0]?.status ?? null

  const canInspect = (editorRoles as readonly string[]).includes(cabinet.role)
  const canApprove = (approverRoles as readonly string[]).includes(cabinet.role)
  const canEditStammdaten = (cabinetEditorRoles as readonly string[]).includes(cabinet.role)
  const canRequestBetreiberfreigabe = (cabinetEditorRoles as readonly string[]).includes(cabinet.role)

  const lifecycleWarning = cabinet.status.lifecycleStage === 'BESTAND' || cabinet.status.lifecycleStage === 'PLANUNG' || cabinet.status.lifecycleStage === 'UMSETZUNG'
    ? 'Bestandsaufnahme, Planung oder Umsetzung sind noch nicht vollständig abgeschlossen. Die Prüfung kann trotzdem vorbereitet werden, sollte aber erst final durchgeführt werden, wenn die Umsetzung abgeschlossen ist.'
    : null

  return <div>
    <p className="text-xs text-muted-foreground"><Link href={`/collaboration/cabinets/${cabinet.id}`} className="hover:underline">{cabinet.kennung}</Link> / Prüfung &amp; Abnahme</p>
    <h1 className="mt-1 text-3xl font-600 tracking-tight">Prüfung &amp; Abnahme — {cabinet.kennung}</h1>
    <p className="mt-2 text-sm text-muted-foreground">Kein Prüfpunkt gilt automatisch als bestanden — jeder Punkt bleibt „Nicht geprüft“, bis er hier explizit bestätigt wird.</p>

    <div className="mt-6">
      <GgaCabinetInspectionWizard
        cabinetId={cabinet.id}
        projectId={cabinet.projectId}
        abnahmeStageId={abnahmeStage.id}
        canInspect={canInspect}
        canApprove={canApprove}
        canEditStammdaten={canEditStammdaten}
        lifecycleWarning={lifecycleWarning}
        initial={{
          checklist,
          abluftVolumenstromIstM3h: toDecimalString(cabinet.abluftVolumenstromIstM3h),
          letztePruefungAm: toDateInput(cabinet.letztePruefungAm),
          openBlockers: cabinet.blockers.filter((b) => b.status === 'OPEN').map((b) => ({ id: b.id, title: b.title, status: b.status, cause: b.cause })),
          documents: cabinet.documents.map((d) => ({ id: d.id, documentKind: d.documentKind, originalName: d.originalName })),
          latestApprovalStatus: latestApprovalStatus as 'REQUESTED' | 'APPROVED' | 'REJECTED' | null,
          pruefstatus: cabinet.status.pruefstatus,
          betreiberstatus: cabinet.status.betreiberstatus,
          canRequestBetreiberfreigabe,
        }}
        recap={{
          kennung: cabinet.kennung,
          standort: [cabinet.gebaeude, cabinet.ebene, cabinet.raumbezeichnung].filter(Boolean).join(' · ') || '–',
          abluftVolumenstromSollM3h: toDecimalString(cabinet.abluftVolumenstromSollM3h),
          abluftAnschlussdurchmesserSollMm: cabinet.abluftAnschlussdurchmesserSollMm,
          exAssessmentStatus: cabinet.exAssessmentStatus,
          doneMeasures: cabinet.tasks.filter((t) => ['DONE', 'SKIPPED'].includes(t.status)).map((t) => t.title),
          openRequiredMeasures: cabinet.tasks.filter((t) => t.isRequired && !['DONE', 'SKIPPED'].includes(t.status)).map((t) => t.title),
        }}
      />
    </div>
  </div>
}
