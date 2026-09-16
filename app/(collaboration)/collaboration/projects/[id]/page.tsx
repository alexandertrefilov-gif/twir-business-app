import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCollaborationPhase2Project, getRecentCollaborationActivity } from '@/lib/services/collaboration-phase2.service'
import { getGgaCabinetControlTowerSummary } from '@/lib/services/gga-cabinet.service'
import { GGA_LIFECYCLE_STAGE_LABELS, GGA_BETREIBERSTATUS_LABELS } from '@/lib/collaboration/cabinet-workflow'
import { NotFoundError } from '@/lib/auth/permissions'
import { COLLABORATION_STAGE_STATUS_LABELS, COLLABORATION_PROJECT_STATUS_LABELS, COLLABORATION_ROLE_LABELS, COLLABORATION_HEALTH_STATUS_LABELS, type CollaborationRole } from '@/types/enums'
import { CollaborationStageActions } from '@/components/collaboration/CollaborationStageActions'

const healthBadgeClass: Record<string, string> = { GREEN: 'bg-emerald-50 text-emerald-700', YELLOW: 'bg-amber-50 text-amber-700', RED: 'bg-red-50 text-red-700' }

export default async function CollaborationProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getCollaborationPhase2Project(id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  const activity = await getRecentCollaborationActivity(id)
  const cabinetSummary = await getGgaCabinetControlTowerSummary(id)
  const tasks = project.stages.flatMap((stage) => (stage.tasks ?? []).map((task) => ({ ...task, stageTitle: stage.title })))
  const openTasks = tasks.filter((task) => task.isRequired && !['DONE', 'SKIPPED'].includes(task.status))
  const checklist = project.stages.flatMap((stage) => (stage.checklistItems ?? []).map((item) => ({ ...item, stageTitle: stage.title })))
  const blockers = project.stages.flatMap((stage) => (stage.blockers ?? []).map((blocker) => ({ ...blocker, stageTitle: stage.title }))).filter((item) => item.status === 'OPEN')
  const approvals = project.stages.flatMap((stage) => (stage.approvals ?? []).map((approval) => ({ ...approval, stageTitle: stage.title }))).filter((item) => item.status === 'REQUESTED')
  const canSeeCreationForms = !['COLLAB_VIEWER', 'OPERATOR'].includes(project.role)

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-600 uppercase tracking-[0.18em] text-blue-700">Projektsteuerung</p><h1 className="mt-2 text-3xl font-600 tracking-tight">{project.projectNumber ? `${project.projectNumber} · ` : ''}{project.name}</h1></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-600">{COLLABORATION_PROJECT_STATUS_LABELS[project.status as keyof typeof COLLABORATION_PROJECT_STATUS_LABELS]}</span><span className={`rounded-full px-3 py-1.5 text-xs font-600 ${healthBadgeClass[project.healthStatus] ?? healthBadgeClass.GREEN}`}>{COLLABORATION_HEALTH_STATUS_LABELS[project.healthStatus]}</span></div></div>

    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-muted-foreground">Fortschritt</p><p className="mt-2 text-2xl font-600">{project.progressPercent === null ? '—' : `${project.progressPercent} %`}</p></div>
      <div className="rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-muted-foreground">Offene Aufgaben</p><p className="mt-2 text-2xl font-600">{openTasks.length}</p></div>
      <div className="rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-muted-foreground">Offene Blocker</p><p className={`mt-2 text-2xl font-600 ${blockers.length ? 'text-red-700' : ''}`}>{blockers.length}</p></div>
      <div className="rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-muted-foreground">Ausstehende Freigaben</p><p className={`mt-2 text-2xl font-600 ${approvals.length ? 'text-amber-700' : ''}`}>{approvals.length}</p></div>
      <div className="rounded-xl border border-stone-200 bg-white p-5"><p className="text-sm text-muted-foreground">Nächste Aktion</p><p className="mt-2 font-600">{project.nextAction}</p></div>
    </div>

    {cabinetSummary && <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between"><h2 className="font-600">GGA-Schränke</h2><Link href="/collaboration/cabinets" className="text-sm text-blue-700 hover:underline">Alle anzeigen →</Link></div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <div><p className="text-2xl font-600">{cabinetSummary.gesamt}</p><p className="text-xs text-muted-foreground">Gesamt</p></div>
        <div><p className={`text-2xl font-600 ${cabinetSummary.bestandsaufnahmeOffen ? 'text-amber-700' : ''}`}>{cabinetSummary.bestandsaufnahmeOffen}</p><p className="text-xs text-muted-foreground">Bestandsaufnahme offen</p></div>
        <div><p className={`text-2xl font-600 ${cabinetSummary.planungOffen ? 'text-amber-700' : ''}`}>{cabinetSummary.planungOffen}</p><p className="text-xs text-muted-foreground">Planung offen</p></div>
        <div><p className={`text-2xl font-600 ${cabinetSummary.umsetzungOffen ? 'text-amber-700' : ''}`}>{cabinetSummary.umsetzungOffen}</p><p className="text-xs text-muted-foreground">Umsetzung offen</p></div>
        <div><p className={`text-2xl font-600 ${cabinetSummary.pruefungOffen ? 'text-amber-700' : ''}`}>{cabinetSummary.pruefungOffen}</p><p className="text-xs text-muted-foreground">Prüfung offen</p></div>
        <div><p className={`text-2xl font-600 ${cabinetSummary.betreiberfreigabeAusstehend ? 'text-amber-700' : ''}`}>{cabinetSummary.betreiberfreigabeAusstehend}</p><p className="text-xs text-muted-foreground">Betreiberfreigabe ausstehend</p></div>
        <div><p className={`text-2xl font-600 ${cabinetSummary.nacharbeitErforderlich ? 'text-red-700' : ''}`}>{cabinetSummary.nacharbeitErforderlich}</p><p className="text-xs text-muted-foreground">Nacharbeit erforderlich</p></div>
        <div><p className="text-2xl font-600 text-emerald-700">{cabinetSummary.abgeschlossen}</p><p className="text-xs text-muted-foreground">Abgeschlossen</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className={`text-lg font-600 ${cabinetSummary.betreiberbeanstandung ? 'text-red-700' : ''}`}>{cabinetSummary.betreiberbeanstandung}</p><p className="text-xs text-muted-foreground">Betreiberbeanstandung</p></div>
        <div><p className="text-lg font-600 text-emerald-700">{cabinetSummary.betreiberfreigabeErteilt}</p><p className="text-xs text-muted-foreground">Betreiberfreigabe erteilt</p></div>
      </div>

      <div className="mt-5 border-t border-stone-100 pt-4">
        <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Wo hängt welcher Schrank — und warum?</p>
        <ul className="mt-2 divide-y divide-stone-100">
          {cabinetSummary.cabinets.map((cabinet) => <li key={cabinet.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <Link href={`/collaboration/cabinets/${cabinet.id}`} className="font-600 text-blue-700 hover:underline">{cabinet.kennung}</Link>
            <span className="text-xs text-muted-foreground">{GGA_LIFECYCLE_STAGE_LABELS[cabinet.lifecycleStage as keyof typeof GGA_LIFECYCLE_STAGE_LABELS]}</span>
            {cabinet.betreiberstatus !== 'NICHT_ANGEFORDERT' && <span className="text-xs text-muted-foreground">{GGA_BETREIBERSTATUS_LABELS[cabinet.betreiberstatus as keyof typeof GGA_BETREIBERSTATUS_LABELS]}</span>}
            {cabinet.offeneBlocker > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-600 text-red-800">{cabinet.offeneBlocker} Blocker</span>}
            <span className="flex-1 truncate text-right text-xs text-muted-foreground">{cabinet.naechsteAktion}</span>
          </li>)}
        </ul>
      </div>
    </section>}

    <section aria-labelledby="stage-title" className="mt-8 rounded-xl border border-stone-200 bg-white shadow-sm"><div className="border-b border-stone-200 px-5 py-4"><h2 id="stage-title" className="font-600">Projektphasen</h2></div><ol className="divide-y divide-stone-100">{project.stages.map((stage) => <li key={stage.id} className="px-5 py-5"><div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-600 text-white" aria-hidden="true">{stage.sequence}</span><div><p className="font-600">{stage.title}</p><p className="mt-1 text-sm text-muted-foreground">{stage.code} · {COLLABORATION_STAGE_STATUS_LABELS[stage.derivedStatus]}</p></div><span className="text-sm text-muted-foreground">{stage.weight > 0 ? `${stage.weight} % Gewicht` : 'Ohne Gewicht'}</span></div><CollaborationStageActions stage={stage} role={project.role} projectId={project.id} memberships={project.memberships} showCreationForms={canSeeCreationForms} /></li>)}</ol></section>

    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="tasks-title" className="rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="tasks-title" className="font-600">Aufgaben <span className="text-sm font-normal text-muted-foreground">({tasks.length})</span></h2><Link href="/collaboration/tasks" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-stone-100">{tasks.slice(0, 8).map((task) => <li key={task.id} className="px-5 py-3"><p className="font-600">{task.title}</p><p className="text-xs text-muted-foreground">{task.stageTitle} · {task.status} · {task.isRequired ? 'Erforderlich' : 'Optional'}</p></li>)}</ul>{tasks.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine Aufgaben.</p>}</section>
      <section aria-labelledby="checklist-title" className="rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="checklist-title" className="font-600">Checkliste <span className="text-sm font-normal text-muted-foreground">({checklist.length})</span></h2><Link href="/collaboration/checklists" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-stone-100">{checklist.slice(0, 8).map((item) => <li key={item.id} className="flex items-center gap-3 px-5 py-3"><span aria-hidden="true">{item.completed ? '✓' : '○'}</span><span>{item.title}</span><span className="ml-auto text-xs text-muted-foreground">{item.stageTitle}</span></li>)}</ul>{checklist.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine Checklistenpunkte.</p>}</section>
      <section aria-labelledby="blockers-title" className="rounded-xl border border-red-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-red-100 px-5 py-4"><h2 id="blockers-title" className="font-600 text-red-800">Offene Blocker <span className="text-sm font-normal">({blockers.length})</span></h2><Link href="/collaboration/blockers" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-red-100">{blockers.map((blocker) => <li key={blocker.id} className="px-5 py-3"><p className="font-600">{blocker.title}</p><p className="text-xs text-muted-foreground">{blocker.stageTitle}</p></li>)}</ul>{blockers.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine offenen Blocker.</p>}</section>
      <section aria-labelledby="approvals-title" className="rounded-xl border border-amber-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-amber-100 px-5 py-4"><h2 id="approvals-title" className="font-600 text-amber-800">Ausstehende Freigaben <span className="text-sm font-normal">({approvals.length})</span></h2><Link href="/collaboration/approvals" className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-amber-100">{approvals.map((approval) => <li key={approval.id} className="px-5 py-3"><p className="font-600">{approval.stageTitle}</p><p className="text-xs text-muted-foreground">Angefordert {approval.requestedAt.toLocaleDateString('de-DE')}</p></li>)}</ul>{approvals.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine ausstehenden Freigaben.</p>}</section>
    </div>

    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="team-title" className="rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 id="team-title" className="font-600">Team <span className="text-sm font-normal text-muted-foreground">({project.memberships.length})</span></h2><Link href={`/collaboration/team?project=${project.id}`} className="text-sm text-blue-700 hover:underline">Alle</Link></div><ul className="divide-y divide-stone-100">{project.memberships.map((member) => <li key={member.id} className="px-5 py-3"><p className="font-600">{member.user.firstName} {member.user.lastName}</p><p className="text-xs text-muted-foreground">{COLLABORATION_ROLE_LABELS[member.role as CollaborationRole]}</p></li>)}</ul>{project.memberships.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Keine Beteiligten hinterlegt.</p>}</section>
      <section aria-labelledby="activity-title" className="rounded-xl border border-stone-200 bg-white shadow-sm"><div className="border-b border-stone-200 px-5 py-4"><h2 id="activity-title" className="font-600">Letzte Aktivitäten</h2></div><ul className="divide-y divide-stone-100">{activity.map((event) => <li key={event.id} className="px-5 py-3"><p>{event.label}</p><p className="text-xs text-muted-foreground">{event.stage ? `${event.stage} · ` : ''}{event.at.toLocaleString('de-DE')}</p></li>)}</ul>{activity.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Noch keine Aktivitäten.</p>}</section>
    </div>
  </div>
}
