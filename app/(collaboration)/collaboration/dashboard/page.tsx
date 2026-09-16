import Link from 'next/link'
import { getVisibleCollaborationProjects } from '@/lib/services/collaboration-project.service'

export default async function CollaborationDashboardPage() {
  const projects = await getVisibleCollaborationProjects()
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
  </div>
}
