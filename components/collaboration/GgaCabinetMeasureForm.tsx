'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Stage = { id: string; code: string; title: string }
type Membership = { id: string; role: string; user: { firstName: string; lastName: string } }

// Maßnahmen sind bewusst kein eigenes Fachobjekt — sie setzen direkt auf dem
// bestehenden CollaborationTask auf (Phase 4: "Kein zweites Maßnahmen-/
// Task-System bauen"). Der Cabinet-Bezug wird serverseitig in
// createCollaborationTask gegen die Stage-Projektzugehörigkeit geprüft.
export function GgaCabinetMeasureForm({ cabinetId, stages, memberships, canEdit }: {
  cabinetId: string
  stages: Stage[]
  memberships: Membership[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const planningStage = stages.find((s) => s.code === 'PLANUNG') ?? stages[0]
  const [stageId, setStageId] = useState(planningStage?.id ?? '')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [responsibleMembershipId, setResponsibleMembershipId] = useState('')

  if (!canEdit || !stageId) return null

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/collaboration/workflow', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'create-task', id: stageId, data: { title, priority, cabinetId, responsibleMembershipId: responsibleMembershipId || null } }),
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Maßnahme konnte nicht angelegt werden')
        setTitle('')
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen')
      }
    })
  }

  return <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 rounded-md bg-stone-50 p-3">
    <label className="block min-w-[220px] flex-1"><span className="text-xs font-600">Maßnahme</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="z. B. Abluftanschluss herstellen" required className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm" /></label>
    <label className="block"><span className="text-xs font-600">Phase</span><select value={stageId} onChange={(event) => setStageId(event.target.value)} className="mt-1 rounded border border-stone-300 px-2 py-1.5 text-sm">{stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    <label className="block"><span className="text-xs font-600">Priorität</span><select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1 rounded border border-stone-300 px-2 py-1.5 text-sm"><option value="URGENT">Dringend</option><option value="HIGH">Hoch</option><option value="MEDIUM">Mittel</option><option value="LOW">Niedrig</option></select></label>
    {memberships.length > 0 && <label className="block"><span className="text-xs font-600">Verantwortlicher</span><select value={responsibleMembershipId} onChange={(event) => setResponsibleMembershipId(event.target.value)} className="mt-1 rounded border border-stone-300 px-2 py-1.5 text-sm"><option value="">Nicht zugewiesen</option>{memberships.map((m) => <option key={m.id} value={m.id}>{m.user.firstName} {m.user.lastName}</option>)}</select></label>}
    <button disabled={pending} className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">Maßnahme anlegen</button>
    {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
  </form>
}
