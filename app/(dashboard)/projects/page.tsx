import Link from 'next/link'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { listProjects } from '@/lib/services/project.service'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/types/enums'

const fmt = (value: Date | null) => value ? new Intl.DateTimeFormat('de-DE').format(value) : '–'

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string }> }) {
  await requirePermission(Resource.PROJECT, Action.READ)
  const query = await searchParams
  const search = query.search ?? ''
  const status = (query.status ?? '') as ProjectStatus | ''
  const projects = await listProjects({ search: search || undefined, status: status || undefined })
  return <main className="space-y-6">
    <div className="flex items-center justify-between">
      <div><h1 className="text-2xl font-700">Projekte</h1><p className="text-sm text-muted-foreground">Interne Projektsteuerung und kaufmännischer Kontext</p></div>
      <Link href="/projects/new" className="rounded bg-blue-600 px-4 py-2 text-sm font-600 text-white">Projekt anlegen</Link>
    </div>
    <form className="card-base flex flex-wrap items-end gap-3 p-4">
      <label className="grid gap-1 text-xs font-500 text-stone-700">Suche
        <input type="text" name="search" defaultValue={search} placeholder="Nummer, Name, Kunde" className="h-9 w-56 rounded-md border border-stone-200 bg-white px-3 text-sm" />
      </label>
      <label className="grid gap-1 text-xs font-500 text-stone-700">Status
        <select name="status" defaultValue={status} className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm">
          <option value="">Alle</option>
          {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button type="submit" className="btn-secondary h-9">Filtern</button>
    </form>
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground">
          <th className="p-3">Nr.</th><th className="p-3">Projekt</th><th className="p-3">Kunde</th><th className="p-3">Leitung</th><th className="p-3">Status</th><th className="p-3">Beginn</th><th className="p-3">Ende</th><th className="p-3">Zusammenarbeit</th>
        </tr></thead>
        <tbody>
          {projects.map(p => <tr key={p.id} className="border-b last:border-0">
            <td className="p-3"><Link className="text-blue-700" href={`/projects/${p.id}`}>{p.projectNumber}</Link></td>
            <td className="p-3">{p.name}</td>
            <td className="p-3">{p.customer.name}</td>
            <td className="p-3">{p.leadUser ? `${p.leadUser.firstName} ${p.leadUser.lastName}` : '—'}</td>
            <td className="p-3">{PROJECT_STATUS_LABELS[p.status]}</td>
            <td className="p-3">{fmt(p.plannedStart)}</td>
            <td className="p-3">{fmt(p.plannedEnd)}</td>
            <td className="p-3">{p.collaborationProject ? 'Aktiv' : 'Nicht aktiviert'}</td>
          </tr>)}
          {projects.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Keine Projekte für diesen Filter.</td></tr>}
        </tbody>
      </table>
    </div>
  </main>
}
