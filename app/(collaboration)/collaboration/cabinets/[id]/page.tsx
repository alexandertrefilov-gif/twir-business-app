import Link from 'next/link'
import { handleCollaborationPageError } from '@/lib/auth/collaboration-guards'
import { getGgaCabinetDetail, getGgaCabinetAuditHistory, cabinetEditorRoles } from '@/lib/services/gga-cabinet.service'
import { editorRoles, getVisibleCollaborationMemberships } from '@/lib/services/collaboration-phase2.service'
import { GgaCabinetBlockerList } from '@/components/collaboration/GgaCabinetBlockerList'
import { GGA_EX_ASSESSMENT_LABELS, GGA_LIFECYCLE_STAGE_LABELS, GGA_BETREIBERSTATUS_LABELS, formatGgaBetriebsstatusLabel, GGA_BETRIEBSSTATUS_BADGE_CLASS } from '@/lib/collaboration/cabinet-workflow'
import { GgaCabinetSollIstComparison } from '@/components/collaboration/GgaCabinetSollIstComparison'
import { GgaCabinetTechnicalForm } from '@/components/collaboration/GgaCabinetTechnicalForm'
import { GgaCabinetDocumentUpload } from '@/components/collaboration/GgaCabinetDocumentUpload'
import { GgaCabinetDeleteButton } from '@/components/collaboration/GgaCabinetDeleteButton'
import { GgaCabinetMeasureForm } from '@/components/collaboration/GgaCabinetMeasureForm'
import { GgaCabinetChecklistTemplateButtons } from '@/components/collaboration/GgaCabinetChecklistTemplateButtons'
import { GgaCabinetFreigabehistorie } from '@/components/collaboration/GgaCabinetFreigabehistorie'
import { GgaCabinetDocumentVisibilityToggle } from '@/components/collaboration/GgaCabinetDocumentVisibilityToggle'

const taskStatusLabels: Record<string, string> = { TODO: 'Offen', IN_PROGRESS: 'In Arbeit', BLOCKED: 'Blockiert', DONE: 'Erledigt', SKIPPED: 'Übersprungen' }
const priorityLabels: Record<string, string> = { URGENT: 'Dringend', HIGH: 'Hoch', MEDIUM: 'Mittel', LOW: 'Niedrig' }
const approvalStatusLabels: Record<string, string> = { REQUESTED: 'Angefragt', APPROVED: 'Freigegeben', REJECTED: 'Abgelehnt' }
const entityTypeLabels: Record<string, string> = {
  gga_cabinet: 'Schrank', collaboration_task: 'Maßnahme', collaboration_checklist_item: 'Checkliste',
  collaboration_blocker: 'Blocker', collaboration_approval: 'Freigabe', collaboration_document: 'Dokument',
}
const lifecycleBadgeClass: Record<string, string> = {
  BESTAND: 'bg-stone-100 text-stone-700', PLANUNG: 'bg-blue-100 text-blue-800', UMSETZUNG: 'bg-amber-100 text-amber-800',
  PRUEFUNG_ABNAHME: 'bg-purple-100 text-purple-800', ABGESCHLOSSEN: 'bg-green-100 text-green-800',
}
const betreiberstatusBadgeClass: Record<string, string> = {
  NICHT_ANGEFORDERT: 'bg-stone-100 text-stone-500', AUSSTEHEND: 'bg-amber-100 text-amber-800',
  BEANSTANDET: 'bg-red-100 text-red-800', ERTEILT: 'bg-green-100 text-green-800',
}

function toDateInput(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}
function toDecimalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default async function GgaCabinetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let cabinet: Awaited<ReturnType<typeof getGgaCabinetDetail>>
  try {
    cabinet = await getGgaCabinetDetail(id)
  } catch (error) {
    handleCollaborationPageError(error)
  }

  const [memberships, history] = await Promise.all([
    getVisibleCollaborationMemberships({ projectId: cabinet.projectId }),
    getGgaCabinetAuditHistory(id),
  ])

  const canEdit = (cabinetEditorRoles as readonly string[]).includes(cabinet.role)
  const canDelete = cabinet.role === 'COLLAB_MANAGER'
  const canUpload = true // jedes aktive Projektmitglied — Berechtigung wird serverseitig in uploadCollaborationDocument erneut geprüft
  // Gleiche Rollen wie resolveCollaborationBlocker() serverseitig prüft — Sichtbarkeit des
  // "Beheben"-Buttons folgt exakt der tatsächlichen Berechtigung, keine eigene Rollenliste.
  const canResolveBlockers = (editorRoles as readonly string[]).includes(cabinet.role)

  return <div>
    <p className="text-xs text-muted-foreground"><Link href="/collaboration/cabinets" className="hover:underline">GGA-Schränke</Link> / {cabinet.project.name}</p>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-600 tracking-tight">{cabinet.kennung} — {cabinet.bezeichnung}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-600 ${lifecycleBadgeClass[cabinet.status.lifecycleStage]}`}>{GGA_LIFECYCLE_STAGE_LABELS[cabinet.status.lifecycleStage]}</span>
        {cabinet.status.betreiberstatus !== 'NICHT_ANGEFORDERT' && <span className={`rounded-full px-3 py-1 text-xs font-600 ${betreiberstatusBadgeClass[cabinet.status.betreiberstatus]}`}>{GGA_BETREIBERSTATUS_LABELS[cabinet.status.betreiberstatus]}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/collaboration/cabinets/${cabinet.id}/bestandsaufnahme`} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-600 text-stone-800">{cabinet.status.bestandsaufnahmeAbgeschlossen ? 'Bestandsaufnahme bearbeiten' : 'Bestandsaufnahme starten'}</Link>
        {cabinet.status.bestandsaufnahmeAbgeschlossen && <Link href={`/collaboration/cabinets/${cabinet.id}/pruefung`} className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-600 text-white">Prüfung / Abnahme</Link>}
        <a href={`/api/collaboration/cabinets/${cabinet.id}/schrankakte`} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-600 text-stone-800">Schrankakte (PDF)</a>
        <GgaCabinetDeleteButton cabinetId={cabinet.id} canDelete={canDelete} />
      </div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="rounded-lg border border-stone-200 bg-white p-3"><p className="text-xs text-muted-foreground">Bestandsaufnahme</p><p className="mt-1 text-lg font-600">{cabinet.status.bestandsaufnahmeAbgeschlossen ? '✓ Abgeschlossen' : 'Offen'}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white p-3"><p className="text-xs text-muted-foreground">Planung</p><p className="mt-1 text-lg font-600">{cabinet.status.planungsfortschritt === null ? '–' : `${cabinet.status.planungsfortschritt}%`}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white p-3"><p className="text-xs text-muted-foreground">Montage</p><p className="mt-1 text-lg font-600">{cabinet.status.montagefortschritt === null ? '–' : `${cabinet.status.montagefortschritt}%`}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white p-3"><p className="text-xs text-muted-foreground">Betriebsstatus</p><p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-600 ${GGA_BETRIEBSSTATUS_BADGE_CLASS[cabinet.status.betriebsstatus]}`}>{formatGgaBetriebsstatusLabel(cabinet.status.betriebsstatus, cabinet.status.betriebsstatusTageBisFaellig)}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white p-3"><p className="text-xs text-muted-foreground">Offene Blocker</p><p className="mt-1 text-lg font-600">{cabinet.status.offeneBlocker}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white p-3"><p className="text-xs text-muted-foreground">Nächste Aktion</p><p className="mt-1 text-sm font-600">{cabinet.status.naechsteAktion}</p></div>
    </div>

    <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-600 text-stone-800">BESTAND — vor Ort festgestellt</h2><Link href={`/collaboration/cabinets/${cabinet.id}/bestandsaufnahme`} className="text-xs text-blue-700 hover:underline">Bearbeiten →</Link></div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Hersteller / Typ</dt><dd>{[cabinet.herstellerName, cabinet.herstellerTyp].filter(Boolean).join(' ') || '–'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Standort</dt><dd>{[cabinet.gebaeude, cabinet.ebene, cabinet.raumbezeichnung].filter(Boolean).join(' · ') || '–'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Nutzung</dt><dd>{cabinet.nutzungsart || '–'}{cabinet.lagerklasse ? ` (${cabinet.lagerklasse})` : ''}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Abluft</dt><dd>{cabinet.abluftVorhanden ? 'Vorhanden' : 'Nicht vorhanden'}{cabinet.abluftUeberwachung ? ', überwacht' : ''}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Elektro</dt><dd>{cabinet.elektrischAusgestattet ? 'Ausgestattet' : 'Nicht ausgestattet'}{cabinet.spannungVolt ? `, ${cabinet.spannungVolt} V` : ''}{cabinet.potentialausgleich ? ', Potentialausgleich vorhanden' : ', kein Potentialausgleich'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Ex-Schutz</dt><dd>{GGA_EX_ASSESSMENT_LABELS[cabinet.exAssessmentStatus]}{cabinet.exZoneKlassifikation ? ` (${cabinet.exZoneKlassifikation})` : ''}</dd></div>
        {cabinet.bestandsBeschreibung && <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs text-muted-foreground">Bestandsnotiz</dt><dd>{cabinet.bestandsBeschreibung}</dd></div>}
      </dl>
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-600">SOLL / IST</h2>
      <GgaCabinetTechnicalForm
        cabinetId={cabinet.id}
        canEdit={canEdit}
        memberships={memberships.map((m) => ({ id: m.id, role: m.role, user: { firstName: m.user.firstName, lastName: m.user.lastName } }))}
        initial={{
          abluftAnschlussdurchmesserSollMm: cabinet.abluftAnschlussdurchmesserSollMm, abluftVolumenstromSollM3h: toDecimalString(cabinet.abluftVolumenstromSollM3h), abluftVolumenstromIstM3h: toDecimalString(cabinet.abluftVolumenstromIstM3h),
          pruefintervallMonate: cabinet.pruefintervallMonate, letztePruefungAm: toDateInput(cabinet.letztePruefungAm), pruefpflichtNorm: cabinet.pruefpflichtNorm,
          responsibleMembershipId: cabinet.responsibleMembershipId,
        }}
      />
      {!canEdit && <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 text-sm text-muted-foreground">
        Verantwortlich: {cabinet.responsibleMembership?.user ? `${cabinet.responsibleMembership.user.firstName} ${cabinet.responsibleMembership.user.lastName}` : 'Nicht zugewiesen'}
      </div>}
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-600">Maßnahmen</h2>
      {(() => {
        const offen = cabinet.tasks.filter((t) => !['DONE', 'SKIPPED'].includes(t.status))
        const erledigt = cabinet.tasks.filter((t) => ['DONE', 'SKIPPED'].includes(t.status))
        const measureTable = (rows: typeof cabinet.tasks, empty: string) => <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Titel</th><th className="px-4 py-2">Phase</th><th className="px-4 py-2">Priorität</th><th className="px-4 py-2">Fälligkeit</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Verantwortlich</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((task) => <tr key={task.id} className={task.dueDate && task.dueDate < new Date() && !['DONE', 'SKIPPED'].includes(task.status) ? 'bg-red-50' : undefined}>
                <td className="px-4 py-2">{task.title}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{task.stage.title}</td>
                <td className="px-4 py-2 text-xs">{priorityLabels[task.priority]}</td>
                <td className="px-4 py-2 text-xs tabular-nums">{task.dueDate ? new Date(task.dueDate).toLocaleDateString('de-DE') : '–'}</td>
                <td className="px-4 py-2">{taskStatusLabels[task.status]}</td>
                <td className="px-4 py-2 text-xs">{task.responsibleMembership?.user ? `${task.responsibleMembership.user.firstName} ${task.responsibleMembership.user.lastName}` : '–'}</td>
              </tr>)}
            </tbody>
          </table>
          {rows.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>}
        </div>
        return <div className="mt-2 space-y-4">
          <div><p className="mb-1 text-xs font-600 uppercase tracking-wide text-muted-foreground">Offene Maßnahmen ({offen.length})</p>{measureTable(offen, 'Keine offenen Maßnahmen.')}</div>
          <div><p className="mb-1 text-xs font-600 uppercase tracking-wide text-muted-foreground">Erledigte Maßnahmen ({erledigt.length})</p>{measureTable(erledigt, 'Noch keine Maßnahme erledigt.')}</div>
        </div>
      })()}
      <GgaCabinetMeasureForm cabinetId={cabinet.id} stages={cabinet.project.stages} memberships={memberships.map((m) => ({ id: m.id, role: m.role, user: { firstName: m.user.firstName, lastName: m.user.lastName } }))} canEdit={canEdit} />
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-600">Soll-/Ist-Vergleich</h2>
      <p className="mt-1 text-sm text-muted-foreground">Grundlage für die Prüfung — keine automatische fachliche Bewertung.</p>
      <div className="mt-2">
        <GgaCabinetSollIstComparison cabinet={{
          abluftAnschlussdurchmesserSollMm: cabinet.abluftAnschlussdurchmesserSollMm,
          abluftVolumenstromSollM3h: cabinet.abluftVolumenstromSollM3h,
          abluftVolumenstromIstM3h: cabinet.abluftVolumenstromIstM3h,
          montagefortschritt: cabinet.status.montagefortschritt,
          exAssessmentStatus: cabinet.exAssessmentStatus,
          elektrischAusgestattet: cabinet.elektrischAusgestattet,
          potentialausgleich: cabinet.potentialausgleich,
          checklistItems: cabinet.checklistItems.map((item) => ({ title: item.title, completed: item.completed, stage: { code: item.stage.code } })),
        }} />
      </div>
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-600">Checkliste</h2>
      <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Punkt</th><th className="px-4 py-2">Phase</th><th className="px-4 py-2">Status</th></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {cabinet.checklistItems.map((item) => <tr key={item.id}><td className="px-4 py-2">{item.title}</td><td className="px-4 py-2 text-xs text-muted-foreground">{item.stage.title}</td><td className="px-4 py-2">{item.completed ? '✓ Erledigt' : '○ Offen'}</td></tr>)}
          </tbody>
        </table>
        {cabinet.checklistItems.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Keine Checklistenpunkte zugeordnet.</p>}
      </div>
      <GgaCabinetChecklistTemplateButtons cabinetId={cabinet.id} canEdit={canEdit} />
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-600">Blocker</h2>
      <GgaCabinetBlockerList
        blockers={cabinet.blockers.map((blocker) => ({
          id: blocker.id, title: blocker.title, status: blocker.status, cause: blocker.cause,
          resolution: blocker.resolution, resolvedAt: blocker.resolvedAt ? blocker.resolvedAt.toISOString() : null,
        }))}
        canResolve={canResolveBlockers}
      />
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-600">Freigaben</h2>
      <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Art</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Angefragt</th><th className="px-4 py-2">Entscheidung</th></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {cabinet.approvals.map((approval) => <tr key={approval.id}><td className="px-4 py-2">{approval.approvalType === 'OPERATOR_ACCEPTANCE' ? 'Betreiberfreigabe' : 'Intern'}</td><td className="px-4 py-2">{approvalStatusLabels[approval.status]}</td><td className="px-4 py-2 text-xs text-muted-foreground">{approval.requestedBy.firstName} {approval.requestedBy.lastName}</td><td className="px-4 py-2 text-xs text-muted-foreground">{approval.decidedBy ? `${approval.decidedBy.firstName} ${approval.decidedBy.lastName}` : '–'}{approval.decisionNote ? ` — ${approval.decisionNote}` : ''}</td></tr>)}
          </tbody>
        </table>
        {cabinet.approvals.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Keine Freigaben angefragt.</p>}
      </div>
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-600">Freigabehistorie</h2>
      <div className="mt-2">
        <GgaCabinetFreigabehistorie approvals={cabinet.approvals.map((a) => ({
          id: a.id, status: a.status as never, approvalType: a.approvalType as never,
          requestedAt: a.requestedAt.toISOString(), decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
          decisionNote: a.decisionNote, requestedByName: `${a.requestedBy.firstName} ${a.requestedBy.lastName}`,
          decidedByName: a.decidedBy ? `${a.decidedBy.firstName} ${a.decidedBy.lastName}` : null,
        }))} />
      </div>
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-600">Dokumente</h2>
      <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Datei</th><th className="px-4 py-2">Art</th><th className="px-4 py-2">Größe</th><th className="px-4 py-2">Hochgeladen von</th><th className="px-4 py-2">Sichtbarkeit</th><th className="px-4 py-2" /></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {cabinet.documents.map((doc) => <tr key={doc.id}>
              <td className="px-4 py-2">{doc.originalName}</td>
              <td className="px-4 py-2 text-xs">{doc.documentKind}</td>
              <td className="px-4 py-2 text-xs tabular-nums">{formatFileSize(doc.fileSize)}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{doc.uploadedBy.firstName} {doc.uploadedBy.lastName}</td>
              <td className="px-4 py-2"><GgaCabinetDocumentVisibilityToggle documentId={doc.id} visibility={doc.visibility} canChange={canEdit} /></td>
              <td className="px-4 py-2 text-right"><a href={`/api/collaboration/documents/${doc.id}/download`} className="text-xs text-blue-700 hover:underline">Herunterladen</a></td>
            </tr>)}
          </tbody>
        </table>
        {cabinet.documents.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Keine Dokumente vorhanden.</p>}
      </div>
      <GgaCabinetDocumentUpload projectId={cabinet.projectId} cabinetId={cabinet.id} canUpload={canUpload} />
    </section>

    <section className="mt-8">
      <h2 className="text-lg font-600">Historie</h2>
      <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Zeitpunkt</th><th className="px-4 py-2">Bereich</th><th className="px-4 py-2">Aktion</th><th className="px-4 py-2">Von</th></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {history.map((entry) => <tr key={entry.id}><td className="px-4 py-2 text-xs tabular-nums">{entry.createdAt.toLocaleString('de-DE')}</td><td className="px-4 py-2 text-xs text-muted-foreground">{entityTypeLabels[entry.entityType] ?? entry.entityType}</td><td className="px-4 py-2 text-xs">{entry.action}</td><td className="px-4 py-2 text-xs text-muted-foreground">{entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : (entry.userEmail ?? '–')}</td></tr>)}
          </tbody>
        </table>
        {history.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Keine Historieneinträge.</p>}
      </div>
    </section>
  </div>
}
