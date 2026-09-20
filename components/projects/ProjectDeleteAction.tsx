'use client'
// components/projects/ProjectDeleteAction.tsx
// DELETE-SAFETY-001 Phase 3 — kontrollierte Projektlöschung. Bewusst NICHT
// als Icon-Button direkt in der Projektliste/Tabellenzeile, sondern als
// eigener Abschnitt "Projektaktionen" auf der Detailseite (siehe
// app/(dashboard)/projects/[id]/page.tsx).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { deleteProjectAction } from '@/app/(dashboard)/projects/actions'

export function ProjectDeleteAction({
  projectId,
  projectNumber,
  projectName,
  blockers,
}: {
  projectId: string
  projectNumber: string
  projectName: string
  blockers: string[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  if (blockers.length > 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-600">Projektaktionen</h2>
        <p className="mt-3 text-sm text-foreground">
          Dieses Projekt kann nicht gelöscht werden, weil bereits geschäftliche Vorgänge damit verknüpft sind:
        </p>
        <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
          {blockers.map((reason) => <li key={reason}>· {reason}</li>)}
        </ul>
      </div>
    )
  }

  async function remove() {
    setError(null)
    const result = await deleteProjectAction(projectId, projectNumber)
    if (!result.success) {
      setError(result.error ?? 'Projekt konnte nicht gelöscht werden')
      return
    }
    router.push('/projects')
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="font-600">Projektaktionen</h2>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-3">
        <ConfirmDialog
          title="Projekt löschen?"
          description={`${projectNumber} · ${projectName}`}
          confirmLabel="Endgültig löschen"
          danger
          onConfirm={remove}
          acknowledgeLabel="Ich bestätige, dass dieses Projekt gelöscht werden soll."
          typedConfirmation={{
            label: 'Zur Bestätigung Projektnummer eingeben',
            expected: projectNumber,
            placeholder: projectNumber,
          }}
          trigger={
            <button
              type="button"
              className="h-9 rounded-md border border-red-200 bg-white px-3 text-sm font-500 text-red-600 hover:bg-red-50"
            >
              Projekt löschen
            </button>
          }
        />
      </div>
    </div>
  )
}
