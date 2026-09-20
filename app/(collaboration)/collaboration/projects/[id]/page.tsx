import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCollaborationPhase2Project, getRecentCollaborationActivity } from '@/lib/services/collaboration-phase2.service'
import { getGgaControlTowerOverview } from '@/lib/services/gga-cabinet.service'
import {
  GGA_LIFECYCLE_STAGE_LABELS, GGA_BETREIBERSTATUS_LABELS, GGA_CONTROL_TOWER_REASON_LABELS,
  GGA_STATUS_LABELS, GGA_STATUS_BADGE_CLASS, GGA_PRESENTATION_STATUS_RANK, GGA_BETRIEBSSTATUS_BADGE_CLASS,
  formatGgaBetriebsstatusLabel, aktuellerGgaFortschritt, ggaCabinetHatHandlungsbedarf, deriveGgaCabinetPresentationStatus,
  naechsterSchrittFuerCabinet, direkteGgaHandlungsbedarfAktion, direkteGgaCabinetAktion,
  type GgaControlTowerCabinetEntry, type GgaControlTowerUrgentCabinet,
} from '@/lib/collaboration/cabinet-workflow'
import {
  COLLABORATION_PROJECT_STATUS_TRANSITIONS, getProjectCompletionBlocker, getStageCompletionBlocker,
  calculateStageProgress, deriveStageDependencyWaitReason,
  type DerivedCollaborationStage,
} from '@/lib/collaboration/project-workflow'
import { NotFoundError } from '@/lib/auth/permissions'
import {
  COLLABORATION_STAGE_STATUS_LABELS, COLLABORATION_PROJECT_STATUS_LABELS, COLLABORATION_ROLE_LABELS, COLLABORATION_HEALTH_STATUS_LABELS,
  type CollaborationRole, type CollaborationStageStatus,
} from '@/types/enums'
import { CollaborationStageActions } from '@/components/collaboration/CollaborationStageActions'
import { CollaborationProjectStatusActions } from '@/components/collaboration/CollaborationProjectStatusActions'

const healthBadgeClass: Record<string, string> = { GREEN: 'bg-emerald-50 text-emerald-700', YELLOW: 'bg-amber-50 text-amber-700', RED: 'bg-red-50 text-red-700' }

// GGA-Portal Produktblock 5 Abschnitt 9: GGA-05.1 richtet die fünf
// kanonischen Projektphasen-Codes bereits 1:1 an den fünf GgaCabinet-
// Lifecycle-Stufen aus (siehe cabinet-workflow.ts) — hier nur dieselbe,
// bereits bestehende Zuordnung benannt, keine neue Stage-Membership.
const STAGE_CODE_TO_LIFECYCLE: Record<string, GgaControlTowerCabinetEntry['lifecycleStage']> = {
  KONZEPT: 'BESTAND', PLANUNG: 'PLANUNG', UMSETZUNG: 'UMSETZUNG', ABNAHME: 'PRUEFUNG_ABNAHME', ABSCHLUSS: 'ABGESCHLOSSEN',
}

// Produktblock 5 Abschnitt 2/11: Direktaktion je Phasenzeile, abgeleitet aus
// dem bereits vorhandenen, textuellen Abschlussgrund (getStageCompletionBlocker,
// REQ-015-SSOT) — reine Textzuordnung auf bereits bestehende Ankerpunkte
// derselben Seite, keine neue Workflow-Entscheidung.
function phaseAktion(stage: DerivedCollaborationStage, reason: string | null): { href: string; label: string } | null {
  if (reason === 'Offene Blocker verhindern den Abschluss') return { href: '#blocker', label: 'Blocker öffnen' }
  if (reason === 'Erforderliche Aufgaben sind noch offen') return { href: '#aufgaben', label: 'Aufgaben öffnen' }
  if (reason === 'Erforderliche Checklistenpunkte sind noch offen') return { href: '#checkliste', label: 'Checkliste öffnen' }
  if (reason === 'Nicht alle GGA-Schränke dieser Phase sind fachlich abgeschlossen') return { href: '#schrankmatrix', label: 'Schränke öffnen' }
  if (reason === 'Erforderliche Freigabe fehlt') return { href: '#freigaben', label: 'Freigaben öffnen' }
  if (reason === null && stage.derivedStatus === 'READY') return { href: '#stage-title', label: 'Phase starten' }
  if (reason === null && stage.derivedStatus === 'IN_PROGRESS') return { href: '#stage-title', label: 'Phase öffnen' }
  return null
}

function ProgressBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">–</span>
  return <div className="flex items-center gap-2">
    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-stone-700" style={{ width: `${value}%` }} /></div>
    <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
  </div>
}

// Produktblock 2 Abschnitt 3: rein visuelle Übersetzung des bereits
// abgeleiteten Stage-Status (deriveStageStatuses(), unverändert) in die vier
// geforderten Symbole — keine neue Stage-Logik.
const STAGE_SYMBOL: Record<CollaborationStageStatus, { symbol: string; className: string }> = {
  COMPLETED: { symbol: '✓', className: 'text-emerald-700' },
  SKIPPED: { symbol: '✓', className: 'text-emerald-700' },
  IN_PROGRESS: { symbol: '●', className: 'text-blue-700' },
  WAITING_FOR_APPROVAL: { symbol: '●', className: 'text-blue-700' },
  BLOCKED: { symbol: '!', className: 'text-red-700' },
  NOT_STARTED: { symbol: '○', className: 'text-stone-400' },
  READY: { symbol: '○', className: 'text-stone-400' },
}

// Produktblock 2 Abschnitt 8: Freigabe → bestehender Freigabebereich, "sofern
// direkt adressierbar" — es gibt keine einzeln adressierbare Freigabeseite je
// Schrank/Vorgang (/collaboration/approvals ist eine flache Liste ohne
// [id]-Route), daher bleibt direkteGgaCabinetAktion() (→ /pruefung, wo intern
// Freigabe UND Betreiberfreigabe angefordert/entschieden werden) die korrekte
// Aktion. Hier nur der Anzeige-Text für die FREIGABE-Spalte, aus bereits
// abgeleiteten Feldern.
function freigabeSpalte(cabinet: GgaControlTowerCabinetEntry): string {
  if (cabinet.freigabeOffen) return 'Interne Freigabe offen'
  if (cabinet.betreiberstatus !== 'NICHT_ANGEFORDERT') return GGA_BETREIBERSTATUS_LABELS[cabinet.betreiberstatus]
  return '–'
}

type CabinetFilter = 'alle' | 'handlungsbedarf' | 'in-arbeit' | 'pruefung' | 'freigabe' | 'blockiert' | 'abgeschlossen'
const CABINET_FILTER_LABELS: Record<CabinetFilter, string> = {
  alle: 'Alle', handlungsbedarf: 'Handlungsbedarf', 'in-arbeit': 'In Arbeit', pruefung: 'Prüfung', freigabe: 'Freigabe', blockiert: 'Blockiert', abgeschlossen: 'Abgeschlossen',
}
function matchesCabinetFilter(cabinet: GgaControlTowerCabinetEntry, filter: CabinetFilter): boolean {
  switch (filter) {
    case 'alle': return true
    case 'handlungsbedarf': return ggaCabinetHatHandlungsbedarf(cabinet)
    case 'in-arbeit': return cabinet.lifecycleStage === 'PLANUNG' || cabinet.lifecycleStage === 'UMSETZUNG'
    case 'pruefung': return cabinet.pruefungOffen
    case 'freigabe': return cabinet.freigabeOffen || cabinet.betreiberfreigabeAusstehend
    case 'blockiert': return cabinet.offeneBlocker > 0
    case 'abgeschlossen': return cabinet.abgeschlossen
  }
}

// Produktblock 5 Abschnitt 5/11: EINE primäre Projekt-Direktaktion, exakt in
// derselben Prioritätsreihenfolge wie deriveNextAction() (blockiert → offener
// Blocker → wartet auf Freigabe → offene Pflichtaufgabe → offener Pflicht-
// Checklistenpunkt → bereite/aktive Phase) — keine zweite Next-Step-Engine,
// nur dieselbe Priorität als klickbares Ziel auf bereits bestehende
// Ankerpunkte derselben Seite statt als reiner Text.
function projektDirekteAktion(
  stages: DerivedCollaborationStage[],
  offeneBlockerAnzahl: number,
  offeneAufgabenAnzahl: number,
  offenePflichtCheckpunkteVorhanden: boolean,
): { href: string; label: string } | null {
  if (stages.some((s) => s.derivedStatus === 'BLOCKED') || offeneBlockerAnzahl > 0) return { href: '#blocker', label: 'Blocker bearbeiten' }
  if (stages.some((s) => s.derivedStatus === 'WAITING_FOR_APPROVAL')) return { href: '#freigaben', label: 'Freigabe bearbeiten' }
  if (offeneAufgabenAnzahl > 0) return { href: '#aufgaben', label: 'Aufgabe bearbeiten' }
  if (offenePflichtCheckpunkteVorhanden) return { href: '#checkliste', label: 'Checkliste bearbeiten' }
  if (stages.some((s) => s.derivedStatus === 'READY' || s.derivedStatus === 'IN_PROGRESS')) return { href: '#stage-title', label: 'Phase öffnen' }
  return null
}

export default async function CollaborationProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const query = await searchParams
  const filterParam = typeof query.filter === 'string' ? query.filter : 'alle'
  const filter: CabinetFilter = (Object.keys(CABINET_FILTER_LABELS) as CabinetFilter[]).includes(filterParam as CabinetFilter) ? (filterParam as CabinetFilter) : 'alle'
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, 200) : ''

  const project = await getCollaborationPhase2Project(id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  const activity = await getRecentCollaborationActivity(id)
  // Produktblock 2: dieselbe, bereits für das Dashboard (REQ-014) gebaute
  // Cross-Projekt-Ableitung — hier nur auf dieses eine Projekt gefiltert.
  // Kein zweiter Query-Pfad/keine zweite Cabinet-Statuslogik.
  const gga = await getGgaControlTowerOverview()
  const projectCabinets: GgaControlTowerCabinetEntry[] = gga.alleSchraenke.filter((cabinet) => cabinet.projectId === id)
  const projectHandlungsbedarf: GgaControlTowerUrgentCabinet[] = gga.dringendeSchraenke.filter((cabinet) => cabinet.projectId === id)

  const tasks = project.stages.flatMap((stage) => (stage.tasks ?? []).map((task) => ({ ...task, stageTitle: stage.title })))
  const openTasks = tasks.filter((task) => task.isRequired && !['DONE', 'SKIPPED'].includes(task.status))
  const checklist = project.stages.flatMap((stage) => (stage.checklistItems ?? []).map((item) => ({ ...item, stageTitle: stage.title })))
  const blockers = project.stages.flatMap((stage) => (stage.blockers ?? []).map((blocker) => ({ ...blocker, stageTitle: stage.title }))).filter((item) => item.status === 'OPEN')
  const approvals = project.stages.flatMap((stage) => (stage.approvals ?? []).map((approval) => ({ ...approval, stageTitle: stage.title }))).filter((item) => item.status === 'REQUESTED')
  const canSeeCreationForms = !['COLLAB_VIEWER', 'OPERATOR'].includes(project.role)
  // REQ-016: dieselbe Bedingung wie project.nextAction === 'Projektabschluss
  // prüfen' (deriveNextAction), hier explizit ausgewertet, um den COMPLETED-
  // Übergang in der UI nur anzubieten, wenn er auch serverseitig zulässig
  // wäre — kein Ersatz für den Server-Guard, nur dieselbe Ableitung gespiegelt.
  const canCompleteNow = getProjectCompletionBlocker(project.stages) === null
  const allowedProjectTransitions = (COLLABORATION_PROJECT_STATUS_TRANSITIONS[project.status as keyof typeof COLLABORATION_PROJECT_STATUS_TRANSITIONS] ?? [])
    .filter((target) => target !== 'COMPLETED' || canCompleteNow)

  const schraenkeMitHandlungsbedarf = projectCabinets.filter(ggaCabinetHatHandlungsbedarf).length
  const pruefungenOffen = projectCabinets.filter((c) => c.pruefungOffen).length
  const freigabenOffen = projectCabinets.filter((c) => c.freigabeOffen || c.betreiberfreigabeAusstehend).length
  const maengelOffen = projectCabinets.reduce((sum, c) => sum + c.offeneBlocker, 0)

  // Produktblock 2 Abschnitt 10: Kritisch vor Handlungsbedarf vor Achtung vor
  // "normal in Arbeit" vor Abgeschlossen — innerhalb gleicher Priorität nach
  // Kennung. Reine Anzeige-Sortierung, ändert keinen Workflow-Zustand.
  const sichtbareSchraenke = projectCabinets
    .filter((c) => matchesCabinetFilter(c, filter))
    .filter((c) => !search || `${c.kennung} ${c.standort ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const rankA = GGA_PRESENTATION_STATUS_RANK[deriveGgaCabinetPresentationStatus(a)]
      const rankB = GGA_PRESENTATION_STATUS_RANK[deriveGgaCabinetPresentationStatus(b)]
      return rankA - rankB || a.kennung.localeCompare(b.kennung)
    })

  // Produktblock 5 Abschnitt 5: "aktuelle Phase" — bereits bestehende
  // Ableitung (erste IN_PROGRESS-Stage), nicht neu berechnet.
  const aktuellePhase = project.stages.find((stage) => stage.derivedStatus === 'IN_PROGRESS')
  const direkteAktion = projektDirekteAktion(project.stages, blockers.length, openTasks.length, checklist.some((c) => c.isRequired && !c.completed))

  // Produktblock 5 Abschnitt 2/4/8/9: Timeline-Zeile je Phase — ausschließlich
  // bereits vorhandene Ableitungen kombiniert (derivedStatus, getStageCompletion-
  // Blocker, satisfiesRequiredStatus, GGA-05.1-Phasenausrichtung, presentationStatus).
  const timeline = project.stages.map((stage) => {
    const reason = getStageCompletionBlocker(stage)
    const wartetAuf = deriveStageDependencyWaitReason(stage, project.stages, (status) => COLLABORATION_STAGE_STATUS_LABELS[status])
    const offenePunkte = (stage.tasks ?? []).filter((t) => t.isRequired && !['DONE', 'SKIPPED'].includes(t.status)).length
      + (stage.checklistItems ?? []).filter((c) => c.isRequired && !c.completed).length
    const offeneBlocker = (stage.blockers ?? []).filter((b) => b.status === 'OPEN').length
    const lifecycle = STAGE_CODE_TO_LIFECYCLE[stage.code]
    const schraenkeInPhase = lifecycle ? projectCabinets.filter((c) => c.lifecycleStage === lifecycle) : []
    const handlungsbedarfInPhase = schraenkeInPhase.filter(ggaCabinetHatHandlungsbedarf).length
    return {
      stage, reason, wartetAuf, offenePunkte, offeneBlocker,
      fortschritt: calculateStageProgress(stage),
      // Solange eine Abhängigkeit noch nicht erfüllt ist, ist die Phase noch
      // nicht bearbeitbar — keine Aktion anbieten, auch wenn getStageCompletion-
      // Blocker (unabhängig von Dependencies) bereits einen Grund liefert.
      aktion: wartetAuf ? null : phaseAktion(stage, reason),
      schraenkeInPhase: schraenkeInPhase.length,
      handlungsbedarfInPhase,
    }
  })

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-600 uppercase tracking-[0.18em] text-blue-700">Projektarbeitsplatz</p>
        <h1 className="mt-2 text-3xl font-600 tracking-tight">{project.projectNumber ? `${project.projectNumber} · ` : ''}{project.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{[project.location, project.building, project.floor].filter(Boolean).join(' · ') || 'Keine Ortsangaben hinterlegt'}</p>
      </div>
      <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-600">{COLLABORATION_PROJECT_STATUS_LABELS[project.status as keyof typeof COLLABORATION_PROJECT_STATUS_LABELS]}</span><span className={`rounded-full px-3 py-1.5 text-xs font-600 ${healthBadgeClass[project.healthStatus] ?? healthBadgeClass.GREEN}`}>{COLLABORATION_HEALTH_STATUS_LABELS[project.healthStatus]}</span></div>
    </div>
    <div className="mt-3"><CollaborationProjectStatusActions projectId={project.id} role={project.role} allowedTransitions={allowedProjectTransitions} /></div>

    {/* Kompakter Projektkopf (Produktblock 2 Abschnitt 2, Produktblock 5 Abschnitt 5): Lageübersicht statt großer KPI-Karten */}
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Aktuelle Phase</p><p className="mt-1 text-sm font-600">{aktuellePhase?.title ?? '–'}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Fortschritt</p><p className="mt-1 text-xl font-600">{project.progressPercent === null ? '—' : `${project.progressPercent} %`}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Schränke</p><p className="mt-1 text-xl font-600">{projectCabinets.length}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Handlungsbedarf</p><p className={`mt-1 text-xl font-600 ${schraenkeMitHandlungsbedarf ? 'text-red-700' : ''}`}>{schraenkeMitHandlungsbedarf}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Prüfungen offen</p><p className={`mt-1 text-xl font-600 ${pruefungenOffen ? 'text-amber-700' : ''}`}>{pruefungenOffen}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Freigaben offen</p><p className={`mt-1 text-xl font-600 ${freigabenOffen ? 'text-amber-700' : ''}`}>{freigabenOffen}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Mängel/Blocker offen</p><p className={`mt-1 text-xl font-600 ${maengelOffen ? 'text-red-700' : ''}`}>{maengelOffen}</p></div>
    </div>

    {/* Nächster Schritt (Produktblock 5 Abschnitt 5/11): project.nextAction bereits bestehend (deriveNextAction) — hier nur zusätzlich mit EINER primären Direktaktion */}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 px-5 py-4">
      <div><p className="text-xs font-600 uppercase tracking-wide text-blue-800">Nächster Schritt</p><p className="mt-1 text-lg font-600 text-stone-900">{project.nextAction}</p></div>
      {direkteAktion && <Link href={direkteAktion.href} className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-sm font-600 text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{direkteAktion.label} →</Link>}
    </div>

    {/* Projekt-Timeline (Produktblock 5 Abschnitt 2/3/4/8/9): kompakte, operative Phasen-Timeline — ersetzt den bisherigen reinen Symbol-Streifen, keine zweite Phasenlogik */}
    <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex min-w-[900px] divide-x divide-stone-100 sm:min-w-0 sm:flex-wrap sm:divide-x-0 sm:divide-y">
        {timeline.map((entry) => <div key={entry.stage.id} className="flex-1 px-4 py-4 sm:flex-none">
          <p className="flex items-center gap-1.5 text-sm font-600">
            <span aria-hidden="true" className={STAGE_SYMBOL[entry.stage.derivedStatus].className}>{STAGE_SYMBOL[entry.stage.derivedStatus].symbol}</span>
            <span className="text-stone-900">{entry.stage.title}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{COLLABORATION_STAGE_STATUS_LABELS[entry.stage.derivedStatus]}</p>
          {entry.fortschritt !== null && <div className="mt-2 flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-stone-700" style={{ width: `${entry.fortschritt}%` }} /></div><span className="text-xs tabular-nums text-muted-foreground">{entry.fortschritt}%</span></div>}
          {(entry.offenePunkte > 0 || entry.offeneBlocker > 0) && <p className="mt-2 text-xs text-muted-foreground">{entry.offenePunkte > 0 ? `${entry.offenePunkte} offene Punkt${entry.offenePunkte === 1 ? '' : 'e'}` : ''}{entry.offenePunkte > 0 && entry.offeneBlocker > 0 ? ' · ' : ''}{entry.offeneBlocker > 0 ? <span className="font-600 text-red-700">{entry.offeneBlocker} Blocker</span> : ''}</p>}
          {entry.wartetAuf && <p className="mt-2 text-xs text-amber-700">{entry.wartetAuf}</p>}
          {!entry.wartetAuf && entry.reason && <p className="mt-2 text-xs text-slate-700">{entry.reason}</p>}
          {entry.schraenkeInPhase > 0 && <p className="mt-2 text-xs text-muted-foreground">{entry.schraenkeInPhase} {entry.schraenkeInPhase === 1 ? 'Schrank' : 'Schränke'}{entry.handlungsbedarfInPhase > 0 ? <Link href={`/collaboration/projects/${id}?filter=handlungsbedarf#schrankmatrix`} className="ml-1 font-600 text-red-700 hover:underline">· {entry.handlungsbedarfInPhase} kritisch</Link> : null}</p>}
          {entry.aktion && <Link href={entry.aktion.href} className="mt-2 inline-block text-xs font-600 text-blue-700 hover:underline">{entry.aktion.label} →</Link>}
        </div>)}
      </div>
    </div>

    {/* Aktivitätsverlauf (Produktblock 5 Abschnitt 6/7): direkt unterhalb der Timeline, ausschließlich bereits persistierte Ereignisse (getRecentCollaborationActivity) */}
    <section aria-labelledby="activity-title" className="mt-4 rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-5 py-4"><h2 id="activity-title" className="font-600">Aktivitätsverlauf</h2></div>
      <ul className="divide-y divide-stone-100">{activity.map((event) => <li key={event.id} className="px-5 py-3"><p>{event.label}</p><p className="text-xs text-muted-foreground">{event.stage ? `${event.stage} · ` : ''}{event.at.toLocaleString('de-DE')}</p></li>)}</ul>
      {activity.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Noch keine Aktivitäten.</p>}
    </section>

    {/* Handlungsbedarf (Produktblock 2 Abschnitt 4): nur Schränke dieses Projekts mit tatsächlicher Aktion */}
    <div className="mt-6 rounded-xl border border-red-200 bg-white shadow-sm">
      <div className="border-b border-red-100 px-5 py-4"><h2 className="font-600 text-red-800">Handlungsbedarf <span className="text-sm font-normal text-muted-foreground">({projectHandlungsbedarf.length})</span></h2></div>
      <ul className="divide-y divide-stone-100">
        {projectHandlungsbedarf.map((cabinet) => {
          const aktion = direkteGgaHandlungsbedarfAktion(cabinet.cabinetId, cabinet.gruende)
          return <li key={cabinet.cabinetId} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.6fr)_auto] md:items-start">
            <div className="min-w-0">
              <p className="font-600">{cabinet.kennung}</p>
              <p className="truncate text-xs text-muted-foreground">{cabinet.standort ?? '–'}</p>
            </div>
            <span className="w-fit shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-600 text-stone-700 md:mt-0.5">{GGA_LIFECYCLE_STAGE_LABELS[cabinet.lifecycleStage]}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1">{cabinet.gruende.map((grund) => <span key={grund} className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-600 text-red-800">{GGA_CONTROL_TOWER_REASON_LABELS[grund]}</span>)}</div>
              <p className="mt-1.5 text-xs text-slate-700"><span className="text-muted-foreground">Nächster Schritt:</span> {naechsterSchrittFuerCabinet(cabinet)}</p>
            </div>
            <Link href={aktion.href} className="w-fit shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-600 text-stone-800 hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{aktion.label} →</Link>
          </li>
        })}
      </ul>
      {projectHandlungsbedarf.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Kein Handlungsbedarf — alle GGA-Schränke dieses Projekts im grünen Bereich.</p>}
    </div>

    {/* Schrankmatrix (Produktblock 2 Abschnitt 5): zentrale Arbeitsmatrix aller Schränke dieses Projekts */}
    <div id="schrankmatrix" className="mt-6 scroll-mt-4 rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
        <h2 className="font-600">Schrankmatrix <span className="text-sm font-normal text-muted-foreground">({sichtbareSchraenke.length} von {projectCabinets.length})</span></h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(CABINET_FILTER_LABELS) as CabinetFilter[]).map((f) => {
              const sp = new URLSearchParams()
              if (f !== 'alle') sp.set('filter', f)
              if (search) sp.set('q', search)
              const qs = sp.toString()
              return <Link key={f} href={qs ? `/collaboration/projects/${id}?${qs}` : `/collaboration/projects/${id}`} className={`rounded-full border px-3 py-1 text-xs font-600 ${filter === f ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 text-stone-700 hover:border-stone-500'}`}>{CABINET_FILTER_LABELS[f]}</Link>
            })}
          </div>
          <form className="flex items-center gap-2">
            <input type="search" name="q" defaultValue={search} placeholder="Schrank suchen …" maxLength={200} className="h-8 w-44 rounded-md border border-stone-300 bg-white px-3 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600" />
            {filter !== 'alle' && <input type="hidden" name="filter" value={filter} />}
            <button type="submit" className="h-8 rounded-md border border-stone-300 bg-white px-3 text-xs font-600 hover:border-blue-400">Suchen</button>
          </form>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-2 font-600">Schrank</th><th className="px-3 py-2 font-600">Bereich / Ort</th><th className="px-3 py-2 font-600">Phase</th><th className="px-3 py-2 font-600">Fortschritt</th><th className="px-3 py-2 font-600">Status</th><th className="px-3 py-2 font-600">Prüfung</th><th className="px-3 py-2 font-600">Freigabe</th><th className="px-3 py-2 font-600">Nächster Schritt</th><th className="px-3 py-2 font-600">Aktion</th></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {sichtbareSchraenke.map((cabinet) => {
              const status = deriveGgaCabinetPresentationStatus(cabinet)
              const aktion = direkteGgaCabinetAktion(cabinet)
              return <tr key={cabinet.id} className="hover:bg-stone-50">
                <td className="px-5 py-3"><Link href={`/collaboration/cabinets/${cabinet.id}`} className="font-600 text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{cabinet.kennung}</Link></td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{cabinet.standort || '–'}</td>
                <td className="px-3 py-3 text-xs">{GGA_LIFECYCLE_STAGE_LABELS[cabinet.lifecycleStage]}</td>
                <td className="px-3 py-3"><ProgressBar value={aktuellerGgaFortschritt(cabinet)} /></td>
                <td className="px-3 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-600 ${GGA_STATUS_BADGE_CLASS[status]}`}>{GGA_STATUS_LABELS[status]}</span></td>
                <td className="px-3 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-600 ${GGA_BETRIEBSSTATUS_BADGE_CLASS[cabinet.betriebsstatus]}`}>{formatGgaBetriebsstatusLabel(cabinet.betriebsstatus, cabinet.betriebsstatusTageBisFaellig)}</span></td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{freigabeSpalte(cabinet)}</td>
                <td className="px-3 py-3 text-xs text-slate-700">{naechsterSchrittFuerCabinet(cabinet)}</td>
                <td className="px-3 py-3"><Link href={aktion.href} className="text-xs font-600 text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{aktion.label} →</Link></td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      {sichtbareSchraenke.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">{projectCabinets.length === 0 ? 'Noch keine GGA-Schränke in diesem Projekt.' : 'Keine Schränke in dieser Ansicht.'}</p>}
    </div>

    <section aria-labelledby="stage-title" className="mt-8 rounded-xl border border-stone-200 bg-white shadow-sm"><div className="border-b border-stone-200 px-5 py-4"><h2 id="stage-title" className="font-600">Projektphasen</h2></div><ol className="divide-y divide-stone-100">{project.stages.map((stage) => <li key={stage.id} className="px-5 py-5"><div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-600 text-white" aria-hidden="true">{stage.sequence}</span><div><p className="font-600">{stage.title}</p><p className="mt-1 text-sm text-muted-foreground">{stage.code} · {COLLABORATION_STAGE_STATUS_LABELS[stage.derivedStatus]}</p></div><span className="text-sm text-muted-foreground">{stage.weight > 0 ? `${stage.weight} % Gewicht` : 'Ohne Gewicht'}</span></div><CollaborationStageActions stage={stage} role={project.role} projectId={project.id} memberships={project.memberships} showCreationForms={canSeeCreationForms} /></li>)}</ol></section>

    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section id="aufgaben" aria-labelledby="tasks-title" className="scroll-mt-4 rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="tasks-title" className="font-600">Aufgaben <span className="text-sm font-normal text-muted-foreground">({tasks.length})</span></h2><Link href="/collaboration/tasks" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-stone-100">{tasks.slice(0, 8).map((task) => <li key={task.id} className="px-5 py-3"><p className="font-600">{task.title}</p><p className="text-xs text-muted-foreground">{task.stageTitle} · {task.status} · {task.isRequired ? 'Erforderlich' : 'Optional'}</p></li>)}</ul>{tasks.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine Aufgaben.</p>}</section>
      <section id="checkliste" aria-labelledby="checklist-title" className="scroll-mt-4 rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="checklist-title" className="font-600">Checkliste <span className="text-sm font-normal text-muted-foreground">({checklist.length})</span></h2><Link href="/collaboration/checklists" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-stone-100">{checklist.slice(0, 8).map((item) => <li key={item.id} className="flex items-center gap-3 px-5 py-3"><span aria-hidden="true">{item.completed ? '✓' : '○'}</span><span>{item.title}</span><span className="ml-auto text-xs text-muted-foreground">{item.stageTitle}</span></li>)}</ul>{checklist.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine Checklistenpunkte.</p>}</section>
      <section id="blocker" aria-labelledby="blockers-title" className="scroll-mt-4 rounded-xl border border-red-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-red-100 px-5 py-4"><h2 id="blockers-title" className="font-600 text-red-800">Offene Blocker <span className="text-sm font-normal">({blockers.length})</span></h2><Link href="/collaboration/blockers" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-red-100">{blockers.map((blocker) => <li key={blocker.id} className="px-5 py-3"><p className="font-600">{blocker.title}</p><p className="text-xs text-muted-foreground">{blocker.stageTitle}</p></li>)}</ul>{blockers.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine offenen Blocker.</p>}</section>
      <section id="freigaben" aria-labelledby="approvals-title" className="scroll-mt-4 rounded-xl border border-amber-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-amber-100 px-5 py-4"><h2 id="approvals-title" className="font-600 text-amber-800">Ausstehende Freigaben <span className="text-sm font-normal">({approvals.length})</span></h2><Link href="/collaboration/approvals" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-amber-100">{approvals.map((approval) => <li key={approval.id} className="px-5 py-3"><p className="font-600">{approval.stageTitle}</p><p className="text-xs text-muted-foreground">Angefordert {approval.requestedAt.toLocaleDateString('de-DE')}</p></li>)}</ul>{approvals.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine ausstehenden Freigaben.</p>}</section>
    </div>

    <section aria-labelledby="team-title" className="mt-8 rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="team-title" className="font-600">Team <span className="text-sm font-normal text-muted-foreground">({project.memberships.length})</span></h2><Link href={`/collaboration/team?project=${project.id}`} className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-stone-100 sm:grid sm:grid-cols-2 sm:divide-y-0">{project.memberships.map((member) => <li key={member.id} className="px-5 py-3"><p className="font-600">{member.user.firstName} {member.user.lastName}</p><p className="text-xs text-muted-foreground">{COLLABORATION_ROLE_LABELS[member.role as CollaborationRole]}</p></li>)}</ul>{project.memberships.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine Beteiligten hinterlegt.</p>}</section>
  </div>
}
