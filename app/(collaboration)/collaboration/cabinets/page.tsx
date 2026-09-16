import Link from 'next/link'
import { getVisibleGgaCabinets } from '@/lib/services/gga-cabinet.service'
import { getVisibleCollaborationProjects } from '@/lib/services/collaboration-project.service'
import { formatGgaBetriebsstatusLabel, GGA_BETRIEBSSTATUS_BADGE_CLASS } from '@/lib/collaboration/cabinet-workflow'
import { CreateGgaCabinetForm } from '@/components/collaboration/CreateGgaCabinetForm'

function ProgressBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">–</span>
  return <div className="flex items-center gap-2">
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-stone-700" style={{ width: `${value}%` }} /></div>
    <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
  </div>
}

export default async function GgaCabinetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined
  const cabinets = await getVisibleGgaCabinets({ projectId: value('project') })
  const projects = await getVisibleCollaborationProjects()

  return <div>
    <h1 className="text-3xl font-600 tracking-tight">GGA-Schränke</h1>
    <p className="mt-2 text-sm text-muted-foreground">Reale GGA-/Gefahrstoffschränke aus freigegebenen Projekten.</p>

    <form className="mt-6 flex flex-wrap gap-2 rounded-xl border border-stone-200 bg-white p-4">
      <select name="project" defaultValue={value('project') ?? ''} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
        <option value="">Alle Projekte</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <button className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white">Filtern</button>
    </form>

    <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-5 py-3">Kennung</th>
            <th className="px-5 py-3">Standort</th>
            <th className="px-5 py-3">Hersteller / Typ</th>
            <th className="px-5 py-3">Bestand</th>
            <th className="px-5 py-3">Planung</th>
            <th className="px-5 py-3">Montage</th>
            <th className="px-5 py-3">Betriebsstatus</th>
            <th className="px-5 py-3">Blocker</th>
            <th className="px-5 py-3">Verantwortlicher</th>
            <th className="px-5 py-3">Nächste Aktion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {cabinets.map((cabinet) => <tr key={cabinet.id} className="hover:bg-stone-50">
            <td className="px-5 py-3"><Link href={`/collaboration/cabinets/${cabinet.id}`} className="font-600 text-blue-700 hover:underline">{cabinet.kennung}</Link><p className="text-xs text-muted-foreground">{cabinet.bezeichnung}</p></td>
            <td className="px-5 py-3">{cabinet.standort ?? '–'}</td>
            <td className="px-5 py-3">{[cabinet.herstellerName, cabinet.herstellerTyp].filter(Boolean).join(' ') || '–'}</td>
            <td className="px-5 py-3">{cabinet.bestandsaufnahmeAbgeschlossen ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-600 text-green-800">✓ Erfasst</span> : <Link href={`/collaboration/cabinets/${cabinet.id}/bestandsaufnahme`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-600 text-amber-800 hover:bg-amber-200">Aufnehmen</Link>}</td>
            <td className="px-5 py-3"><ProgressBar value={cabinet.planungsfortschritt} /></td>
            <td className="px-5 py-3"><ProgressBar value={cabinet.montagefortschritt} /></td>
            <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-600 ${GGA_BETRIEBSSTATUS_BADGE_CLASS[cabinet.betriebsstatus]}`}>{formatGgaBetriebsstatusLabel(cabinet.betriebsstatus, cabinet.betriebsstatusTageBisFaellig)}</span></td>
            <td className="px-5 py-3">{cabinet.offeneBlocker > 0 ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-600 text-red-800">{cabinet.offeneBlocker}</span> : <span className="text-xs text-muted-foreground">0</span>}</td>
            <td className="px-5 py-3">{cabinet.verantwortlicher ?? 'Nicht zugewiesen'}</td>
            <td className="px-5 py-3 text-xs">{cabinet.naechsteAktion}</td>
          </tr>)}
        </tbody>
      </table>
      {cabinets.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Keine GGA-Schränke vorhanden. Schränke werden nach der technischen Bestandsaufnahme im jeweiligen Projekt angelegt.</p>}
    </div>

    <CreateGgaCabinetForm projects={projects} />
  </div>
}
