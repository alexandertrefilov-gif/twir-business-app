import Link from 'next/link'
import { getGgaControlTowerOverview } from '@/lib/services/gga-cabinet.service'
import { getVisibleCollaborationTasks, getVisibleCollaborationBlockers, getCurrentCollaborationUserId } from '@/lib/services/collaboration-phase2.service'
import {
  deriveGgaProjectWorklist, deriveGgaCabinetPresentationStatus, direktAktionFuerWorklistTyp, deriveGgaProjektPhasenWorklist,
  GGA_STATUS_LABELS, GGA_STATUS_BADGE_CLASS, GGA_WORKLIST_URGENCY_LABELS, GGA_WORKLIST_URGENCY_BADGE_CLASS,
  GGA_CONTROL_TOWER_REASON_LABELS, GGA_PRUEFART_NAECHSTER_SCHRITT, GGA_LIFECYCLE_STAGE_LABELS,
  type GgaControlTowerCabinetEntry, type GgaWorklistCabinetInput, type GgaWorklistCabinetTask, type GgaWorklistCabinetBlocker,
  type GgaWorklistEntryType, type GgaWorklistUrgency, type GgaPruefart, type GgaControlTowerReasonBadge, type GgaPresentationStatus,
} from '@/lib/collaboration/cabinet-workflow'

// GGA-Portal Produktblock 4 Abschnitt 7/9: welche Filterkategorie ein
// Worklist-Eintragstyp bedient — reine Anzeige-Gruppierung der bereits
// bestehenden REQ-013-Typen (+ des REQ-018.1-Prüfart-Zusatzes unten), keine
// neue fachliche Kategorie im Datenmodell.
// GGA-Portal Produktblock 7 Abschnitt 4: PROJEKT_MASSNAHME/PROJEKT_MANGEL
// sind die cabinetId-losen Geschwister von MASSNAHME/MANGEL — dieselbe
// Kategorie (AUFGABE/BLOCKER), nur ohne Schrankbezug.
type MeineArbeitTyp = GgaWorklistEntryType | 'PRUEFART_NICHT_BESTANDEN' | 'PROJEKT_MASSNAHME' | 'PROJEKT_MANGEL'
type Kategorie = 'AUFGABE' | 'BLOCKER' | 'PRUEFUNG' | 'FREIGABE' | 'SONSTIGES'
function kategorieFuerTyp(type: MeineArbeitTyp): Kategorie {
  switch (type) {
    case 'MASSNAHME': case 'PROJEKT_MASSNAHME': return 'AUFGABE'
    case 'MANGEL': case 'PROJEKT_MANGEL': return 'BLOCKER'
    case 'BEANSTANDUNG': case 'PRUEFUNG_UEBERFAELLIG': case 'NACHPRUEFUNG': case 'PRUEFART_NICHT_BESTANDEN': return 'PRUEFUNG'
    case 'INTERNE_FREIGABE': case 'BETREIBERFREIGABE': return 'FREIGABE'
    case 'NAECHSTE_AKTION': return 'SONSTIGES'
  }
}

type MeineArbeitZeile = {
  id: string
  cabinetId: string | null; kennung: string | null; standort: string | null
  projectId: string; projectNumber: string | null; projectName: string
  stageTitle: string | null
  problem: string; naechsterSchritt: string
  dueDate: Date | null; urgency: GgaWorklistUrgency; ueberfaellig: boolean
  kategorie: Kategorie; zustaendigkeit: 'MEINE' | 'TEAM'
  praesentationsStatus: GgaPresentationStatus
  aktion: { href: string; label: string }
}

type MeineArbeitFilter = 'alle' | 'meine' | 'team' | 'kritisch' | 'ueberfaellig' | 'aufgaben' | 'pruefungen' | 'freigaben' | 'blocker'
const FILTER_LABELS: Record<MeineArbeitFilter, string> = {
  alle: 'Alle', meine: 'Meine', team: 'Team', kritisch: 'Kritisch', ueberfaellig: 'Überfällig', aufgaben: 'Aufgaben', pruefungen: 'Prüfungen', freigaben: 'Freigaben', blocker: 'Blocker',
}
function matchesFilter(zeile: MeineArbeitZeile, filter: MeineArbeitFilter): boolean {
  switch (filter) {
    case 'alle': return true
    case 'meine': return zeile.zustaendigkeit === 'MEINE'
    case 'team': return zeile.zustaendigkeit === 'TEAM'
    case 'kritisch': return zeile.praesentationsStatus === 'KRITISCH'
    case 'ueberfaellig': return zeile.ueberfaellig
    case 'aufgaben': return zeile.kategorie === 'AUFGABE'
    case 'pruefungen': return zeile.kategorie === 'PRUEFUNG'
    case 'freigaben': return zeile.kategorie === 'FREIGABE'
    case 'blocker': return zeile.kategorie === 'BLOCKER'
  }
}

const PRUEFART_REASON_BADGE: Record<GgaPruefart, GgaControlTowerReasonBadge> = { LUEFTUNG: 'LUEFTUNG_NICHT_BESTANDEN', ELEKTRO: 'ELEKTRO_NICHT_BESTANDEN', VDE: 'VDE_NICHT_BESTANDEN' }

export default async function CollaborationMyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const filterParam = typeof params.filter === 'string' ? params.filter : 'alle'
  const filter: MeineArbeitFilter = (Object.keys(FILTER_LABELS) as MeineArbeitFilter[]).includes(filterParam as MeineArbeitFilter) ? (filterParam as MeineArbeitFilter) : 'alle'
  const search = typeof params.q === 'string' ? params.q.trim().slice(0, 200) : ''

  // GGA-Portal Produktblock 4 Abschnitt 1/2: ausschließlich bereits
  // bestehende, bereits autorisierte Aggregationen — keine neue Task-Engine,
  // keine zweite Statuslogik, kein neuer Datenzugriffspfad. getGgaControlTower-
  // Overview() (REQ-014) liefert alle sichtbaren Schränke inkl. Prüfart-
  // Ausfällen; getVisibleCollaborationTasks()/-Blockers() liefern dieselben,
  // bereits an anderer Stelle genutzten Item-Listen mit zuverlässigem
  // responsibleMembershipId — jetzt (Produktblock 7) vollständig ausgewertet
  // statt nur für den cabinetId-Teil.
  const [gga, tasks, blockers, currentUserId] = await Promise.all([
    getGgaControlTowerOverview(),
    getVisibleCollaborationTasks(),
    getVisibleCollaborationBlockers({ status: 'OPEN' }),
    getCurrentCollaborationUserId(),
  ])
  const now = new Date()

  const openTasksByCabinet = new Map<string, GgaWorklistCabinetTask[]>()
  for (const task of tasks) {
    if (!task.cabinetId || !task.isRequired || ['DONE', 'SKIPPED'].includes(task.status)) continue
    const list = openTasksByCabinet.get(task.cabinetId) ?? []
    list.push({
      id: task.id, title: task.title, dueDate: task.dueDate,
      verantwortlich: task.responsibleMembership?.user ? `${task.responsibleMembership.user.firstName} ${task.responsibleMembership.user.lastName}` : null,
      verantwortlichUserId: task.responsibleMembership?.userId ?? null,
    })
    openTasksByCabinet.set(task.cabinetId, list)
  }
  const openBlockersByCabinet = new Map<string, GgaWorklistCabinetBlocker[]>()
  for (const blocker of blockers) {
    if (!blocker.cabinetId) continue
    const list = openBlockersByCabinet.get(blocker.cabinetId) ?? []
    list.push({
      id: blocker.id, title: blocker.title,
      verantwortlich: blocker.responsibleMembership?.user ? `${blocker.responsibleMembership.user.firstName} ${blocker.responsibleMembership.user.lastName}` : null,
      verantwortlichUserId: blocker.responsibleMembership?.userId ?? null,
    })
    openBlockersByCabinet.set(blocker.cabinetId, list)
  }

  const cabinetById = new Map<string, GgaControlTowerCabinetEntry>(gga.alleSchraenke.map((c) => [c.id, c]))
  const worklistInputs: GgaWorklistCabinetInput[] = gga.alleSchraenke.map((cabinet) => ({
    id: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort, status: cabinet,
    openRequiredTasks: openTasksByCabinet.get(cabinet.id) ?? [],
    openBlockers: openBlockersByCabinet.get(cabinet.id) ?? [],
  }))
  // REQ-013: liefert bereits vollständig priorisierte (urgency, dann Frist,
  // dann Kennung), granulare Einträge über alle Schränke hinweg — exakt das
  // in Abschnitt 6 geforderte Grundprinzip, ohne eine zweite Prioritäts-
  // Engine zu bauen.
  const worklistEntries = deriveGgaProjectWorklist(worklistInputs)

  // REQ-018.1: nicht bestandene Prüfarten sind kein Teil von REQ-013 (siehe
  // Kommentar bei GgaControlTowerCabinetEntry.nichtBestandenePruefarten) —
  // hier als eigene Einträge ergänzt und mit demselben Sortierschema wie
  // deriveGgaProjectWorklist() neu einsortiert (identische Regel, nicht neu
  // erfunden).
  const pruefartEntries = gga.alleSchraenke.flatMap((cabinet) => cabinet.nichtBestandenePruefarten.map((pruefart) => ({
    cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort,
    title: GGA_CONTROL_TOWER_REASON_LABELS[PRUEFART_REASON_BADGE[pruefart]],
    naechsterSchrittText: GGA_PRUEFART_NAECHSTER_SCHRITT[pruefart],
    type: 'PRUEFART_NICHT_BESTANDEN' as const,
    dueDate: null as Date | null, verantwortlichUserId: null as string | null,
    urgency: 2 as GgaWorklistUrgency, ueberfaellig: false,
  })))

  // GGA-Portal Produktblock 7 Abschnitt 2/4/15: die bekannte Scope-Lücke —
  // Tasks/Blocker OHNE cabinetId (Projekt- oder Phasenarbeit, z. B. der
  // Blocker "GVS Massname") wurden bislang aus openTasksByCabinet/
  // openBlockersByCabinet und damit komplett aus "Meine Arbeit" gefiltert.
  // deriveGgaProjektPhasenWorklist() (cabinet-workflow.ts) liefert exakt die
  // cabinetId-losen Einträge derselben, bereits geladenen tasks/blockers-
  // Arrays — disjunkt zur obigen Schleife (dort `if (!task.cabinetId)
  // continue`, dort intern das Gegenteil), also strukturell ohne Über-
  // schneidung/Duplikat zwischen REQ-013-Worklist und dieser Quelle.
  const projektPhasenEntries = deriveGgaProjektPhasenWorklist(tasks, blockers, currentUserId, now)

  const cabinetRoheintraege = [
    ...worklistEntries.map((e) => ({ id: `${e.cabinetId}-${e.type}-${e.title}`, cabinetId: e.cabinetId, kennung: e.kennung, standort: e.standort, title: e.title, naechsterSchrittText: e.title, type: e.type as MeineArbeitTyp, dueDate: e.dueDate, verantwortlichUserId: e.verantwortlichUserId, urgency: e.urgency, ueberfaellig: e.ueberfaellig })),
    ...pruefartEntries.map((e) => ({ ...e, id: `${e.cabinetId}-${e.type}-${e.title}`, type: e.type as MeineArbeitTyp })),
  ]

  const cabinetZeilen: MeineArbeitZeile[] = cabinetRoheintraege.flatMap((entry): MeineArbeitZeile[] => {
    const cabinet = cabinetById.get(entry.cabinetId)
    if (!cabinet) return []
    return [{
      id: entry.id, cabinetId: entry.cabinetId, kennung: entry.kennung, standort: entry.standort,
      projectId: cabinet.projectId, projectNumber: cabinet.projectNumber, projectName: cabinet.projectName,
      stageTitle: GGA_LIFECYCLE_STAGE_LABELS[cabinet.lifecycleStage],
      problem: entry.title, naechsterSchritt: entry.naechsterSchrittText,
      dueDate: entry.dueDate, urgency: entry.urgency, ueberfaellig: entry.ueberfaellig,
      kategorie: kategorieFuerTyp(entry.type),
      zustaendigkeit: entry.verantwortlichUserId !== null && entry.verantwortlichUserId === currentUserId ? 'MEINE' as const : 'TEAM' as const,
      praesentationsStatus: deriveGgaCabinetPresentationStatus(cabinet),
      // "as GgaWorklistEntryType": direktAktionFuerWorklistTyp() behandelt
      // jeden unbekannten Typ ohnehin über ihren default-Zweig (→ Prüfseite)
      // — für PRUEFART_NICHT_BESTANDEN ist das exakt die richtige Aktion.
      aktion: direktAktionFuerWorklistTyp(entry.type as GgaWorklistEntryType, entry.cabinetId, cabinet.bestandsaufnahmeAbgeschlossen),
    }]
  })

  // Projekt-/Phasen-Zeilen (Produktblock 7): deriveGgaProjektPhasenWorklist()
  // liefert Aktion/Status/Zuständigkeit bereits fertig abgeleitet — hier nur
  // noch die Anzeige-Kategorie ergänzt und auf dieselbe Zeilenform gebracht.
  const projektPhasenZeilen: MeineArbeitZeile[] = projektPhasenEntries.map((entry) => ({
    id: entry.id, cabinetId: null, kennung: null, standort: null,
    projectId: entry.projectId, projectNumber: entry.projectNumber, projectName: entry.projectName,
    stageTitle: entry.stageTitle,
    problem: entry.title, naechsterSchritt: entry.title,
    dueDate: entry.dueDate, urgency: entry.urgency, ueberfaellig: entry.ueberfaellig,
    kategorie: kategorieFuerTyp(entry.type),
    zustaendigkeit: entry.zustaendigkeit,
    praesentationsStatus: entry.praesentationsStatus,
    aktion: entry.aktion,
  }))

  // Gemeinsame Endsortierung (Abschnitt 8): identisches Schema wie
  // deriveGgaProjectWorklist() intern (Dringlichkeit zuerst, dann Frist),
  // nur der letzte Tiebreaker ist Titel statt Kennung, da Projekt-/Phasen-
  // Zeilen keine Kennung haben.
  const zeilen: MeineArbeitZeile[] = [...cabinetZeilen, ...projektPhasenZeilen].sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency - b.urgency
    if (a.dueDate && b.dueDate) { const diff = a.dueDate.getTime() - b.dueDate.getTime(); if (diff !== 0) return diff }
    else if (a.dueDate && !b.dueDate) return -1
    else if (!a.dueDate && b.dueDate) return 1
    return a.problem.localeCompare(b.problem) || a.id.localeCompare(b.id)
  })

  const searchLower = search.toLowerCase()
  const sichtbareZeilen = zeilen
    .filter((z) => matchesFilter(z, filter))
    // Abschnitt 6/14: "problem" (Titel des Arbeitspunkts, z. B. "GVS Massname")
    // muss durchsuchbar sein — ein projektweiter Eintrag hat weder kennung
    // noch standort und wäre sonst über die Suche gar nicht auffindbar.
    .filter((z) => !search || `${z.projectNumber ?? ''} ${z.projectName} ${z.kennung ?? ''} ${z.standort ?? ''} ${z.stageTitle ?? ''} ${z.problem}`.toLowerCase().includes(searchLower))

  const offen = zeilen.length
  const ueberfaellig = zeilen.filter((z) => z.ueberfaellig).length
  const kritisch = zeilen.filter((z) => z.praesentationsStatus === 'KRITISCH').length
  const pruefungen = zeilen.filter((z) => z.kategorie === 'PRUEFUNG').length
  const freigaben = zeilen.filter((z) => z.kategorie === 'FREIGABE').length

  return <div>
    <p className="text-xs font-600 uppercase tracking-[0.18em] text-blue-700">Persönliche Arbeitsoberfläche</p>
    <h1 className="mt-2 text-3xl font-600 tracking-tight">Meine Arbeit</h1>
    <p className="mt-2 text-sm text-muted-foreground">Priorisierte offene Arbeit über alle GGA-Projekte, -Phasen und -Schränke — was jetzt zu tun ist.</p>

    {/* Kopfbereich (Abschnitt 4): kompakte Kennzahlen, keine großen Dashboard-Karten */}
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Offen</p><p className="mt-1 text-xl font-600">{offen}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Überfällig</p><p className={`mt-1 text-xl font-600 ${ueberfaellig ? 'text-red-700' : ''}`}>{ueberfaellig}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Kritisch</p><p className={`mt-1 text-xl font-600 ${kritisch ? 'text-red-700' : ''}`}>{kritisch}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Prüfungen</p><p className={`mt-1 text-xl font-600 ${pruefungen ? 'text-amber-700' : ''}`}>{pruefungen}</p></div>
      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3"><p className="text-xs text-muted-foreground">Freigaben</p><p className={`mt-1 text-xl font-600 ${freigaben ? 'text-amber-700' : ''}`}>{freigaben}</p></div>
    </div>

    {/* Filter + Suche (Abschnitt 9) */}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FILTER_LABELS) as MeineArbeitFilter[]).map((f) => {
          const sp = new URLSearchParams()
          if (f !== 'alle') sp.set('filter', f)
          if (search) sp.set('q', search)
          const qs = sp.toString()
          return <Link key={f} href={qs ? `/collaboration/my-work?${qs}` : '/collaboration/my-work'} className={`rounded-full border px-3 py-1 text-xs font-600 ${filter === f ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 text-stone-700 hover:border-stone-500'}`}>{FILTER_LABELS[f]}</Link>
        })}
      </div>
      <form className="flex items-center gap-2">
        <input type="search" name="q" defaultValue={search} placeholder="Projekt, Phase, Schrank, Standort …" maxLength={200} className="h-8 w-56 rounded-md border border-stone-300 bg-white px-3 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600" />
        {filter !== 'alle' && <input type="hidden" name="filter" value={filter} />}
        <button type="submit" className="h-8 rounded-md border border-stone-300 bg-white px-3 text-xs font-600 hover:border-blue-400">Suchen</button>
      </form>
    </div>

    {/* Zentrale Arbeitsliste (Abschnitt 5/6/15): kompakte Tabelle, keine Einzelkarten, kein .slice()-Deckel */}
    <div className="mt-4 rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-2 font-600">Priorität</th>
            <th className="px-3 py-2 font-600">Zuständigkeit</th>
            <th className="px-3 py-2 font-600">Projekt</th>
            <th className="px-3 py-2 font-600">Phase</th>
            <th className="px-3 py-2 font-600">Schrank</th>
            <th className="px-3 py-2 font-600">Was ist offen?</th>
            <th className="px-3 py-2 font-600">Nächster Schritt</th>
            <th className="px-3 py-2 font-600">Frist</th>
            <th className="px-3 py-2 font-600">Aktion</th>
          </tr></thead>
          <tbody className="divide-y divide-stone-100">
            {sichtbareZeilen.map((z) => <tr key={z.id} className="hover:bg-stone-50">
              <td className="px-5 py-3">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-600 ${GGA_WORKLIST_URGENCY_BADGE_CLASS[z.urgency]}`}>{GGA_WORKLIST_URGENCY_LABELS[z.urgency]}</span>
                <span className={`ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-600 ${GGA_STATUS_BADGE_CLASS[z.praesentationsStatus]}`}>{GGA_STATUS_LABELS[z.praesentationsStatus]}</span>
              </td>
              <td className="px-3 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-600 ${z.zustaendigkeit === 'MEINE' ? 'bg-blue-100 text-blue-800' : 'bg-stone-100 text-stone-600'}`}>{z.zustaendigkeit === 'MEINE' ? 'Meine Aufgabe' : 'Team / Projekt'}</span></td>
              <td className="px-3 py-3 text-xs"><Link href={`/collaboration/projects/${z.projectId}`} className="text-blue-700 hover:underline">{z.projectNumber ? `${z.projectNumber} · ` : ''}{z.projectName}</Link></td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{z.stageTitle ?? '–'}</td>
              <td className="px-3 py-3 text-xs">{z.cabinetId ? <Link href={`/collaboration/cabinets/${z.cabinetId}`} className="font-600 text-blue-700 hover:underline">{z.kennung}</Link> : <span className="text-muted-foreground">Projektweit</span>}</td>
              <td className="px-3 py-3 text-xs text-slate-800">{z.problem}</td>
              <td className="px-3 py-3 text-xs text-slate-700">{z.naechsterSchritt}</td>
              <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">{z.dueDate ? z.dueDate.toLocaleDateString('de-DE') : '–'}</td>
              <td className="px-3 py-3"><Link href={z.aktion.href} className="text-xs font-600 text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{z.aktion.label} →</Link></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {/* Leerzustand (Abschnitt 13): unterscheidet "gar keine offene Arbeit" von "keine Treffer in dieser Ansicht" */}
      {sichtbareZeilen.length === 0 && <div className="px-5 py-10 text-center">
        {zeilen.length === 0
          ? <>
            <p className="text-sm font-600 text-stone-800">Aktuell keine offenen Arbeitspunkte.</p>
            <Link href="/collaboration/projects" className="mt-3 inline-block text-sm text-blue-700 hover:underline">Projekte öffnen →</Link>
          </>
          : <p className="text-sm text-muted-foreground">Keine Arbeitspunkte in dieser Ansicht.</p>}
      </div>}
    </div>
  </div>
}
