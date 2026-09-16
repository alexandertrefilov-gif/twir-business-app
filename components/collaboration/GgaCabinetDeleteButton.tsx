'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function GgaCabinetDeleteButton({ cabinetId, canDelete }: { cabinetId: string; canDelete: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (!canDelete) return null

  const run = () => {
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/collaboration/workflow', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'delete-cabinet', id: cabinetId, resolution: 'Über Schrankdetail gelöscht' }),
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Löschen fehlgeschlagen')
        router.push('/collaboration/cabinets')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen')
      }
    })
  }

  if (!confirming) return <button onClick={() => setConfirming(true)} className="rounded border border-red-300 px-3 py-1.5 text-xs font-600 text-red-800 hover:bg-red-50">Schrank löschen</button>

  return <div className="flex items-center gap-2">
    <span className="text-xs text-red-800">Wirklich löschen?</span>
    <button disabled={pending} onClick={run} className="rounded bg-red-700 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-50">Ja, löschen</button>
    <button disabled={pending} onClick={() => setConfirming(false)} className="rounded border border-stone-300 px-3 py-1.5 text-xs">Abbrechen</button>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>
}
