'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

const cabinetEditorRoles = ['COLLAB_MANAGER', 'INTERNAL_PLANNER']

export function CreateGgaCabinetForm({ projects }: { projects: Array<{ id: string; name: string; role?: string }> }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const eligible = projects.filter((project) => project.role && cabinetEditorRoles.includes(project.role))
  const [projectId, setProjectId] = useState(eligible[0]?.id ?? '')
  const [kennung, setKennung] = useState('')
  const [bezeichnung, setBezeichnung] = useState('')

  if (eligible.length === 0) return null

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/collaboration/workflow', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'create-cabinet', id: projectId, data: { kennung, bezeichnung } }),
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Schrank konnte nicht angelegt werden')
        router.push(`/collaboration/cabinets/${result.result.id}/bestandsaufnahme`)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen')
      }
    })
  }

  return <form onSubmit={submit} className="mt-6 flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-4">
    <div>
      <label className="block text-xs font-600" htmlFor="new-cabinet-project">Projekt</label>
      <select id="new-cabinet-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1 rounded border border-stone-300 px-2 py-1.5 text-sm">
        {eligible.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-xs font-600" htmlFor="new-cabinet-kennung">Kennung</label>
      <input id="new-cabinet-kennung" value={kennung} onChange={(event) => setKennung(event.target.value)} placeholder="z. B. GGA-001" required className="mt-1 rounded border border-stone-300 px-2 py-1.5 text-sm" />
    </div>
    <div>
      <label className="block text-xs font-600" htmlFor="new-cabinet-bezeichnung">Bezeichnung</label>
      <input id="new-cabinet-bezeichnung" value={bezeichnung} onChange={(event) => setBezeichnung(event.target.value)} placeholder="z. B. Gefahrstoffschrank Halle 2" required className="mt-1 rounded border border-stone-300 px-2 py-1.5 text-sm" />
    </div>
    <button disabled={pending || !projectId} className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">Schrank anlegen</button>
    {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
  </form>
}
