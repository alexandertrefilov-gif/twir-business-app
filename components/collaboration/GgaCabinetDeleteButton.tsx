'use client'
// components/collaboration/GgaCabinetDeleteButton.tsx
// DELETE-SAFETY-002: dieselbe Sicherheitsqualität wie die Projektlöschung
// (DELETE-SAFETY-001, components/projects/ProjectDeleteAction.tsx) — Checkbox
// + Identitätsbestätigung (Kennung) über den bereits erweiterten
// ConfirmDialog, statt eines eigenen, abweichenden Zwei-Klick-Musters.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

export function GgaCabinetDeleteButton({
  cabinetId,
  kennung,
  canDelete,
  blockers,
}: {
  cabinetId: string
  kennung: string
  canDelete: boolean
  blockers: string[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  if (!canDelete) return null

  if (blockers.length > 0) {
    return (
      <div className="text-xs text-muted-foreground">
        <p>Kann nicht gelöscht werden, weil bereits fachliche Daten vorhanden sind:</p>
        <ul className="mt-1">
          {blockers.map((reason) => <li key={reason}>· {reason}</li>)}
        </ul>
      </div>
    )
  }

  async function remove() {
    setError(null)
    const response = await fetch('/api/collaboration/workflow', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete-cabinet', id: cabinetId, confirmedKennung: kennung, resolution: 'Über Schrankdetail gelöscht' }),
    })
    const result = await response.json()
    if (!response.ok || !result.ok) {
      setError(result.error || 'Löschen fehlgeschlagen')
      return
    }
    router.push('/collaboration/cabinets')
  }

  return (
    <div className="flex items-center gap-2">
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <ConfirmDialog
        title="Schrank löschen?"
        description={`${kennung} — dieser Schrank wird endgültig gelöscht.`}
        confirmLabel="Endgültig löschen"
        danger
        onConfirm={remove}
        acknowledgeLabel="Ich verstehe, dass dieser Vorgang nicht versehentlich ausgeführt werden darf."
        typedConfirmation={{ label: 'Zur Bestätigung Kennung eingeben', expected: kennung, placeholder: kennung }}
        trigger={<button className="rounded border border-red-300 px-3 py-1.5 text-xs font-600 text-red-800 hover:bg-red-50">Schrank löschen</button>}
      />
    </div>
  )
}
