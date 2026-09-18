import Link from 'next/link'
import { getVisibleCollaborationProjects } from '@/lib/services/collaboration-project.service'
import { getGgaControlTowerOverview } from '@/lib/services/gga-cabinet.service'
import { GGA_CONTROL_TOWER_REASON_LABELS, GGA_LIFECYCLE_STAGE_LABELS, formatGgaBetriebsstatusLabel, GGA_BETRIEBSSTATUS_BADGE_CLASS } from '@/lib/collaboration/cabinet-workflow'

export default async function CollaborationDashboardPage() {
  const projects = await getVisibleCollaborationProjects()
  const gga = await getGgaControlTowerOverview()
  const active = projects.filter((project) => project.status === 'ACTIVE').length
  const critical = projects.filter((project) => project.healthStatus === 'RED').length
  const progressValues = projects.map((project) => project.progressPercent).filter((value): value is number => value !== null)
  const averageProgress = progressValues.length ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) : null
  const openTasks = projects.flatMap((project) => project.stages.flatMap((stage) => stage.tasks ?? [])).filter((task) => task.isRequired && !['DONE', 'SKIPPED'].includes(task.status)).length
  const openBlockers = projects.flatMap((project) => project.stages.flatMap((stage) => stage.blockers ?? [])).filter((blocker) => blocker.status === 'OPEN').length
  const pendingApprovals = projects.flatMap((project) => project.stages.flatMap((stage) => stage.approvals ?? [])).filter((approval) => approval.status === 'REQUESTED').length
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-600 uppercase tracking-[0.18em] text-blue-700">Control Tower</p><h1 className="mt-2 text-3xl font-600 tracking-tight">Projektübersicht</h1><p className="mt-2 text-sm text-muted-foreground">Freigegebene Projekte, aktueller Fortschritt und nächste Schritte.</p></div>
      <Link href="/collaboration/projects" className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-600 hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Alle Projekte</Link>
    </div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['Aktive Projekte', active, 'blue'], ['Kritische Projekte', critical, 'red'], ['Offene Aufgaben', openTasks, 'slate'], ['Offene Blocker', openBlockers, 'red'], ['Ausstehende Freigaben', pendingApprovals, 'slate'], ['Ø Fortschritt', averageProgress === null ? '—' : `${averageProgress} %`, 'emerald']].map(([label, value, color]) => <div key={label} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-3 text-3xl font-600 ${color === 'red' ? 'text-red-700' : color === 'emerald' ? 'text-emerald-700' : color === 'blue' ? 'text-blue-700' : 'text-slate-900'}`}>{value}</p></div>)}
    </div>
    <section aria-labelledby="project-list-title" className="mt-8 rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-5 py-4"><h2 id="project-list-title" className="font-600">Handlungsbedarf und Projekte</h2></div>
      <div className="divide-y divide-stone-100">{projects.map((project) => <Link key={project.id} href={`/collaboration/projects/${project.id}`} className="grid gap-3 px-5 py-5 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 md:grid-cols-[minmax(0,1.6fr)_0.8fr_1fr_1.2fr] md:items-center"><div className="min-w-0"><p className="truncate font-600">{project.projectNumber ? `${project.projectNumber} · ` : ''}{project.name}</p><p className="mt-1 truncate text-sm text-muted-foreground">{[project.location, project.building, project.floor].filter(Boolean).join(' · ') || 'Keine Ortsangaben hinterlegt'}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-600 ${project.healthStatus === 'RED' ? 'bg-red-50 text-red-700' : project.healthStatus === 'YELLOW' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{project.healthStatus === 'RED' ? 'Kritisch' : project.healthStatus === 'YELLOW' ? 'Beobachten' : 'Stabil'}</span><div><p className="text-sm font-600">{project.progressPercent === null ? 'Noch nicht bewertet' : `${project.progressPercent} % Fortschritt`}</p><p className="mt-1 text-xs text-muted-foreground">{project.stages.find((stage) => stage.derivedStatus === 'IN_PROGRESS')?.title || 'Keine aktive Phase'}</p></div><div className="text-sm text-slate-700"><span className="text-xs uppercase tracking-wide text-muted-foreground">Nächster Schritt</span><p className="mt-1">{project.nextAction}</p></div></Link>)}</div>
      {projects.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Keine aktiven Projektfreigaben.</p>}
    </section>

    {/* Ebene 1+2: GGA Control Tower — Gesamtübersicht + sicherheitsrelevante Zustände */}
    <section aria-labelledby="gga-control-tower-title" className="mt-8 rounded-xl border border-stone-200 bg-white p-5">
      <p className="text-xs font-600 uppercase tracking-[0.18em] text-blue-700">GGA Control Tower</p>
      <h2 id="gga-control-tower-title" className="mt-1 font-600">Projektübergreifende GGA-Steuerung</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-600 text-stone-900">{gga.aktiveGgaProjekte}</span> aktive GGA-Projekte ·{' '}
          <span className="font-600 text-stone-900">{gga.gesamt.abgeschlossen}</span> von <span className="font-600 text-stone-900">{gga.gesamt.gesamt}</span> Schränken abgeschlossen
        </p>
        {gga.dringendeSchraenke.length > 0 && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-600 text-red-800">⚠ {gga.dringendeSchraenke.length} Schrank/Schränke benötigen Aufmerksamkeit</span>}
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <p className="text-xs font-600 uppercase tracking-wide text-amber-800">Sicherheitsrelevant — über alle Projekte</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div><p className={`text-2xl font-600 ${gga.gesamt.nachpruefungErforderlich ? 'text-amber-700' : ''}`}>{gga.gesamt.nachpruefungErforderlich}</p><p className="text-xs text-muted-foreground">Nachprüfung erforderlich</p></div>
          <div><p className={`text-2xl font-600 ${gga.gesamt.ueberfaellig ? 'text-red-700' : ''}`}>{gga.gesamt.ueberfaellig}</p><p className="text-xs text-muted-foreground">Überfällig</p></div>
          <div><p className={`text-2xl font-600 ${gga.gesamt.mitBlocker ? 'text-red-700' : ''}`}>{gga.gesamt.mitBlocker}</p><p className="text-xs text-muted-foreground">Offene Mängel</p></div>
          <div><p className={`text-2xl font-600 ${gga.gesamt.freigabeOffen ? 'text-amber-700' : ''}`}>{gga.gesamt.freigabeOffen}</p><p className="text-xs text-muted-foreground">Interne Freigabe offen</p></div>
          <div><p className={`text-2xl font-600 ${gga.gesamt.betreiberfreigabeAusstehend ? 'text-amber-700' : ''}`}>{gga.gesamt.betreiberfreigabeAusstehend}</p><p className="text-xs text-muted-foreground">Betreiberfreigabe ausstehend</p></div>
          <div><p className={`text-2xl font-600 ${gga.gesamt.betreiberbeanstandung ? 'text-red-700' : ''}`}>{gga.gesamt.betreiberbeanstandung}</p><p className="text-xs text-muted-foreground">Betreiberbeanstandung</p></div>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Fortschritt — über alle Projekte</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div><p className="text-2xl font-600">{gga.gesamt.bestandsaufnahmeOffen}</p><p className="text-xs text-muted-foreground">Bestandsaufnahme offen</p></div>
          <div><p className="text-2xl font-600">{gga.gesamt.planungOffen}</p><p className="text-xs text-muted-foreground">Planung offen</p></div>
          <div><p className="text-2xl font-600">{gga.gesamt.umsetzungOffen}</p><p className="text-xs text-muted-foreground">Umsetzung offen</p></div>
          <div><p className="text-2xl font-600">{gga.gesamt.pruefungOffen}</p><p className="text-xs text-muted-foreground">Prüfung offen</p></div>
          <div><p className="text-2xl font-600 text-emerald-700">{gga.gesamt.abgeschlossen}</p><p className="text-xs text-muted-foreground">Abgeschlossen</p></div>
        </div>
      </div>
    </section>

    {/* Ebene 3: Projektübersicht */}
    <section aria-labelledby="gga-project-overview-title" className="mt-6 rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-5 py-4"><h2 id="gga-project-overview-title" className="font-600">GGA-Projektübersicht</h2></div>
      <div className="divide-y divide-stone-100">
        {gga.projekte.map((project) => <Link key={project.projectId} href={`/collaboration/projects/${project.projectId}`} className="grid gap-2 px-5 py-4 text-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 md:grid-cols-[minmax(0,1.4fr)_repeat(6,auto)] md:items-center">
          <div className="min-w-0">
            <p className="truncate font-600">{project.projectNumber ? `${project.projectNumber} · ` : ''}{project.projectName}</p>
            {project.dringendeSchraenkeAnzahl > 0 && <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-600 text-red-800">⚠ Aufmerksamkeit</span>}
          </div>
          <span className="text-xs text-muted-foreground">{project.gesamt} Schränke</span>
          <span className={`text-xs ${project.mitBlocker ? 'font-600 text-red-700' : 'text-muted-foreground'}`}>{project.mitBlocker} Mängel</span>
          <span className={`text-xs ${project.nachpruefungErforderlich ? 'font-600 text-amber-700' : 'text-muted-foreground'}`}>{project.nachpruefungErforderlich} Nachprüfung</span>
          <span className={`text-xs ${project.ueberfaellig ? 'font-600 text-red-700' : 'text-muted-foreground'}`}>{project.ueberfaellig} überfällig</span>
          <span className={`text-xs ${project.freigabeOffen ? 'font-600 text-amber-700' : 'text-muted-foreground'}`}>{project.freigabeOffen} interne Freigabe</span>
          <span className={`text-xs ${project.betreiberfreigabeAusstehend ? 'font-600 text-amber-700' : 'text-muted-foreground'}`}>{project.betreiberfreigabeAusstehend} Betreiberfreigabe</span>
          <span className="text-xs text-emerald-700">{project.abgeschlossen} abgeschlossen</span>
        </Link>)}
      </div>
      {gga.projekte.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Keine GGA-Schränke in den für Sie sichtbaren Projekten.</p>}
    </section>

    {/* Ebene 4: Dringende GGA-Schränke */}
    <section aria-labelledby="gga-urgent-cabinets-title" className="mt-6 rounded-xl border border-red-200 bg-white shadow-sm">
      <div className="border-b border-red-100 px-5 py-4"><h2 id="gga-urgent-cabinets-title" className="font-600 text-red-800">Dringende GGA-Schränke <span className="text-sm font-normal">({gga.dringendeSchraenke.length})</span></h2></div>
      <ul className="divide-y divide-stone-100">
        {gga.dringendeSchraenke.map((cabinet) => <li key={cabinet.cabinetId}>
          <Link href={`/collaboration/cabinets/${cabinet.cabinetId}`} className="grid gap-2 px-5 py-4 text-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="font-600">{cabinet.kennung}</p>
              <p className="truncate text-xs text-muted-foreground">{cabinet.projectNumber ? `${cabinet.projectNumber} · ` : ''}{cabinet.projectName}{cabinet.standort ? ` · ${cabinet.standort}` : ''}</p>
            </div>
            <div className="min-w-0">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-600 ${GGA_BETRIEBSSTATUS_BADGE_CLASS[cabinet.betriebsstatus]}`}>{formatGgaBetriebsstatusLabel(cabinet.betriebsstatus, cabinet.betriebsstatusTageBisFaellig)}</span>
              <p className="mt-1 truncate text-xs text-muted-foreground">{GGA_LIFECYCLE_STAGE_LABELS[cabinet.lifecycleStage]} · {cabinet.naechsteAktion}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {cabinet.gruende.map((grund) => <span key={grund} className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-600 text-red-800">{GGA_CONTROL_TOWER_REASON_LABELS[grund]}</span>)}
            </div>
          </Link>
        </li>)}
      </ul>
      {gga.dringendeSchraenke.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Keine dringenden GGA-Schränke — alles im grünen Bereich.</p>}
    </section>
  </div>
}
