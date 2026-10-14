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
import { calendarDaysUntil, formatBerlinDate, formatBerlinDateTimeWithSeconds, formatCalendarDateCompact } from '@/lib/utils/berlin-date'
import {
  COLLABORATION_STAGE_STATUS_LABELS, COLLABORATION_PROJECT_STATUS_LABELS, COLLABORATION_ROLE_LABELS, COLLABORATION_HEALTH_STATUS_LABELS,
  type CollaborationRole, type CollaborationStageStatus,
} from '@/types/enums'
import { CollaborationStageActions } from '@/components/collaboration/CollaborationStageActions'
import { CollaborationProjectStatusActions } from '@/components/collaboration/CollaborationProjectStatusActions'
import { CollaborationProjectDeleteAction } from '@/components/collaboration/CollaborationProjectDeleteAction'

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
  const selectedStageId = typeof query.stage === 'string' ? query.stage : null

  const project = await getCollaborationPhase2Project(id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  const activity = await getRecentCollaborationActivity(id, 5)
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
  const ausgewaehltePhase = project.stages.find((stage) => stage.id === selectedStageId) ?? aktuellePhase ?? project.stages.find((stage) => stage.derivedStatus === 'READY') ?? project.stages[0] ?? null
  const phaseHref = (stageId: string) => `/collaboration/projects/${id}?stage=${encodeURIComponent(stageId)}#selected-phase-title`
  const meilensteine = (ausgewaehltePhase?.tasks ?? []).filter((task) => task.dueDate).slice(0, 5)
  const direkteAktion = projektDirekteAktion(project.stages, blockers.length, openTasks.length, checklist.some((c) => c.isRequired && !c.completed))
  // Verbleibende Zeit: nur berechnet, wenn ein echter Phasentermin hinterlegt
  // ist (kein erfundener Wert) — ganze Kalendertage bis plannedEnd, negativ
  // bei Überschreitung.
  const verbleibendeZeit = ausgewaehltePhase?.plannedEnd
    ? calendarDaysUntil(ausgewaehltePhase.plannedEnd, new Date())
    : null

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
        {/* Business → Collaboration Handover V1 (Abschnitt 10): kaufmännische
            Referenzen nur, wenn über Project → Order/Offer/Kundenbestellung
            tatsächlich vorhanden — keine erfundenen Werte. */}
        {project.commercialReference && <p className="mt-1 text-xs text-muted-foreground">
          {project.commercialReference.customerName}
          {project.commercialReference.orderNumber ? ` · Auftrag ${project.commercialReference.orderNumber}` : ''}
          {project.commercialReference.offerNumber ? ` · Angebot ${project.commercialReference.offerNumber}` : ''}
          {project.commercialReference.customerPurchaseOrderNumber ? ` · Kundenbestellung ${project.commercialReference.customerPurchaseOrderNumber}` : ''}
        </p>}
      </div>
      <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-600">{COLLABORATION_PROJECT_STATUS_LABELS[project.status as keyof typeof COLLABORATION_PROJECT_STATUS_LABELS]}</span><span className={`rounded-full px-3 py-1.5 text-xs font-600 ${healthBadgeClass[project.healthStatus] ?? healthBadgeClass.GREEN}`}>{COLLABORATION_HEALTH_STATUS_LABELS[project.healthStatus]}</span></div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3"><CollaborationProjectStatusActions projectId={project.id} role={project.role} allowedTransitions={allowedProjectTransitions} /><CollaborationProjectDeleteAction projectId={project.id} projectNumber={project.projectNumber} projectName={project.name} role={project.role} /></div>

    <nav aria-label="Projektbereiche" className="mt-5 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex min-w-max items-center gap-1 px-3 py-2 text-sm">
        <a href="#selected-phase-title" className="rounded-md bg-blue-50 px-3 py-2 font-600 text-blue-800">Übersicht</a>
        <a href="#aufgaben" className="rounded-md px-3 py-2 text-stone-700 hover:bg-stone-50">Aufgaben <span className="text-xs text-muted-foreground">{tasks.length}</span></a>
        <a href="#checkliste" className="rounded-md px-3 py-2 text-stone-700 hover:bg-stone-50">Checklisten <span className="text-xs text-muted-foreground">{checklist.length}</span></a>
        <a href="#schrankmatrix" className="rounded-md px-3 py-2 text-stone-700 hover:bg-stone-50">GGA-Schränke <span className="text-xs text-muted-foreground">{projectCabinets.length}</span></a>
        <a href="#freigaben" className="rounded-md px-3 py-2 text-stone-700 hover:bg-stone-50">Freigaben <span className="text-xs text-muted-foreground">{approvals.length}</span></a>
        <a href="#blocker" className="rounded-md px-3 py-2 text-stone-700 hover:bg-stone-50">Blocker <span className={`text-xs ${blockers.length ? 'font-600 text-red-700' : 'text-muted-foreground'}`}>{blockers.length}</span></a>
        <a href="#activity-title" className="rounded-md px-3 py-2 text-stone-700 hover:bg-stone-50">Aktivitäten</a>
      </div>
    </nav>

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
      <div className="relative flex min-w-[900px] px-4 py-5 sm:min-w-0">
        <div aria-hidden="true" className="absolute left-12 right-12 top-[38px] h-px bg-stone-200" />
        {timeline.map((entry) => <div key={entry.stage.id} className="relative z-10 min-w-[170px] flex-1 px-2 text-center">
          <Link href={phaseHref(entry.stage.id)} className={`group block rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${ausgewaehltePhase?.id === entry.stage.id ? 'bg-blue-50' : ''}`}>
            <span aria-hidden="true" className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white text-sm font-700 ${entry.stage.derivedStatus === 'IN_PROGRESS' ? 'border-blue-600 text-blue-700' : entry.stage.derivedStatus === 'BLOCKED' ? 'border-red-600 text-red-700' : entry.stage.derivedStatus === 'COMPLETED' || entry.stage.derivedStatus === 'SKIPPED' ? 'border-emerald-600 text-emerald-700' : 'border-stone-300 text-stone-400'}`}>{STAGE_SYMBOL[entry.stage.derivedStatus].symbol}</span>
            <p className="mt-2 text-sm font-600 text-stone-900 group-hover:text-blue-700">{entry.stage.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{COLLABORATION_STAGE_STATUS_LABELS[entry.stage.derivedStatus]}</p>
          </Link>
          {entry.fortschritt !== null && <div className="mt-2 flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-stone-700" style={{ width: `${entry.fortschritt}%` }} /></div><span className="text-xs tabular-nums text-muted-foreground">{entry.fortschritt}%</span></div>}
          {(entry.offenePunkte > 0 || entry.offeneBlocker > 0) && <p className="mt-2 text-xs text-muted-foreground">{entry.offenePunkte > 0 ? `${entry.offenePunkte} offene Punkt${entry.offenePunkte === 1 ? '' : 'e'}` : ''}{entry.offenePunkte > 0 && entry.offeneBlocker > 0 ? ' · ' : ''}{entry.offeneBlocker > 0 ? <span className="font-600 text-red-700">{entry.offeneBlocker} Blocker</span> : ''}</p>}
          {entry.wartetAuf && <p className="mt-2 text-xs text-amber-700">{entry.wartetAuf}</p>}
          {!entry.wartetAuf && entry.reason && <p className="mt-2 text-xs text-slate-700">{entry.reason}</p>}
          {entry.schraenkeInPhase > 0 && <p className="mt-2 text-xs text-muted-foreground">{entry.schraenkeInPhase} {entry.schraenkeInPhase === 1 ? 'Schrank' : 'Schränke'}{entry.handlungsbedarfInPhase > 0 ? <Link href={`/collaboration/projects/${id}?filter=handlungsbedarf#schrankmatrix`} className="ml-1 font-600 text-red-700 hover:underline">· {entry.handlungsbedarfInPhase} kritisch</Link> : null}</p>}
          {entry.aktion && <Link href={entry.aktion.href} className="mt-2 inline-block text-xs font-600 text-blue-700 hover:underline">{entry.aktion.label} →</Link>}
        </div>)}
      </div>
    </div>

    {ausgewaehltePhase && <section aria-labelledby="selected-phase-title" className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/60 px-5 py-4">
          <div><p className="text-xs font-600 uppercase tracking-wide text-blue-700">Ausgewählte Phase</p><h2 id="selected-phase-title" className="mt-1 text-xl font-600">{ausgewaehltePhase.title}</h2><p className="mt-1 text-sm text-muted-foreground">{COLLABORATION_STAGE_STATUS_LABELS[ausgewaehltePhase.derivedStatus]}</p></div>
          <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-600 text-blue-800">{calculateStageProgress(ausgewaehltePhase) === null ? 'Fortschritt offen' : `${calculateStageProgress(ausgewaehltePhase)} % Fortschritt`}</span>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <div className="rounded-lg border border-stone-200 p-4"><h3 className="font-600">Fortschritt</h3><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${calculateStageProgress(ausgewaehltePhase) ?? 0}%` }} /></div><span className="text-sm font-600 tabular-nums">{calculateStageProgress(ausgewaehltePhase) === null ? '–' : `${calculateStageProgress(ausgewaehltePhase)} %`}</span></div><p className="mt-3 text-xs text-muted-foreground">{ausgewaehltePhase.tasks?.filter((task) => task.isRequired && ['DONE', 'SKIPPED'].includes(task.status)).length ?? 0} von {(ausgewaehltePhase.tasks ?? []).filter((task) => task.isRequired).length} Pflichtaufgaben erledigt</p></div>
          <div className="rounded-lg border border-stone-200 p-4"><h3 className="font-600">Pflichtpunkte</h3><ul className="mt-3 space-y-2 text-sm">{(ausgewaehltePhase.checklistItems ?? []).filter((item) => item.isRequired).slice(0, 5).map((item) => <li key={item.id} className="flex items-start gap-2"><span className={item.completed ? 'text-emerald-600' : 'text-stone-400'} aria-hidden="true">{item.completed ? '✓' : '○'}</span><span className={item.completed ? 'text-stone-600' : 'text-stone-900'}>{item.title}</span></li>)}{!(ausgewaehltePhase.checklistItems ?? []).some((item) => item.isRequired) && <li className="text-xs text-muted-foreground">Keine Pflichtpunkte hinterlegt.</li>}</ul><h3 className="mt-5 border-t border-stone-100 pt-4 text-xs font-600 uppercase tracking-wide text-muted-foreground">Meilensteine</h3><ul className="mt-2 space-y-2 text-xs">{meilensteine.map((task) => <li key={task.id} className="flex items-start justify-between gap-2"><span>{task.title}</span><span className="shrink-0 tabular-nums text-muted-foreground">{(task.dueDate ? formatCalendarDateCompact(task.dueDate) : undefined)}</span></li>)}{meilensteine.length === 0 && <li className="text-muted-foreground">Keine Fristen hinterlegt.</li>}</ul></div>
          <div className="rounded-lg border border-stone-200 p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-600">Aufgaben / Checkliste</h3><span className="text-xs text-muted-foreground">{(ausgewaehltePhase.tasks ?? []).filter((task) => task.isRequired && ['DONE', 'SKIPPED'].includes(task.status)).length} / {(ausgewaehltePhase.tasks ?? []).filter((task) => task.isRequired).length}</span></div><ul className="mt-3 space-y-2 text-sm">{(ausgewaehltePhase.tasks ?? []).filter((task) => task.isRequired).slice(0, 5).map((task) => <li key={task.id} className="flex items-start gap-2"><span className={['DONE', 'SKIPPED'].includes(task.status) ? 'text-emerald-600' : 'text-stone-400'} aria-hidden="true">{['DONE', 'SKIPPED'].includes(task.status) ? '✓' : '○'}</span><span>{task.title}</span></li>)}{!(ausgewaehltePhase.tasks ?? []).some((task) => task.isRequired) && <li className="text-xs text-muted-foreground">Keine Pflichtaufgaben hinterlegt.</li>}</ul></div>
        </div>
      </div>
      <aside aria-labelledby="phase-status-title" className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 id="phase-status-title" className="font-600">Status & nächste Schritte</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">Projektstart</dt><dd className="mt-1 font-600">{project.plannedStart ? formatCalendarDateCompact(project.plannedStart) : 'Kein Termin hinterlegt'}</dd></div><div><dt className="text-xs text-muted-foreground">Geplantes Ende der Phase</dt><dd className="mt-1 font-600">{ausgewaehltePhase.plannedEnd ? formatCalendarDateCompact(ausgewaehltePhase.plannedEnd) : 'Kein Termin hinterlegt'}</dd></div>{verbleibendeZeit !== null && <div><dt className="text-xs text-muted-foreground">Verbleibende Zeit</dt><dd className={`mt-1 font-600 ${verbleibendeZeit < 0 ? 'text-red-700' : verbleibendeZeit <= 2 ? 'text-amber-700' : ''}`}>{verbleibendeZeit < 0 ? `${Math.abs(verbleibendeZeit)} Tag${Math.abs(verbleibendeZeit) === 1 ? '' : 'e'} überfällig` : verbleibendeZeit === 0 ? 'Heute fällig' : `noch ${verbleibendeZeit} Tag${verbleibendeZeit === 1 ? '' : 'e'}`}</dd></div>}<div><dt className="text-xs text-muted-foreground">Abhängigkeiten</dt><dd className="mt-1">{deriveStageDependencyWaitReason(ausgewaehltePhase, project.stages, (status) => COLLABORATION_STAGE_STATUS_LABELS[status]) ?? 'Keine offenen Abhängigkeiten'}</dd></div><div><dt className="text-xs text-muted-foreground">Blocker</dt><dd className={ausgewaehltePhase.blockers?.length ? 'mt-1 font-600 text-red-700' : 'mt-1'}>{ausgewaehltePhase.blockers?.length ? `${ausgewaehltePhase.blockers.length} offen` : 'Keine offenen Blocker'}</dd></div><div><dt className="text-xs text-muted-foreground">Freigabe</dt><dd className="mt-1">{ausgewaehltePhase.approvals?.some((approval) => approval.status === 'REQUESTED') ? 'Freigabe ausstehend' : ausgewaehltePhase.requiresApproval ? 'Keine offene Freigabe' : 'Nicht erforderlich'}</dd></div></dl>{direkteAktion && <Link href={direkteAktion.href} className="mt-5 block rounded-lg bg-blue-700 px-4 py-3 text-center text-sm font-600 text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Nächsten Schritt bearbeiten →</Link>}</aside>
    </section>}

    {/* Aktivitätsverlauf (Produktblock 5 Abschnitt 6/7): direkt unterhalb der Timeline, ausschließlich bereits persistierte Ereignisse (getRecentCollaborationActivity) */}
    <section aria-labelledby="activity-title" className="mt-4 rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-5 py-4"><h2 id="activity-title" className="font-600">Aktivitätsverlauf</h2></div>
      <ul className="divide-y divide-stone-100">{activity.map((event) => <li key={event.id} className="px-5 py-3"><p>{event.label}</p><p className="text-xs text-muted-foreground">{event.stage ? `${event.stage} · ` : ''}{formatBerlinDateTimeWithSeconds(event.at)}</p></li>)}</ul>
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

    <section aria-labelledby="stage-title" className="mt-8 rounded-xl border border-stone-200 bg-white shadow-sm"><div className="border-b border-stone-200 px-5 py-4"><h2 id="stage-title" className="font-600">Pipeline-Arbeitsbereich</h2><p className="mt-1 text-sm text-muted-foreground">Wählen Sie oben eine Phase. Die fachlichen Aktionen und Inhalte bleiben je Phase gebündelt.</p></div><ol className="divide-y divide-stone-100">{project.stages.map((stage) => <li id={`phase-${stage.id}`} key={stage.id} className="scroll-mt-6 px-5 py-5"><div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-600 text-white" aria-hidden="true">{stage.sequence}</span><div><p className="font-600">{stage.title}</p><p className="mt-1 text-sm text-muted-foreground">{stage.code} · {COLLABORATION_STAGE_STATUS_LABELS[stage.derivedStatus]}</p></div><span className="text-sm text-muted-foreground">{stage.weight > 0 ? `${stage.weight} % Gewicht` : 'Ohne Gewicht'}</span></div><CollaborationStageActions stage={stage} role={project.role} projectId={project.id} memberships={project.memberships} showCreationForms={canSeeCreationForms} /></li>)}</ol></section>

    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section id="aufgaben" aria-labelledby="tasks-title" className="scroll-mt-4 rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="tasks-title" className="font-600">Aufgaben <span className="text-sm font-normal text-muted-foreground">({tasks.length})</span></h2><Link href="/collaboration/tasks" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-stone-100">{tasks.slice(0, 8).map((task) => <li key={task.id} className="px-5 py-3"><p className="font-600">{task.title}</p><p className="text-xs text-muted-foreground">{task.stageTitle} · {task.status} · {task.isRequired ? 'Erforderlich' : 'Optional'}</p></li>)}</ul>{tasks.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine Aufgaben.</p>}</section>
      <section id="checkliste" aria-labelledby="checklist-title" className="scroll-mt-4 rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="checklist-title" className="font-600">Checkliste <span className="text-sm font-normal text-muted-foreground">({checklist.length})</span></h2><Link href="/collaboration/checklists" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-stone-100">{checklist.slice(0, 8).map((item) => <li key={item.id} className="flex items-center gap-3 px-5 py-3"><span aria-hidden="true">{item.completed ? '✓' : '○'}</span><span>{item.title}</span><span className="ml-auto text-xs text-muted-foreground">{item.stageTitle}</span></li>)}</ul>{checklist.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine Checklistenpunkte.</p>}</section>
      <section id="blocker" aria-labelledby="blockers-title" className="scroll-mt-4 rounded-xl border border-red-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-red-100 px-5 py-4"><h2 id="blockers-title" className="font-600 text-red-800">Offene Blocker <span className="text-sm font-normal">({blockers.length})</span></h2><Link href="/collaboration/blockers" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-red-100">{blockers.map((blocker) => <li key={blocker.id} className="px-5 py-3"><p className="font-600">{blocker.title}</p><p className="text-xs text-muted-foreground">{blocker.stageTitle}</p></li>)}</ul>{blockers.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine offenen Blocker.</p>}</section>
      <section id="freigaben" aria-labelledby="approvals-title" className="scroll-mt-4 rounded-xl border border-amber-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-amber-100 px-5 py-4"><h2 id="approvals-title" className="font-600 text-amber-800">Ausstehende Freigaben <span className="text-sm font-normal">({approvals.length})</span></h2><Link href="/collaboration/approvals" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-amber-100">{approvals.map((approval) => <li key={approval.id} className="px-5 py-3"><p className="font-600">{approval.stageTitle}</p><p className="text-xs text-muted-foreground">Angefordert {formatBerlinDate(approval.requestedAt)}</p></li>)}</ul>{approvals.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine ausstehenden Freigaben.</p>}</section>
    </div>

    <section aria-labelledby="team-title" className="mt-8 rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="team-title" className="font-600">Team <span className="text-sm font-normal text-muted-foreground">({project.memberships.length})</span></h2><Link href={`/collaboration/team?project=${project.id}`} className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-stone-100 sm:grid sm:grid-cols-2 sm:divide-y-0">{project.memberships.map((member) => <li key={member.id} className="px-5 py-3"><p className="font-600">{member.user.firstName} {member.user.lastName}</p><p className="text-xs text-muted-foreground">{COLLABORATION_ROLE_LABELS[member.role as CollaborationRole]}</p></li>)}</ul>{project.memberships.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine Beteiligten hinterlegt.</p>}</section>
  </div>
}
