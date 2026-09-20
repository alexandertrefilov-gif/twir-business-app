import Link from 'next/link'
import { getVisibleCollaborationProjects } from '@/lib/services/collaboration-project.service'
import { getGgaControlTowerOverview } from '@/lib/services/gga-cabinet.service'
import {
  GGA_CONTROL_TOWER_REASON_LABELS, GGA_STAGE_PLANUNG, GGA_STAGE_UMSETZUNG, GGA_STAGE_ABNAHME,
  GGA_STATUS_LABELS, GGA_STATUS_BADGE_CLASS, deriveGgaProjectPresentationStatus,
  naechsterSchrittFuerCabinet, direkteGgaHandlungsbedarfAktion,
  type GgaControlTowerProjectSummary, type GgaPresentationStatus,
} from '@/lib/collaboration/cabinet-workflow'

// ── Projektmatrix (GGA-Portal Produktblock 1) ─────────────────────────────
// Ein GGA-Projekt = ein Projekt, das mindestens einen GGA-Schrank hat (also
// in gga.projekte auftaucht, siehe deriveGgaControlTowerOverview). Jede
// Kennzahl auf der Karte ist eine bereits vorhandene, andernorts abgeleitete
// Zahl (GgaControlTowerProjectSummary) — hier nur pro Projekt zusammengeführt
// (Join projectId), keine neue Berechnung.
type CollaborationProjectView = Awaited<ReturnType<typeof getVisibleCollaborationProjects>>[number]

type ProjectMatrixCard = {
  id: string
  projectNumber: string | null
  name: string
  standort: string | null
  status: string
  aktuellePhase: string | null
  progressPercent: number | null
  presentationStatus: GgaPresentationStatus
  ursache: string | null
  schraenke: number
  pruefungenOffen: number
  maengelOffen: number
  freigabenOffen: number
}

function buildProjectMatrixCard(project: CollaborationProjectView, ggaSummary: GgaControlTowerProjectSummary, maengelOffen: number): ProjectMatrixCard {
  const abgeschlossen = project.status === 'COMPLETED'
  const presentationStatus = deriveGgaProjectPresentationStatus({
    abgeschlossen, healthStatus: project.healthStatus, dringendeSchraenkeAnzahl: ggaSummary.dringendeSchraenkeAnzahl,
  })
  // Ursache-Text (Auftrag Abschnitt 9): "Kritisch"/"Handlungsbedarf" darf nie
  // unklar lassen, ob ein GGA-Schrank oder ein projektweiter, cabinetId-loser
  // Blocker (z. B. ein reiner Stage-Blocker ohne Schrankbezug) verantwortlich
  // ist — beide Gründe werden, falls beide zutreffen, gemeinsam genannt statt
  // nur einer davon (kein Vermischen zweier Statusmodelle zu einer Zahl).
  const dringend = ggaSummary.dringendeSchraenkeAnzahl
  const projektweiterBlocker = project.offeneProjektweiteBlocker > 0
  const ursacheTeile: string[] = []
  if (dringend > 0) ursacheTeile.push(`${dringend} Schrank${dringend === 1 ? '' : 'e'} mit Handlungsbedarf`)
  if (presentationStatus === 'KRITISCH' && projektweiterBlocker) ursacheTeile.push('projektweiter Blocker (kein GGA-Schrank betroffen)')
  const ursache = ursacheTeile.length > 0
    ? ursacheTeile.join(' · ')
    : (presentationStatus === 'KRITISCH' ? 'Projektweiter Grund — Details auf der Projektseite' : null)
  return {
    id: project.id, projectNumber: project.projectNumber, name: project.name,
    standort: [project.location, project.building, project.floor].filter(Boolean).join(' · ') || null,
    status: project.status,
    aktuellePhase: project.stages.find((stage) => stage.derivedStatus === 'IN_PROGRESS')?.code ?? null,
    progressPercent: project.progressPercent,
    presentationStatus, ursache,
    schraenke: ggaSummary.gesamt, pruefungenOffen: ggaSummary.pruefungOffen, maengelOffen,
    freigabenOffen: ggaSummary.freigabeOffen + ggaSummary.betreiberfreigabeAusstehend,
  }
}

type ProjectFilter = 'alle' | 'in-arbeit' | 'kritisch' | 'planung' | 'umsetzung' | 'abnahme' | 'abgeschlossen'
const PROJECT_FILTER_LABELS: Record<ProjectFilter, string> = {
  alle: 'Alle', 'in-arbeit': 'In Arbeit', kritisch: 'Kritisch', planung: 'Planung', umsetzung: 'Umsetzung', abnahme: 'Abnahme', abgeschlossen: 'Abgeschlossen',
}
function matchesProjectFilter(card: ProjectMatrixCard, filter: ProjectFilter): boolean {
  switch (filter) {
    case 'alle': return true
    case 'in-arbeit': return card.status === 'ACTIVE'
    case 'kritisch': return card.presentationStatus === 'KRITISCH'
    case 'planung': return card.aktuellePhase === GGA_STAGE_PLANUNG
    case 'umsetzung': return card.aktuellePhase === GGA_STAGE_UMSETZUNG
    case 'abnahme': return card.aktuellePhase === GGA_STAGE_ABNAHME
    case 'abgeschlossen': return card.status === 'COMPLETED'
  }
}
function projectMatrixHref(filter: ProjectFilter, search: string): string {
  const sp = new URLSearchParams()
  if (filter !== 'alle') sp.set('pfilter', filter)
  if (search) sp.set('q', search)
  const qs = sp.toString()
  return `/collaboration/dashboard${qs ? `?${qs}` : ''}`
}

export default async function CollaborationDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const pfilterParam = typeof params.pfilter === 'string' ? params.pfilter : 'alle'
  const pfilter: ProjectFilter = (Object.keys(PROJECT_FILTER_LABELS) as ProjectFilter[]).includes(pfilterParam as ProjectFilter) ? (pfilterParam as ProjectFilter) : 'alle'
  const search = typeof params.q === 'string' ? params.q.trim().slice(0, 200) : ''

  const projects = await getVisibleCollaborationProjects()
  const gga = await getGgaControlTowerOverview()

  const ggaProjectSummaryById = new Map(gga.projekte.map((summary) => [summary.projectId, summary]))
  const ggaCabinetBlockersByProject = new Map<string, number>()
  for (const cabinet of gga.alleSchraenke) {
    ggaCabinetBlockersByProject.set(cabinet.projectId, (ggaCabinetBlockersByProject.get(cabinet.projectId) ?? 0) + cabinet.offeneBlocker)
  }

  // "GGA-Projekt" = Projekt mit mindestens einem GGA-Schrank (taucht in
  // gga.projekte auf). Projekte ohne jeden GGA-Schrank werden nicht in der
  // Matrix gezeigt (Auftrag: "Jedes GGA-Projekt erhält eine Projektkarte"),
  // aber unten transparent als eigene, separate Liste weitergeführt, damit
  // kein sichtbares Projekt durch die Verdichtung verschwindet.
  const projectCards: ProjectMatrixCard[] = projects
    .filter((project) => ggaProjectSummaryById.has(project.id))
    .map((project) => buildProjectMatrixCard(project, ggaProjectSummaryById.get(project.id)!, ggaCabinetBlockersByProject.get(project.id) ?? 0))
  const projekteOhneGgaSchrank = projects.filter((project) => !ggaProjectSummaryById.has(project.id))

  const matrixHandlungsbedarf = projectCards.filter((card) => card.presentationStatus === 'KRITISCH' || card.presentationStatus === 'HANDLUNGSBEDARF').length
  const matrixAbgeschlossen = projectCards.filter((card) => card.presentationStatus === 'ABGESCHLOSSEN').length
  // GGA-Portal Produktblock 6 Abschnitt 3: "Freigaben offen" als eigene KPI —
  // dieselbe Summe aus bereits vorhandenen, globalen Cabinet-Summary-Feldern,
  // die pro Projekt schon in buildProjectMatrixCard() verwendet wird (siehe
  // card.freigabenOffen oben). Keine neue Berechnung, nur global statt je Projekt.
  const freigabenOffenGesamt = gga.gesamt.freigabeOffen + gga.gesamt.betreiberfreigabeAusstehend

  const searchLower = search.toLowerCase()
  const sichtbareProjekte = projectCards
    .filter((card) => matchesProjectFilter(card, pfilter))
    .filter((card) => !searchLower || `${card.projectNumber ?? ''} ${card.name}`.toLowerCase().includes(searchLower))

  // GGA-Portal Produktblock 6 Abschnitt 6: kleine priorisierte Vorschau der
  // bereits bestehenden, cross-projekt sortierten dringendeSchraenke-Liste
  // (REQ-014) — maximal 5 Einträge, keine neue Priorisierung. Die vollständige
  // Arbeitstabelle lebt bewusst nur noch auf /collaboration/my-work.
  const dringendeVorschau = gga.dringendeSchraenke.slice(0, 5)

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-600 uppercase tracking-[0.18em] text-blue-700">Control Tower</p><h1 className="mt-2 text-3xl font-600 tracking-tight">Projektübersicht</h1><p className="mt-2 text-sm text-muted-foreground">Freigegebene Projekte, aktueller Fortschritt und nächste Schritte.</p></div>
      <div className="flex items-center gap-4">
        <Link href="/collaboration/my-work" className="text-sm font-600 text-blue-700 hover:underline">Meine Arbeit öffnen →</Link>
        <Link href="/collaboration/projects" className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-600 hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Alle Projekte</Link>
      </div>
    </div>

    {/* KPI-Reihe (GGA-Portal Produktblock 6 Abschnitt 3): EINE konsolidierte
        Kennzahlenreihe statt vormals zwei teilweise redundanten Reihen —
        ausschließlich bereits vorhandene Werte, keine neue Berechnung. */}
    <section aria-labelledby="kpi-title" className="mt-6">
      <h2 id="kpi-title" className="sr-only">Kennzahlen</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">GGA-Projekte</p><p className="mt-1 text-xl font-600">{projectCards.length}</p></div>
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">GGA-Schränke</p><p className="mt-1 text-xl font-600">{gga.gesamt.gesamt}</p></div>
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Kritisch / Handlungsbedarf</p><p className={`mt-1 text-xl font-600 ${matrixHandlungsbedarf ? 'text-red-700' : ''}`}>{matrixHandlungsbedarf}</p></div>
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Prüfungen offen</p><p className={`mt-1 text-xl font-600 ${gga.gesamt.pruefungOffen ? 'text-amber-700' : ''}`}>{gga.gesamt.pruefungOffen}</p></div>
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Freigaben offen</p><p className={`mt-1 text-xl font-600 ${freigabenOffenGesamt ? 'text-amber-700' : ''}`}>{freigabenOffenGesamt}</p></div>
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Abgeschlossen</p><p className="mt-1 text-xl font-600 text-emerald-700">{matrixAbgeschlossen}</p></div>
      </div>
    </section>

    {/* Projektmatrix (GGA-Portal Produktblock 1): Fortschritt (%) und Situation
        (Status/Ampel) getrennt je Karte, bleibt das Zentrum des Dashboards. */}
    <section aria-labelledby="matrix-title" className="mt-6">
      <h2 id="matrix-title" className="sr-only">Projektmatrix</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PROJECT_FILTER_LABELS) as ProjectFilter[]).map((f) => <Link key={f} href={projectMatrixHref(f, search)} className={`rounded-full border px-3 py-1 text-xs font-600 ${pfilter === f ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 text-stone-700 hover:border-stone-500'}`}>{PROJECT_FILTER_LABELS[f]}</Link>)}
        </div>
        <form className="flex items-center gap-2">
          <input type="search" name="q" defaultValue={search} placeholder="Projekt suchen …" maxLength={200} className="h-8 w-48 rounded-md border border-stone-300 bg-white px-3 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600" />
          {pfilter !== 'alle' && <input type="hidden" name="pfilter" value={pfilter} />}
          <button type="submit" className="h-8 rounded-md border border-stone-300 bg-white px-3 text-xs font-600 hover:border-blue-400">Suchen</button>
        </form>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sichtbareProjekte.map((card) => <Link key={card.id} href={`/collaboration/projects/${card.id}`} className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-600">{card.projectNumber ? `${card.projectNumber} · ` : ''}{card.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.standort ?? 'Keine Ortsangaben hinterlegt'}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-600 ${GGA_STATUS_BADGE_CLASS[card.presentationStatus]}`}>{GGA_STATUS_LABELS[card.presentationStatus]}</span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-stone-700" style={{ width: `${card.progressPercent ?? 0}%` }} /></div>
              <span className="shrink-0 text-xs font-600 tabular-nums">{card.progressPercent === null ? '–' : `${card.progressPercent} %`}</span>
            </div>
            {card.ursache && <p className="mt-1.5 text-xs text-red-700">{card.ursache}</p>}
          </div>

          <div className="grid grid-cols-4 gap-2 border-t border-stone-100 pt-3 text-center text-xs">
            <div><p className="font-600">{card.schraenke}</p><p className="text-muted-foreground">Schränke</p></div>
            <div><p className={`font-600 ${card.pruefungenOffen ? 'text-amber-700' : ''}`}>{card.pruefungenOffen}</p><p className="text-muted-foreground">Prüfung</p></div>
            <div><p className={`font-600 ${card.maengelOffen ? 'text-red-700' : ''}`}>{card.maengelOffen}</p><p className="text-muted-foreground">Mängel</p></div>
            <div><p className={`font-600 ${card.freigabenOffen ? 'text-amber-700' : ''}`}>{card.freigabenOffen}</p><p className="text-muted-foreground">Freigabe</p></div>
          </div>

          <p className="text-right text-xs font-600 text-blue-700">Projekt öffnen →</p>
        </Link>)}
      </div>
      {sichtbareProjekte.length === 0 && <p className="rounded-xl border border-stone-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">Keine GGA-Projekte in dieser Ansicht.</p>}

      {projekteOhneGgaSchrank.length > 0 && <div className="mt-4 rounded-xl border border-stone-200 bg-white px-5 py-4">
        <p className="text-xs font-600 text-muted-foreground">Weitere Projekte ohne GGA-Schrank</p>
        <div className="mt-2 flex flex-wrap gap-2">{projekteOhneGgaSchrank.map((project) => <Link key={project.id} href={`/collaboration/projects/${project.id}`} className="rounded-full border border-stone-300 px-3 py-1 text-xs font-600 text-stone-700 hover:border-blue-400">{project.projectNumber ? `${project.projectNumber} · ` : ''}{project.name}</Link>)}</div>
      </div>}
    </section>

    {/* Handlungsbedarf-Vorschau (GGA-Portal Produktblock 6 Abschnitt 6): nur
        eine KLEINE, priorisierte Vorschau (max. 5) der bereits bestehenden,
        cross-projekt dringendeSchraenke-Liste — kein zweites vollständiges
        Arbeitspanel. Erscheint nur, wenn tatsächlich Handlungsbedarf besteht;
        ist nichts dringend, erklärt die Projektmatrix (keine Kritisch-Badges)
        das bereits vollständig, eine leere Vorschau-Box hätte hier keinen
        Mehrwert. Die vollständige, priorisierte Arbeit lebt auf /my-work. */}
    {dringendeVorschau.length > 0 && <section aria-labelledby="preview-title" className="mt-6 rounded-xl border border-red-200 bg-white shadow-sm">
      <div className="border-b border-red-100 px-5 py-4"><h2 id="preview-title" className="font-600 text-red-800">Handlungsbedarf <span className="text-sm font-normal text-muted-foreground">({gga.dringendeSchraenke.length} gesamt, {dringendeVorschau.length} angezeigt)</span></h2></div>
      <ul className="divide-y divide-stone-100">
        {dringendeVorschau.map((cabinet) => {
          const aktion = direkteGgaHandlungsbedarfAktion(cabinet.cabinetId, cabinet.gruende)
          return <li key={cabinet.cabinetId} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto] md:items-start">
            <div className="min-w-0">
              <p className="font-600">{cabinet.kennung}</p>
              <p className="truncate text-xs text-muted-foreground">{cabinet.projectNumber ? `${cabinet.projectNumber} · ` : ''}{cabinet.projectName}</p>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1">{cabinet.gruende.map((grund) => <span key={grund} className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-600 text-red-800">{GGA_CONTROL_TOWER_REASON_LABELS[grund]}</span>)}</div>
              <p className="mt-1.5 text-xs text-slate-700"><span className="text-muted-foreground">Nächster Schritt:</span> {naechsterSchrittFuerCabinet(cabinet)}</p>
            </div>
            <Link href={aktion.href} className="w-fit shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-600 text-stone-800 hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 md:justify-self-end">{aktion.label} →</Link>
          </li>
        })}
      </ul>
      <div className="border-t border-stone-100 px-5 py-3"><Link href="/collaboration/my-work" className="text-sm font-600 text-blue-700 hover:underline">Alle Arbeitspunkte öffnen →</Link></div>
    </section>}
  </div>
}
