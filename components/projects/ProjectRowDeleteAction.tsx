'use client'
// components/projects/ProjectRowDeleteAction.tsx
// DELETE-SAFETY-003 — kompakter Zweiteinstieg in die bereits bestehende
// DELETE-SAFETY-001-Löschlogik (deleteProjectAction/getProjectDeleteBlockers),
// direkt in der Projektübersicht (/projects). Keine zweite deleteProject()-
// Implementierung, keine zweite Dependency-Prüfung, keine zweite
// Confirmation-Engine — nur ein zusätzlicher, kompakter UI-Einstiegspunkt.
//
// DELETE-SAFETY-004 — wenn "Zusammenarbeit aktiv" der einzige Grund für die
// Blockierung wäre, bietet der Dialog einen kontrollierten zweiten Schritt
// ("Verbindung lösen") an, statt nur passiv zu blockieren. Dieser Schritt
// hebt ausschließlich die Verknüpfung (CollaborationProject.internalProjectId)
// auf — kein Cascade, keine automatische Projektlöschung, kein Eingriff in
// CollaborationProject.active/deletedAt. Danach läuft Schritt 1 (Projekt
// löschen) erneut exakt wie zuvor, weiterhin geschützt durch alle übrigen
// ProjectDeleteBlockers (Auftrag/Leistung/Rechnung/Dokumente).
//
// DELETE-SAFETY-005 — Korrektur: beide Schritte laufen jetzt über EIN
// einziges, durchgehend gemountetes ConfirmDialog-Element (ein Trigger, ein
// Klick-Handler), dessen Inhalt sich per Props je nach `mode` ändert. Vorher
// wurde beim Wechsel zu "Verbindung lösen" ein ZWEITES ConfirmDialog mit
// eigenem, unsichtbarem Trigger gerendert — brach der Nutzer diesen zweiten
// Dialog ab (Abbrechen/Backdrop), blieb der Löschen-Button der Zeile
// dauerhaft unsichtbar, weil kein Zustand mehr zum sichtbaren Trigger
// zurückführte. Der Trigger-Button ist jetzt unconditional Teil des einzigen
// JSX-Rückgabewerts — kein lokaler State kann ihn mehr dauerhaft ausblenden.
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
  const [mode, setMode] = useState<'delete' | 'release'>('delete')

  // ── Schritt 1: Projekt löschen ──────────────────────────────
  const [checking, setChecking] = useState(false)
  const [blockers, setBlockers] = useState<string[]>([])
  const [collaborationProjectId, setCollaborationProjectId] = useState<string | null>(null)

  // Die Abhängigkeiten sind in den schlanken Listendaten (listProjects())
  // nicht enthalten — bewusst erst beim Klick über den bestehenden
  // getProjectDeleteBlockers()-Wrapper laden, statt für jede Tabellenzeile
  // beim Seitenaufbau vorzuberechnen (N+1-Vermeidung). Jeder Klick auf den
  // Trigger setzt mode zurück auf 'delete' — unabhängig davon, in welchem
  // Zwischenzustand ein vorheriger Dialogaufruf abgebrochen wurde.
  async function checkDeleteDependencies() {
    setMode('delete')
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
    // SSOT: Server-State neu beziehen statt auf lokalen State zu vertrauen —
    // die Zeile verschwindet dadurch ohne Browser-Reload aus der Liste.
    router.refresh()
  }

  // ── Schritt 2: Verbindung lösen (Collaboration Release) ──────
  const [releaseChecking, setReleaseChecking] = useState(false)
  const [releaseBlockers, setReleaseBlockers] = useState<string[]>([])

  // Wechselt den Inhalt DESSELBEN, bereits geöffneten Dialogs — schließt ihn
  // nicht und öffnet keinen zweiten. Dadurch bleibt der Trigger-Button
  // irrelevant für diesen Übergang; es gibt nichts, was er verstecken könnte.
  async function startRelease() {
    if (!collaborationProjectId) return
    setMode('release')
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
    // Zurück auf Schritt 1: SSOT ist CollaborationProject.internalProjectId,
    // nicht lokaler State — router.refresh() liest den Server-State neu, die
    // Zeile zeigt "Nicht aktiviert" ohne Browser-Reload. Ein erneuter Klick
    // auf "Löschen" prüft die übrigen Blocker ganz normal (DELETE-SAFETY-003).
    setMode('delete')
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

  const isCollaborationGate = mode === 'delete' && !checking && blockers.includes(COLLABORATION_ACTIVE_BLOCKER)

  const dialogProps = mode === 'release'
    ? {
        title: 'Verbindung lösen',
        description: `${projectNumber} · ${projectName}\n\nHierdurch wird die Freigabe des internen Projekts für den Bereich Zusammenarbeit aufgehoben.\n\nDas interne Projekt wird in diesem Schritt NICHT gelöscht.`,
        confirmLabel: 'Verbindung lösen',
        checking: releaseChecking,
        blocked: false,
        blockedReasons: releaseBlockers,
        onConfirm: release,
        acknowledgeLabel: 'Ich bestätige, dass die Zusammenarbeit für dieses Projekt aufgehoben werden soll.',
        typedConfirmation: {
          label: `Zur Bestätigung „${projectNumber}“ eingeben:`,
          expected: projectNumber,
          placeholder: projectNumber,
        },
        extraActions: [{ label: 'Zusammenarbeit öffnen', onClick: openCollaboration }],
      }
    : isCollaborationGate
      ? {
          title: 'Projekt löschen',
          description: `${projectNumber} · ${projectName}\nKunde: ${customerName}\n\nDieses Projekt ist noch für die Zusammenarbeit freigegeben.\n\nVor dem Löschen des internen Projekts muss zuerst die Zusammenarbeit kontrolliert aufgehoben werden.`,
          confirmLabel: 'Endgültig löschen',
          checking,
          blocked: true,
          blockedReasons: undefined as string[] | undefined,
          onConfirm: remove,
          acknowledgeLabel: undefined as string | undefined,
          typedConfirmation: undefined as { label: string; expected: string; placeholder?: string } | undefined,
          // "Verbindung lösen" bleibt in der Zeile sichtbar/anklickbar —
          // wechselt nur den Inhalt dieses einen Dialogs (siehe startRelease).
          extraActions: [
            { label: 'Zusammenarbeit öffnen', onClick: openCollaboration },
            { label: 'Verbindung lösen', onClick: startRelease },
          ],
        }
      : {
          title: 'Projekt löschen',
          description: blockers.length > 0
            ? `${projectNumber} · ${projectName}\nKunde: ${customerName}\n\nDieses Projekt kann derzeit nicht gelöscht werden.`
            : `${projectNumber} · ${projectName}\nKunde: ${customerName}\n\nDiese Aktion kann nicht rückgängig gemacht werden.`,
          confirmLabel: 'Endgültig löschen',
          checking,
          blocked: false,
          blockedReasons: blockers,
          onConfirm: remove,
          acknowledgeLabel: 'Ich bestätige, dass dieses Projekt gelöscht werden soll.',
          typedConfirmation: {
            label: `Zur Bestätigung „${projectNumber}“ eingeben:`,
            expected: projectNumber,
            placeholder: projectNumber,
          },
          extraActions: undefined as { label: string; onClick: () => void }[] | undefined,
        }

  return <ConfirmDialog {...dialogProps} danger trigger={triggerButton} />
}
