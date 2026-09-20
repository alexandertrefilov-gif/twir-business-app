'use client'
// components/projects/ProjectRowDeleteAction.tsx
// DELETE-SAFETY-003 — kompakter Zweiteinstieg in die bereits bestehende
// DELETE-SAFETY-001-Löschlogik (deleteProjectAction/getProjectDeleteBlockers),
// direkt in der Projektübersicht (/projects). Keine zweite deleteProject()-
// Implementierung, keine zweite Dependency-Prüfung, keine zweite
// Confirmation-Engine — nur ein zusätzlicher, kompakter UI-Einstiegspunkt.
//
// DELETE-SAFETY-004 — wenn "Zusammenarbeit aktiv" der einzige Grund für die
// Blockierung wäre, bietet der Dialog jetzt einen kontrollierten zweiten
// Schritt ("Zusammenarbeit aufheben …") an, statt nur passiv zu blockieren.
// Dieser Schritt hebt ausschließlich die Verknüpfung
// (CollaborationProject.internalProjectId) auf — kein Cascade, keine
// automatische Projektlöschung. Danach läuft Schritt 1 (Projekt löschen)
// erneut exakt wie zuvor, weiterhin geschützt durch alle übrigen
// ProjectDeleteBlockers (Auftrag/Leistung/Rechnung/Dokumente).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  deleteProjectAction,
  getCollaborationReleaseInfoAction,
  getProjectDeleteInfoAction,
  releaseCollaborationAction,
} from '@/app/(dashboard)/projects/actions'

const COLLABORATION_ACTIVE_BLOCKER = 'Zusammenarbeit aktiv'

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
  const [step, setStep] = useState<'delete' | 'release'>('delete')

  // ── Schritt 1: Projekt löschen ──────────────────────────────
  const [checking, setChecking] = useState(false)
  const [blockers, setBlockers] = useState<string[]>([])
  const [collaborationProjectId, setCollaborationProjectId] = useState<string | null>(null)

  // Die Abhängigkeiten sind in den schlanken Listendaten (listProjects())
  // nicht enthalten — bewusst erst beim Klick über den bestehenden
  // getProjectDeleteBlockers()-Wrapper laden, statt für jede Tabellenzeile
  // beim Seitenaufbau vorzuberechnen (N+1-Vermeidung).
  async function checkDeleteDependencies() {
    setStep('delete')
    setChecking(true)
    const result = await getProjectDeleteInfoAction(projectId)
    if (!result.success) {
      // Fail closed: ein Fehler bei der Prüfung blockiert die Löschung,
      // statt sie stillschweigend zu erlauben.
      setBlockers([result.error])
      setCollaborationProjectId(null)
      setChecking(false)
      return
    }
    setBlockers(result.blockers)
    setCollaborationProjectId(result.collaborationProjectId)
    setChecking(false)
  }

  async function remove() {
    const result = await deleteProjectAction(projectId, projectNumber)
    if (!result.success) throw new Error(result.error)
    router.refresh()
  }

  // ── Schritt 2: Zusammenarbeit aufheben ───────────────────────
  const [releaseChecking, setReleaseChecking] = useState(false)
  const [releaseBlockers, setReleaseBlockers] = useState<string[]>([])

  async function startRelease() {
    if (!collaborationProjectId) return
    setStep('release')
    setReleaseChecking(true)
    const result = await getCollaborationReleaseInfoAction(collaborationProjectId)
    if (!result.success) {
      setReleaseBlockers([result.error])
      setReleaseChecking(false)
      return
    }
    setReleaseBlockers(result.blockers)
    setReleaseChecking(false)
  }

  async function release() {
    const result = await releaseCollaborationAction(projectId, projectNumber)
    if (!result.success) throw new Error(result.error)
    // Zurück auf Schritt 1: "Zusammenarbeit" zeigt danach "Nicht aktiviert",
    // ein erneuter Löschversuch prüft die übrigen Blocker ganz normal.
    setStep('delete')
    setBlockers([])
    setCollaborationProjectId(null)
    router.refresh()
  }

  function openCollaboration() {
    if (collaborationProjectId) router.push(`/collaboration/projects/${collaborationProjectId}`)
  }

  const triggerButton = (
    <button
      type="button"
      onClick={checkDeleteDependencies}
      className="rounded border border-red-200 px-2 py-1 text-xs font-500 text-red-700 hover:bg-red-50"
    >
      Löschen
    </button>
  )

  if (step === 'release') {
    return (
      <ConfirmDialog
        title="Zusammenarbeit aufheben"
        description={`${projectNumber} · ${projectName}\n\nHierdurch wird die Freigabe des internen Projekts für den Bereich Zusammenarbeit aufgehoben.\n\nDas interne Projekt wird in diesem Schritt NICHT gelöscht.`}
        confirmLabel="Zusammenarbeit aufheben"
        danger
        defaultOpen
        checking={releaseChecking}
        blockedReasons={releaseBlockers}
        onConfirm={release}
        acknowledgeLabel="Ich bestätige, dass die Zusammenarbeit für dieses Projekt aufgehoben werden soll."
        typedConfirmation={{
          label: `Zur Bestätigung „${projectNumber}“ eingeben:`,
          expected: projectNumber,
          placeholder: projectNumber,
        }}
        extraActions={[{ label: 'Zusammenarbeit öffnen', onClick: openCollaboration }]}
        trigger={<span hidden />}
      />
    )
  }

  const isCollaborationGate = !checking && blockers.includes(COLLABORATION_ACTIVE_BLOCKER)

  const description = isCollaborationGate
    ? `${projectNumber} · ${projectName}\nKunde: ${customerName}\n\nDieses Projekt ist noch für die Zusammenarbeit freigegeben.\n\nVor dem Löschen des internen Projekts muss zuerst die Zusammenarbeit kontrolliert aufgehoben werden.`
    : blockers.length > 0
      ? `${projectNumber} · ${projectName}\nKunde: ${customerName}\n\nDieses Projekt kann derzeit nicht gelöscht werden.`
      : `${projectNumber} · ${projectName}\nKunde: ${customerName}\n\nDiese Aktion kann nicht rückgängig gemacht werden.`

  return (
    <ConfirmDialog
      title="Projekt löschen"
      description={description}
      confirmLabel="Endgültig löschen"
      danger
      checking={checking}
      blocked={isCollaborationGate}
      blockedReasons={isCollaborationGate ? undefined : blockers}
      onConfirm={remove}
      acknowledgeLabel="Ich bestätige, dass dieses Projekt gelöscht werden soll."
      typedConfirmation={{
        label: `Zur Bestätigung „${projectNumber}“ eingeben:`,
        expected: projectNumber,
        placeholder: projectNumber,
      }}
      extraActions={isCollaborationGate ? [
        { label: 'Zusammenarbeit öffnen', onClick: openCollaboration },
        { label: 'Zusammenarbeit aufheben …', onClick: startRelease },
      ] : undefined}
      trigger={triggerButton}
    />
  )
}
