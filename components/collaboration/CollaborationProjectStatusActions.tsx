'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

// REQ-016: nur COLLAB_MANAGER darf den Projektstatus ändern — dieselbe
// Rolle, die bereits Projektphasen umstrukturieren darf (restructure-stages).
// Serverseitig ist dies über requireCollaborationManager() in
// transitionCollaborationProjectStatus() erzwungen; diese Prüfung hier ist
// ausschließlich UX (Button ausblenden), kein Ersatz dafür.
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Entwurf', PLANNED: 'Geplant', ACTIVE: 'Aktiv', ON_HOLD: 'Pausiert', COMPLETED: 'Abgeschlossen', CANCELLED: 'Abgebrochen',
}

async function mutate(body: Record<string, unknown>) {
  const response = await fetch('/api/collaboration/workflow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.error || 'Aktion konnte nicht ausgeführt werden')
}

export function CollaborationProjectStatusActions({ projectId, role, allowedTransitions }: { projectId: string; role?: string; allowedTransitions: string[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const canManage = role === 'COLLAB_MANAGER'
  if (!canManage || allowedTransitions.length === 0) return null
  const transition = (target: string) => {
    setError(null)
    startTransition(async () => {
      try { await mutate({ action: 'transition-project', id: projectId, status: target }); router.refresh() }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen') }
    })
  }
  return <div className="flex flex-wrap items-center gap-2">
    {allowedTransitions.map((target) => <button key={target} disabled={pending} onClick={() => transition(target)} className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-600 text-stone-800 hover:border-stone-500 disabled:opacity-50">{STATUS_LABELS[target] ?? target}</button>)}
    {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
  </div>
}
