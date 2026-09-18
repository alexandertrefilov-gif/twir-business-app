import { handleCollaborationPageError } from '@/lib/auth/collaboration-guards'
import { getVisibleCollaborationBlockers } from '@/lib/services/collaboration-phase2.service'
import { getVisibleCollaborationProjects } from '@/lib/services/collaboration-project.service'
import { COLLABORATION_BLOCKER_STATUS_LABELS } from '@/types/enums'
export default async function CollaborationBlockersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined
  let blockers: Awaited<ReturnType<typeof getVisibleCollaborationBlockers>>
  try {
    blockers = await getVisibleCollaborationBlockers({ projectId: value('project'), status: value('status') })
  } catch (error) {
    handleCollaborationPageError(error)
  }
  const projects = await getVisibleCollaborationProjects()
  return <div><h1 className="text-3xl font-600 tracking-tight">Blocker</h1><p className="mt-2 text-sm text-muted-foreground">Gemeldete Blocker aus freigegebenen Projekten.</p><form className="mt-6 flex flex-wrap gap-2 rounded-xl border border-stone-200 bg-white p-4"><select name="project" defaultValue={value('project') ?? ''} className="rounded border border-stone-300 px-2 py-1.5 text-sm"><option value="">Alle Projekte</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><select name="status" defaultValue={value('status') ?? ''} className="rounded border border-stone-300 px-2 py-1.5 text-sm"><option value="">Alle Status</option><option value="OPEN">Offen</option><option value="RESOLVED">Gelöst</option></select><button className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white">Filtern</button></form><div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm"><table className="min-w-full text-left text-sm"><thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Blocker</th><th className="px-5 py-3">Projekt / Phase</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Ursache</th></tr></thead><tbody className="divide-y divide-stone-100">{blockers.map((blocker) => <tr key={blocker.id} className={blocker.status === 'OPEN' ? 'bg-red-50/40' : undefined}><td className="px-5 py-3 font-600">{blocker.title}</td><td className="px-5 py-3">{blocker.project.name}{blocker.stage ? ` · ${blocker.stage.title}` : ''}</td><td className="px-5 py-3">{COLLABORATION_BLOCKER_STATUS_LABELS[blocker.status]}</td><td className="px-5 py-3 text-muted-foreground">{blocker.cause ?? '—'}</td></tr>)}</tbody></table>{blockers.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Keine Blocker vorhanden.</p>}</div></div>
}
