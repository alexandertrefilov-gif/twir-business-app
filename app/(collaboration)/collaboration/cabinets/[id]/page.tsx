import Link from 'next/link'
import { handleCollaborationPageError } from '@/lib/auth/collaboration-guards'
import { getGgaCabinetDetail, getGgaCabinetAuditHistory, getGgaCabinetPruefnachweisOverview, cabinetEditorRoles } from '@/lib/services/gga-cabinet.service'
import { editorRoles, getVisibleCollaborationMemberships } from '@/lib/services/collaboration-phase2.service'
import { GgaCabinetBlockerList } from '@/components/collaboration/GgaCabinetBlockerList'
import {
  GGA_EX_ASSESSMENT_LABELS, GGA_LIFECYCLE_STAGE_LABELS, GGA_BETREIBERSTATUS_LABELS, formatGgaBetriebsstatusLabel, GGA_BETRIEBSSTATUS_BADGE_CLASS,
  GGA_STATUS_LABELS, GGA_STATUS_BADGE_CLASS, GGA_PRUEFART_LABELS, GGA_PRUEFSTATUS_LABELS, GGA_CONTROL_TOWER_REASON_LABELS, GGA_PRUEFART_NAECHSTER_SCHRITT,
  deriveGgaCabinetPresentationStatus, naechsterSchrittFuerCabinet, direkteGgaCabinetAktion, aktuellerGgaFortschritt, deriveGgaProjectWorklist,
  direktAktionFuerWorklistTyp,
  type GgaControlTowerCabinetEntry, type GgaControlTowerReasonBadge, type GgaPruefart, type GgaWorklistCabinetInput,
  type GgaCabinetPruefstatus, type GgaCabinetBetreiberstatus,
} from '@/lib/collaboration/cabinet-workflow'
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

// Produktblock 3 Abschnitt 3: rein visuelle Übersetzung der bereits
// bestehenden, linearen GgaCabinetLifecycleStage-Reihenfolge (dieselben fünf
// Schlüssel/Labels wie GGA_LIFECYCLE_STAGE_LABELS) in ✓/●/○/! — keine neue
// State-Machine, nur ein Index-Vergleich mit der bereits abgeleiteten
// lifecycleStage.
const LIFECYCLE_ORDER = Object.keys(GGA_LIFECYCLE_STAGE_LABELS) as (keyof typeof GGA_LIFECYCLE_STAGE_LABELS)[]
function lifecycleSymbol(step: keyof typeof GGA_LIFECYCLE_STAGE_LABELS, current: keyof typeof GGA_LIFECYCLE_STAGE_LABELS, blockedAtCurrent: boolean): { symbol: string; className: string } {
  const stepIndex = LIFECYCLE_ORDER.indexOf(step)
  const currentIndex = LIFECYCLE_ORDER.indexOf(current)
  if (stepIndex < currentIndex) return { symbol: '✓', className: 'text-emerald-700' }
  if (stepIndex === currentIndex) {
    if (current === 'ABGESCHLOSSEN') return { symbol: '✓', className: 'text-emerald-700' }
    return blockedAtCurrent ? { symbol: '!', className: 'text-red-700' } : { symbol: '●', className: 'text-blue-700' }
  }
  return { symbol: '○', className: 'text-stone-400' }
}

// Produktblock 3 Abschnitt 8: Freigabekette rein aus bereits vorhandenen,
// abgeleiteten Feldern (pruefstatus/betreiberstatus/freigabeOffen) —
// keine neue Freigabelogik, nur eine Text-/Symbol-Übersetzung.
function interneFreigabeStatus(status: { pruefstatus: GgaCabinetPruefstatus; freigabeOffen: boolean }): { symbol: string; text: string } {
  switch (status.pruefstatus) {
    case 'BESTANDEN': return { symbol: '✓', text: 'Freigegeben' }
    case 'BEANSTANDET': return { symbol: '!', text: 'Beanstandet' }
    case 'GEPLANT': return { symbol: '●', text: 'Angefordert, ausstehend' }
    case 'UEBERFAELLIG': return { symbol: '!', text: 'Prüfung überfällig' }
    default: return { symbol: '○', text: status.freigabeOffen ? 'Noch nicht angefordert' : 'Noch nicht möglich' }
  }
}
function betreiberfreigabeStatus(status: { betreiberstatus: GgaCabinetBetreiberstatus; pruefstatus: GgaCabinetPruefstatus }): { symbol: string; text: string } {
  switch (status.betreiberstatus) {
    case 'ERTEILT': return { symbol: '✓', text: 'Erteilt' }
    case 'BEANSTANDET': return { symbol: '!', text: 'Beanstandet' }
    case 'AUSSTEHEND': return { symbol: '●', text: 'Ausstehend' }
    default: return { symbol: '○', text: status.pruefstatus === 'BESTANDEN' ? 'Noch nicht angefordert' : 'Noch nicht möglich' }
  }
}

export default async function GgaCabinetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let cabinet: Awaited<ReturnType<typeof getGgaCabinetDetail>>
  try {
    cabinet = await getGgaCabinetDetail(id)
  } catch (error) {
    handleCollaborationPageError(error)
  }

  const [memberships, history, pruefnachweisOverview] = await Promise.all([
    getVisibleCollaborationMemberships({ projectId: cabinet.projectId }),
    getGgaCabinetAuditHistory(id),
    // REQ-018.1: dieselbe, bereits von /pruefung genutzte Übersichtsfunktion
    // — keine zweite Prüfnachweis-Ableitung.
    getGgaCabinetPruefnachweisOverview(id),
  ])

  const canEdit = (cabinetEditorRoles as readonly string[]).includes(cabinet.role)
  const canDelete = cabinet.role === 'COLLAB_MANAGER'
  const canUpload = true // jedes aktive Projektmitglied — Berechtigung wird serverseitig in uploadCollaborationDocument erneut geprüft
  // Gleiche Rollen wie resolveCollaborationBlocker() serverseitig prüft — Sichtbarkeit des
  // "Beheben"-Buttons folgt exakt der tatsächlichen Berechtigung, keine eigene Rollenliste.
  const canResolveBlockers = (editorRoles as readonly string[]).includes(cabinet.role)

  const standort = [cabinet.gebaeude, cabinet.ebene, cabinet.raumbezeichnung].filter(Boolean).join(' · ') || null
  const nichtBestandenePruefarten: GgaPruefart[] = pruefnachweisOverview
    .filter((entry) => entry.current?.ergebnis === 'NICHT_BESTANDEN')
    .map((entry) => entry.pruefart)

  // Produktblock 3 Abschnitt 10 (SSOT): derselbe GgaControlTowerCabinetEntry-
  // Zuschnitt wie im Dashboard/in der Projektmatrix (REQ-014) — dieselben,
  // bereits zentralisierten Funktionen liefern für denselben Schrank
  // garantiert denselben Status/nächsten Schritt/dieselbe Direktaktion.
  const controlTowerEntry: GgaControlTowerCabinetEntry = {
    id: cabinet.id, kennung: cabinet.kennung, standort,
    projectId: cabinet.projectId, projectNumber: cabinet.project.projectNumber, projectName: cabinet.project.name,
    nichtBestandenePruefarten,
    ...cabinet.status,
  }
  const presentationStatus = deriveGgaCabinetPresentationStatus(controlTowerEntry)
  const naechsterSchritt = naechsterSchrittFuerCabinet(controlTowerEntry)
  const direktAktion = direkteGgaCabinetAktion(controlTowerEntry)
  const fortschritt = aktuellerGgaFortschritt(controlTowerEntry)
  // "!" am aktuellen Lifecycle-Schritt bei denselben Signalen, die auch
  // presentationStatus auf KRITISCH setzen (Blocker/Nacharbeit/Prüfart nicht
  // bestanden) — dieselbe Schwere, konsistent zum Status-Badge oben.
  const lifecycleBlockedAtCurrent = cabinet.status.offeneBlocker > 0 || cabinet.status.nacharbeitErforderlich || nichtBestandenePruefarten.length > 0

  // Handlungsbedarf (Produktblock 3 Abschnitt 4): REQ-013 (deriveGgaProject-
  // Worklist) liefert bereits granulare, konkrete offene Punkte (Maßnahme/
  // Mangel/Beanstandung/Überfällig/Nachprüfung/Freigabe) für EIN Cabinet —
  // hier als Ein-Element-Liste aufgerufen, keine zweite Ableitung. Prüfart-
  // Ausfälle (REQ-018.1) kommen separat dazu, weil sie außerhalb von
  // REQ-013 liegen (siehe GgaControlTowerCabinetEntry-Kommentar oben).
  const openRequiredTasks = cabinet.tasks.filter((t) => t.isRequired && !['DONE', 'SKIPPED'].includes(t.status))
  const openBlockers = cabinet.blockers.filter((b) => b.status === 'OPEN')
  const worklistInput: GgaWorklistCabinetInput = {
    id: cabinet.id, kennung: cabinet.kennung, standort,
    status: cabinet.status,
    openRequiredTasks: openRequiredTasks.map((t) => ({
      id: t.id, title: t.title, dueDate: t.dueDate,
      verantwortlich: t.responsibleMembership?.user ? `${t.responsibleMembership.user.firstName} ${t.responsibleMembership.user.lastName}` : null,
    })),
    openBlockers: openBlockers.map((b) => ({ id: b.id, title: b.title, verantwortlich: null })),
  }
  // Die drei generischen NAECHSTE_AKTION-Fallbacktexte ("Bestandsaufnahme
  // durchführen"/"Prüfung planen"/"Prüfung durchführen") sind normale
  // Workflow-Fortsetzung, kein Problem — sie stehen bereits prominent im
  // "Nächster Schritt"-Kasten oben. Ein konkreter offener Checklistenpunkt
  // (z. B. "Maßnahmen abgeschlossen") bleibt dagegen als echter Handlungs-
  // bedarf-Eintrag erhalten (Auftrag Abschnitt 4, Beispiel "3 Checklisten-
  // punkte offen") — nur dieselben drei generischen Texte werden gefiltert,
  // keine neue Businessregel, nur eine Anzeige-Entscheidung.
  const GENERISCHE_NAECHSTE_AKTION = new Set(['Bestandsaufnahme durchführen', 'Prüfung planen', 'Prüfung durchführen'])
  const worklistHandlungsbedarf = deriveGgaProjectWorklist([worklistInput])
    .filter((entry) => !(entry.type === 'NAECHSTE_AKTION' && GENERISCHE_NAECHSTE_AKTION.has(entry.title)))
    .map((entry) => ({
      problem: entry.title, naechsterSchritt: entry.title, badge: null as GgaControlTowerReasonBadge | null,
      aktion: direktAktionFuerWorklistTyp(entry.type, cabinet.id, cabinet.status.bestandsaufnahmeAbgeschlossen),
    }))
  const PRUEFART_REASON_BADGE: Record<GgaPruefart, GgaControlTowerReasonBadge> = { LUEFTUNG: 'LUEFTUNG_NICHT_BESTANDEN', ELEKTRO: 'ELEKTRO_NICHT_BESTANDEN', VDE: 'VDE_NICHT_BESTANDEN' }
  const pruefartHandlungsbedarf = nichtBestandenePruefarten.map((pruefart) => ({
    problem: GGA_CONTROL_TOWER_REASON_LABELS[PRUEFART_REASON_BADGE[pruefart]],
    naechsterSchritt: GGA_PRUEFART_NAECHSTER_SCHRITT[pruefart],
    badge: PRUEFART_REASON_BADGE[pruefart] as GgaControlTowerReasonBadge | null,
    aktion: { href: `/collaboration/cabinets/${cabinet.id}/pruefung`, label: 'Prüfung öffnen' },
  }))
  const handlungsbedarf = [...pruefartHandlungsbedarf, ...worklistHandlungsbedarf]

  // Arbeitsbereiche (Produktblock 3 Abschnitt 5-9): kompakte Zusammenfassung
  // je Bereich, ausschließlich aus bereits geladenen cabinet-/pruefnachweis-
  // Daten — keine neuen Abfragen.
  const checklistSummary = (stageCode: string) => {
    const items = cabinet.checklistItems.filter((i) => i.stage.code === stageCode)
    return { total: items.length, done: items.filter((i) => i.completed).length }
  }
  const abnahmeChecklist = checklistSummary('ABNAHME')
  const planungChecklist = checklistSummary('PLANUNG')
  const umsetzungChecklist = checklistSummary('UMSETZUNG')
  const planungOffeneAufgaben = openRequiredTasks.filter((t) => t.stage.code === 'PLANUNG').length
  const umsetzungOffeneAufgaben = openRequiredTasks.filter((t) => t.stage.code === 'UMSETZUNG').length
  const pruefartSymbol: Record<'BESTANDEN' | 'NICHT_BESTANDEN' | 'OFFEN', string> = { BESTANDEN: '✓', NICHT_BESTANDEN: '✕', OFFEN: '○' }
  const pruefungenBestanden = pruefnachweisOverview.filter((entry) => entry.current?.ergebnis === 'BESTANDEN').length
  const interneFreigabe = interneFreigabeStatus(cabinet.status)
  const betreiberFreigabe = betreiberfreigabeStatus(cabinet.status)
  const letzteAktivitaet = history[0] ?? null

  return <div>
    <p className="text-xs text-muted-foreground">
      <Link href={`/collaboration/projects/${cabinet.projectId}`} className="hover:underline">← Projekt {cabinet.project.projectNumber ? `${cabinet.project.projectNumber} · ` : ''}{cabinet.project.name}</Link>
      {' · '}<Link href="/collaboration/cabinets" className="hover:underline">GGA-Schränke</Link>
    </p>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-600 tracking-tight">{cabinet.kennung} — {cabinet.bezeichnung}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-600 ${GGA_STATUS_BADGE_CLASS[presentationStatus]}`}>{GGA_STATUS_LABELS[presentationStatus]}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-600 ${lifecycleBadgeClass[cabinet.status.lifecycleStage]}`}>{GGA_LIFECYCLE_STAGE_LABELS[cabinet.status.lifecycleStage]}</span>
        {cabinet.status.betreiberstatus !== 'NICHT_ANGEFORDERT' && <span className={`rounded-full px-3 py-1 text-xs font-600 ${betreiberstatusBadgeClass[cabinet.status.betreiberstatus]}`}>{GGA_BETREIBERSTATUS_LABELS[cabinet.status.betreiberstatus]}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/collaboration/cabinets/${cabinet.id}/schrankakte`} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-600 text-stone-800">Schrankakte (PDF)</a>
        <GgaCabinetDeleteButton cabinetId={cabinet.id} canDelete={canDelete} />
      </div>
    </div>

    {/* Schrankkopf: kompakte Lageübersicht (Produktblock 3 Abschnitt 2) */}
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Standort</p><p className="mt-1 text-sm font-600">{standort ?? '–'}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Fortschritt</p><p className="mt-1 text-xl font-600">{fortschritt === null ? '–' : `${fortschritt} %`}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Betriebsstatus</p><p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-600 ${GGA_BETRIEBSSTATUS_BADGE_CLASS[cabinet.status.betriebsstatus]}`}>{formatGgaBetriebsstatusLabel(cabinet.status.betriebsstatus, cabinet.status.betriebsstatusTageBisFaellig)}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Prüfstatus</p><p className="mt-1 text-sm font-600">{GGA_PRUEFSTATUS_LABELS[cabinet.status.pruefstatus]}</p></div>
    </div>

    {/* Nächster Schritt (Produktblock 3 Abschnitt 2/10): zentral über naechsterSchrittFuerCabinet()/direkteGgaCabinetAktion() — identisch zu Dashboard/Projektmatrix für denselben Schrank */}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 px-5 py-4">
      <div><p className="text-xs font-600 uppercase tracking-wide text-blue-800">Nächster Schritt</p><p className="mt-1 text-lg font-600 text-stone-900">{naechsterSchritt}</p></div>
      <Link href={direktAktion.href} className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-sm font-600 text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{direktAktion.label} →</Link>
    </div>

    {/* Lifecycle (Produktblock 3 Abschnitt 3): rein visuelle Übersetzung der bestehenden lifecycleStage-Reihenfolge */}
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm">
      {LIFECYCLE_ORDER.map((step, index) => <div key={step} className="flex items-center gap-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`font-600 ${lifecycleSymbol(step, cabinet.status.lifecycleStage, lifecycleBlockedAtCurrent).className}`}>{lifecycleSymbol(step, cabinet.status.lifecycleStage, lifecycleBlockedAtCurrent).symbol}</span>
          <span className="text-stone-800">{GGA_LIFECYCLE_STAGE_LABELS[step]}</span>
        </span>
        {index < LIFECYCLE_ORDER.length - 1 && <span aria-hidden="true" className="text-stone-300">→</span>}
      </div>)}
    </div>

    {/* Handlungsbedarf (Produktblock 3 Abschnitt 4) */}
    <div className="mt-6 rounded-xl border border-red-200 bg-white shadow-sm">
      <div className="border-b border-red-100 px-5 py-4"><h2 className="font-600 text-red-800">Handlungsbedarf <span className="text-sm font-normal text-muted-foreground">({handlungsbedarf.length})</span></h2></div>
      <ul className="divide-y divide-stone-100">
        {handlungsbedarf.map((item, index) => <li key={index} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[minmax(0,1.6fr)_auto] md:items-center">
          <div className="min-w-0">
            {item.badge && <span className="mb-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-600 text-red-800">{GGA_CONTROL_TOWER_REASON_LABELS[item.badge]}</span>}
            <p className="text-stone-900">{item.problem}</p>
            <p className="mt-0.5 text-xs text-slate-700"><span className="text-muted-foreground">Nächster Schritt:</span> {item.naechsterSchritt}</p>
          </div>
          <Link href={item.aktion.href} className="w-fit shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-600 text-stone-800 hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{item.aktion.label} →</Link>
        </li>)}
      </ul>
      {handlungsbedarf.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Kein Handlungsbedarf — dieser Schrank ist im grünen Bereich.</p>}
    </div>

    {/* Arbeitsbereiche (Produktblock 3 Abschnitt 5-9): Cockpit + Navigation, keine Formulare kopiert */}
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Link href={`/collaboration/cabinets/${cabinet.id}/bestandsaufnahme`} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-blue-400">
        <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Bestandsaufnahme</p>
        <p className="mt-2 text-sm font-600">{cabinet.status.bestandsaufnahmeAbgeschlossen ? '✓ Abgeschlossen' : '○ Offen'}</p>
        <p className="mt-2 text-xs font-600 text-blue-700">{cabinet.status.bestandsaufnahmeAbgeschlossen ? 'Bestandsaufnahme bearbeiten' : 'Bestandsaufnahme starten'} →</p>
      </Link>
      <a href="#massnahmen" className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-blue-400">
        <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Planung</p>
        <p className="mt-2 text-sm font-600">{planungChecklist.done} / {planungChecklist.total} Checkliste{planungOffeneAufgaben > 0 ? ` · ${planungOffeneAufgaben} Aufgabe${planungOffeneAufgaben === 1 ? '' : 'n'} offen` : ''}</p>
        <p className="mt-2 text-xs font-600 text-blue-700">Planung öffnen →</p>
      </a>
      <a href="#massnahmen" className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-blue-400">
        <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Umsetzung</p>
        <p className="mt-2 text-sm font-600">{umsetzungChecklist.done} / {umsetzungChecklist.total} Checkliste{umsetzungOffeneAufgaben > 0 ? ` · ${umsetzungOffeneAufgaben} Aufgabe${umsetzungOffeneAufgaben === 1 ? '' : 'n'} offen` : ''}</p>
        <p className="mt-2 text-xs font-600 text-blue-700">Umsetzung öffnen →</p>
      </a>
      <Link href={`/collaboration/cabinets/${cabinet.id}/pruefung`} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-blue-400">
        <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Prüfung &amp; Abnahme</p>
        <dl className="mt-2 space-y-0.5 text-sm">
          {pruefnachweisOverview.map((entry) => <div key={entry.pruefart} className="flex items-center justify-between"><dt>{GGA_PRUEFART_LABELS[entry.pruefart]}</dt><dd className="font-600">{pruefartSymbol[entry.current?.ergebnis ?? 'OFFEN']} {entry.current ? (entry.current.ergebnis === 'BESTANDEN' ? 'Bestanden' : 'Nicht bestanden') : 'Offen'}</dd></div>)}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{pruefungenBestanden} von 3 Prüfungen abgeschlossen · Abnahme-Checkliste {abnahmeChecklist.done}/{abnahmeChecklist.total}</p>
        <p className="mt-2 text-xs font-600 text-blue-700">Prüfung öffnen →</p>
      </Link>
      <a href="#freigaben" className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-blue-400">
        <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Freigaben</p>
        <dl className="mt-2 space-y-0.5 text-sm">
          <div className="flex items-center justify-between"><dt>Intern</dt><dd className="font-600">{interneFreigabe.symbol} {interneFreigabe.text}</dd></div>
          <div className="flex items-center justify-between"><dt>Betreiber</dt><dd className="font-600">{betreiberFreigabe.symbol} {betreiberFreigabe.text}</dd></div>
        </dl>
        <p className="mt-2 text-xs font-600 text-blue-700">Freigaben öffnen →</p>
      </a>
      <a href="#dokumente" className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-blue-400">
        <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Dokumente / Schrankakte</p>
        <p className="mt-2 text-sm font-600">{cabinet.documents.length} Dokument{cabinet.documents.length === 1 ? '' : 'e'}</p>
        <p className="mt-2 text-xs font-600 text-blue-700">Dokumente öffnen →</p>
      </a>
      <a href="#historie" className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-blue-400">
        <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Aktivität / Historie</p>
        <p className="mt-2 truncate text-sm font-600">{letzteAktivitaet ? `${entityTypeLabels[letzteAktivitaet.entityType] ?? letzteAktivitaet.entityType} · ${letzteAktivitaet.action}` : 'Keine Aktivität'}</p>
        <p className="mt-2 text-xs font-600 text-blue-700">Historie öffnen →</p>
      </a>
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

    <section id="massnahmen" className="mt-8 scroll-mt-4">
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

    <section id="blocker" className="mt-8 scroll-mt-4">
      <h2 className="text-lg font-600">Blocker</h2>
      <GgaCabinetBlockerList
        blockers={cabinet.blockers.map((blocker) => ({
          id: blocker.id, title: blocker.title, status: blocker.status, cause: blocker.cause,
          resolution: blocker.resolution, resolvedAt: blocker.resolvedAt ? blocker.resolvedAt.toISOString() : null,
        }))}
        canResolve={canResolveBlockers}
      />
    </section>

    <section id="freigaben" className="mt-8 scroll-mt-4">
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

    <section id="dokumente" className="mt-8 scroll-mt-4">
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

    <section id="historie" className="mt-8 scroll-mt-4">
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
