'use client'
// components/collaboration/CollaborationProjectDeleteAction.tsx
// Entfernt ausschließlich das Collaboration-Projekt aus den aktiven Sichten
// (active=false, deletedAt gesetzt) — kein Hard-Delete, kein Cascade. Nutzt
// denselben zentralen ConfirmDialog wie die interne Projektlöschung
// (components/projects/ProjectRowDeleteAction.tsx), statt eines eigenen
// Browser-Prompt-Musters: on-demand Abhängigkeits-Check vor der
// eigentlichen Bestätigung, Checkbox + exakte Projektnummer-Eingabe,
// konkrete Blockierungsgründe statt eines generischen Fehlers.
//
// Härtung: deleteCollaborationProject() prüft jetzt serverseitig dieselben
// Abhängigkeiten wie der kontrollierte Rückbau Internal Project ↔
// Collaboration (GGA-Schränke/Aufgaben/Checklistenpunkte/offene Blocker/
// Freigaben/Dokumente/Prüfnachweise) sowie eine noch bestehende Verknüpfung
// mit einem internen Projekt — vorher gab es dort keinen einzigen Check.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

async function callWorkflow(body: Record<string, unknown>) {
  const response = await fetch('/api/collaboration/workflow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.error || 'Aktion fehlgeschlagen')
  return result.result
}

export function CollaborationProjectDeleteAction({
  projectId,
  projectNumber,
  projectName,
  role,
}: {
  projectId: string
  projectNumber: string | null
  projectName: string
  role?: string
}) {
  const router = useRouter()
  const [checking, setChecking] = useState(false)
  const [blockers, setBlockers] = useState<string[]>([])

  if (role !== 'COLLAB_MANAGER') return null

  async function checkDependencies() {
    setChecking(true)
    try {
      const result = await callWorkflow({ action: 'project-delete-info', id: projectId }) as { blockers: string[] }
      setBlockers(result.blockers)
    } catch (cause) {
      // Fail closed: ein Fehler bei der Prüfung blockiert die Entfernung,
      // statt sie stillschweigend zu erlauben.
      setBlockers([cause instanceof Error ? cause.message : 'Abhängigkeiten konnten nicht geprüft werden'])
    } finally {
      setChecking(false)
    }
  }

  async function remove() {
    await callWorkflow({ action: 'delete-project', id: projectId, confirmedKennung: projectNumber ?? '' })
    router.replace('/collaboration/projects')
    router.refresh()
  }

  const description = blockers.length > 0
    ? `${projectNumber ?? projectName} · ${projectName}\n\nDieses Projekt kann derzeit nicht entfernt werden.`
    : `${projectNumber ?? projectName} · ${projectName}\n\nDiese Aktion kann nicht rückgängig gemacht werden.`

  return (
    <ConfirmDialog
      title="Projekt entfernen"
      description={description}
      confirmLabel="Endgültig entfernen"
      danger
      checking={checking}
      blockedReasons={blockers}
      onConfirm={remove}
      acknowledgeLabel="Ich bestätige, dass dieses Projekt entfernt werden soll."
      typedConfirmation={projectNumber ? {
        label: `Zur Bestätigung „${projectNumber}“ eingeben:`,
        expected: projectNumber,
        placeholder: projectNumber,
      } : undefined}
      trigger={
        <button
          type="button"
          onClick={checkDependencies}
          className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-600 text-red-700 hover:bg-red-50"
        >
          Projekt entfernen
        </button>
      }
    />
  )
}
