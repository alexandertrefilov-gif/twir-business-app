import Link from 'next/link'
import { getVisibleCollaborationProjects } from '@/lib/services/collaboration-project.service'
import { COLLABORATION_HEALTH_STATUS_LABELS, COLLABORATION_PROJECT_STATUS_LABELS, COLLABORATION_STAGE_STATUS_LABELS } from '@/types/enums'
import { getStageCompletionBlocker } from '@/lib/collaboration/project-workflow'

type ProjectFilter = 'alle' | 'handlungsbedarf' | 'in-arbeit' | 'pruefung' | 'freigabe' | 'blockiert'
const FILTER_LABELS: Record<ProjectFilter, string> = { alle: 'Alle', handlungsbedarf: 'Handlungsbedarf', 'in-arbeit': 'In Arbeit', pruefung: 'Prüfungen', freigabe: 'Freigaben', blockiert: 'Blockiert' }
const HEALTH_BADGE: Record<string, string> = { GREEN: 'bg-emerald-50 text-emerald-700', YELLOW: 'bg-amber-50 text-amber-700', RED: 'bg-red-50 text-red-700' }

type VisibleProject = Awaited<ReturnType<typeof getVisibleCollaborationProjects>>[number]
function projectMatches(project: VisibleProject, filter: ProjectFilter) {
  const openBlockers = project.stages.flatMap((stage) => stage.blockers ?? []).some((blocker) => blocker.status === 'OPEN')
  const openApprovals = project.stages.flatMap((stage) => stage.approvals ?? []).some((approval) => approval.status === 'REQUESTED')
  const waitingForReview = project.stages.some((stage) => stage.derivedStatus === 'WAITING_FOR_APPROVAL')
  switch (filter) {
    case 'alle': return true
    case 'handlungsbedarf': return project.healthStatus !== 'GREEN' || Boolean(project.nextAction)
    case 'in-arbeit': return project.stages.some((stage) => stage.derivedStatus === 'IN_PROGRESS')
    case 'pruefung': return waitingForReview
    case 'freigabe': return openApprovals
    case 'blockiert': return openBlockers || project.healthStatus === 'RED'
  }
}

export default async function CollaborationProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const filterParam = typeof params.filter === 'string' ? params.filter : 'alle'
  const filter = (Object.keys(FILTER_LABELS) as ProjectFilter[]).includes(filterParam as ProjectFilter) ? filterParam as ProjectFilter : 'alle'
  const search = typeof params.q === 'string' ? params.q.trim().slice(0, 200) : ''
  const projects = await getVisibleCollaborationProjects()
  const searchLower = search.toLowerCase()
  const visibleProjects = projects.filter((project) => projectMatches(project, filter)).filter((project) => !search || `${project.projectNumber ?? ''} ${project.name} ${project.location ?? ''} ${project.building ?? ''} ${project.floor ?? ''}`.toLowerCase().includes(searchLower))

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-600 tracking-tight">Projekte</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Freigegebene Collaboration-Projekte im Überblick. Öffnen Sie ein Projekt, um die Phasenpipeline und die operative Arbeit zu bearbeiten.</p></div>
      <p className="text-sm tabular-nums text-muted-foreground">{visibleProjects.length} von {projects.length} Projekten</p>
    </div>

    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Projektfilter" className="flex flex-wrap gap-1.5">{(Object.keys(FILTER_LABELS) as ProjectFilter[]).map((item) => { const query = new URLSearchParams(); if (item !== 'alle') query.set('filter', item); if (search) query.set('q', search); const href = query.toString() ? `/collaboration/projects?${query}` : '/collaboration/projects'; return <Link key={item} href={href} className={`rounded-full border px-3 py-1.5 text-xs font-600 ${filter === item ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 text-stone-700 hover:border-stone-500'}`}>{FILTER_LABELS[item]}</Link> })}</nav>
      <form className="flex items-center gap-2"><label htmlFor="project-search" className="sr-only">Projekte durchsuchen</label><input id="project-search" type="search" name="q" defaultValue={search} placeholder="Projekt, Nummer, Ort …" maxLength={200} className="h-9 w-56 rounded-md border border-stone-300 bg-white px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600" />{filter !== 'alle' && <input type="hidden" name="filter" value={filter} />}<button type="submit" className="h-9 rounded-md border border-stone-300 bg-white px-3 text-sm font-600 hover:border-blue-400">Suchen</button></form>
    </div>

    <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead><tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3 font-600">Projekt</th><th className="px-3 py-3 font-600">Status / Ampel</th><th className="px-3 py-3 font-600">Fortschritt</th><th className="px-3 py-3 font-600">Aktuelle Phase</th><th className="px-3 py-3 font-600">Handlungsbedarf</th><th className="px-3 py-3 font-600">Prüfungen / Freigaben</th><th className="px-3 py-3 font-600">Aktion</th></tr></thead><tbody className="divide-y divide-stone-100">
      {visibleProjects.map((project) => { const activeStage = project.stages.find((stage) => stage.derivedStatus === 'IN_PROGRESS'); const openBlockers = project.stages.flatMap((stage) => stage.blockers ?? []).filter((blocker) => blocker.status === 'OPEN'); const openApprovals = project.stages.flatMap((stage) => stage.approvals ?? []).filter((approval) => approval.status === 'REQUESTED'); const stageWithBlocker = project.stages.find((stage) => getStageCompletionBlocker(stage)); const waitingStages = project.stages.filter((stage) => stage.derivedStatus === 'WAITING_FOR_APPROVAL'); const handlungsbedarf = openBlockers[0]?.title ?? project.nextAction; return <tr key={project.id} className="hover:bg-stone-50"><td className="px-5 py-4"><Link href={`/collaboration/projects/${project.id}`} className="font-600 text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{project.projectNumber ? `${project.projectNumber} · ` : ''}{project.name}</Link><p className="mt-1 text-xs text-muted-foreground">{[project.location, project.building, project.floor].filter(Boolean).join(' · ') || 'Keine Ortsangaben hinterlegt'}</p></td><td className="px-3 py-4"><div className="flex flex-wrap gap-1.5"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-600">{COLLABORATION_PROJECT_STATUS_LABELS[project.status as keyof typeof COLLABORATION_PROJECT_STATUS_LABELS]}</span><span className={`rounded-full px-2 py-0.5 text-xs font-600 ${HEALTH_BADGE[project.healthStatus] ?? HEALTH_BADGE.GREEN}`}>{COLLABORATION_HEALTH_STATUS_LABELS[project.healthStatus]}</span></div></td><td className="px-3 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-stone-700" style={{ width: `${project.progressPercent ?? 0}%` }} /></div><span className="text-xs tabular-nums text-muted-foreground">{project.progressPercent === null ? '–' : `${project.progressPercent} %`}</span></div></td><td className="px-3 py-4"><p className="font-600">{activeStage?.title ?? '–'}</p><p className="mt-1 text-xs text-muted-foreground">{activeStage ? COLLABORATION_STAGE_STATUS_LABELS[activeStage.derivedStatus] : project.stages[0] ? COLLABORATION_STAGE_STATUS_LABELS[project.stages[0].derivedStatus] : 'Keine Phase'}</p></td><td className="px-3 py-4 text-xs"><span className={handlungsbedarf && project.healthStatus !== 'GREEN' ? 'font-600 text-red-700' : 'text-slate-700'}>{handlungsbedarf || 'Kein offener Schritt'}</span>{stageWithBlocker && <p className="mt-1 text-muted-foreground">{stageWithBlocker.title}</p>}</td><td className="px-3 py-4 text-xs text-slate-700">{openApprovals.length ? `${openApprovals.length} Freigabe${openApprovals.length === 1 ? '' : 'n'} offen` : 'Keine Freigabe offen'}<p className="mt-1 text-muted-foreground">{waitingStages.length} Prüfung{waitingStages.length === 1 ? '' : 'en'} warten</p></td><td className="px-3 py-4"><Link href={`/collaboration/projects/${project.id}`} className="text-xs font-600 text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Projekt öffnen →</Link></td></tr> })}
    </tbody></table></div>{visibleProjects.length === 0 && <div className="px-5 py-10 text-center"><p className="text-sm font-600 text-stone-800">Keine Projekte in dieser Ansicht.</p><p className="mt-1 text-sm text-muted-foreground">Prüfen Sie Suche oder Filter. Angezeigt werden nur aktive Projekte mit Ihrer Collaboration-Freigabe.</p></div>}</div>
  </div>
}
