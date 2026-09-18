import { handleCollaborationPageError } from '@/lib/auth/collaboration-guards'
import { getVisibleCollaborationMemberships } from '@/lib/services/collaboration-phase2.service'
import { getVisibleCollaborationProjects } from '@/lib/services/collaboration-project.service'
import { COLLABORATION_ROLE_LABELS, type CollaborationRole } from '@/types/enums'
export default async function CollaborationTeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined
  let memberships: Awaited<ReturnType<typeof getVisibleCollaborationMemberships>>
  try {
    memberships = await getVisibleCollaborationMemberships({ projectId: value('project') })
  } catch (error) {
    handleCollaborationPageError(error)
  }
  const projects = await getVisibleCollaborationProjects()
  return <div><h1 className="text-3xl font-600 tracking-tight">Team</h1><p className="mt-2 text-sm text-muted-foreground">Beteiligte in freigegebenen Projekten.</p><form className="mt-6 flex flex-wrap gap-2 rounded-xl border border-stone-200 bg-white p-4"><select name="project" defaultValue={value('project') ?? ''} className="rounded border border-stone-300 px-2 py-1.5 text-sm"><option value="">Alle Projekte</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white">Filtern</button></form><div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm"><table className="min-w-full text-left text-sm"><thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Projekt</th><th className="px-5 py-3">Rolle</th></tr></thead><tbody className="divide-y divide-stone-100">{memberships.map((membership) => <tr key={membership.id}><td className="px-5 py-3 font-600">{membership.user.firstName} {membership.user.lastName}</td><td className="px-5 py-3">{membership.project.name}</td><td className="px-5 py-3">{COLLABORATION_ROLE_LABELS[membership.role as CollaborationRole]}</td></tr>)}</tbody></table>{memberships.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Keine Beteiligten vorhanden.</p>}</div></div>
}
