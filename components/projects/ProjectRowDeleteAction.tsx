'use client'
// components/projects/ProjectRowDeleteAction.tsx
// DELETE-SAFETY-003 — kompakter Zweiteinstieg in die bereits bestehende
// DELETE-SAFETY-001-Löschlogik (deleteProjectAction/getProjectDeleteBlockers),
// direkt in der Projektübersicht (/projects). Keine zweite deleteProject()-
// Implementierung, keine zweite Dependency-Prüfung, keine zweite
// Confirmation-Engine — nur ein zusätzlicher, kompakter UI-Einstiegspunkt.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { deleteProjectAction, getProjectDeleteInfoAction } from '@/app/(dashboard)/projects/actions'

export function ProjectRowDeleteAction({
  projectId,
  projectNumber,
  projectName,
  customerName,
}: {
  projectId: string
  projectNumber: string
  projectName: string
  customerName: string
}) {
  const router = useRouter()
  const [checking, setChecking] = useState(false)
  const [blockers, setBlockers] = useState<string[]>([])

  // Die Abhängigkeiten sind in den schlanken Listendaten (listProjects())
  // nicht enthalten — bewusst erst beim Klick über den bestehenden
  // getProjectDeleteBlockers()-Wrapper laden, statt für jede Tabellenzeile
  // beim Seitenaufbau vorzuberechnen (N+1-Vermeidung).
  async function checkDependencies() {
    setChecking(true)
    const result = await getProjectDeleteInfoAction(projectId)
    if (!result.success) {
      // Fail closed: ein Fehler bei der Prüfung blockiert die Löschung,
      // statt sie stillschweigend zu erlauben.
      setBlockers([result.error])
      setChecking(false)
      return
    }
    setBlockers(result.blockers)
    setChecking(false)
  }

  async function remove() {
    const result = await deleteProjectAction(projectId, projectNumber)
    if (!result.success) throw new Error(result.error)
    router.refresh()
  }

  const description = blockers.length > 0
    ? `${projectNumber} · ${projectName}\nKunde: ${customerName}\n\nDieses Projekt kann derzeit nicht gelöscht werden.`
    : `${projectNumber} · ${projectName}\nKunde: ${customerName}\n\nDiese Aktion kann nicht rückgängig gemacht werden.`

  return (
    <ConfirmDialog
      title="Projekt löschen"
      description={description}
      confirmLabel="Endgültig löschen"
      danger
      checking={checking}
      blockedReasons={blockers}
      onConfirm={remove}
      acknowledgeLabel="Ich bestätige, dass dieses Projekt gelöscht werden soll."
      typedConfirmation={{
        label: `Zur Bestätigung „${projectNumber}“ eingeben:`,
        expected: projectNumber,
        placeholder: projectNumber,
      }}
      trigger={
        <button
          type="button"
          onClick={checkDependencies}
          className="rounded border border-red-200 px-2 py-1 text-xs font-500 text-red-700 hover:bg-red-50"
        >
          Löschen
        </button>
      }
    />
  )
}
