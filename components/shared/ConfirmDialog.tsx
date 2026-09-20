'use client'
// components/shared/ConfirmDialog.tsx

import { useId, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmDialogProps {
  trigger:     React.ReactNode
  title:       string
  description: string
  confirmLabel?: string
  danger?:     boolean
  onConfirm:   () => Promise<void>
  // DELETE-SAFETY-001 Phase 2 — CRITICAL-Tier: zusätzlich zur normalen
  // Bestätigung eine Checkbox UND eine exakte Texteingabe verlangen, bevor
  // der Bestätigen-Button überhaupt aktiv wird. Rein clientseitig — die
  // jeweilige Server-Aktion MUSS dieselbe Eingabe serverseitig erneut
  // prüfen (siehe deleteProject()), das ist hier keine alleinige Barriere.
  acknowledgeLabel?: string
  typedConfirmation?: { label: string; expected: string; placeholder?: string }
  // DELETE-SAFETY-003 — Blockierungs-Modus: wenn nicht-leer, ersetzt eine
  // konkrete Liste von Blockierungsgründen (aus der bereits bestehenden
  // Dependency-Guard-Logik) die Checkbox/Eingabe/Bestätigen-Button-UI. In
  // diesem Zustand existiert KEIN aktiver, endgültiger Bestätigen-Button —
  // nur „Abbrechen" zum Schließen.
  blockedReasons?: string[]
  // DELETE-SAFETY-004 — erzwingt den Blockierungs-Modus (kein aktiver
  // Bestätigen-Button, extraActions statt Bestätigen), OHNE die
  // Abhängigkeitsliste anzuzeigen — für Fälle, in denen die Erklärung
  // bereits vollständig in `description` steht (z.B. "Zusammenarbeit noch
  // aktiv"-Zwischenschritt vor DELETE-SAFETY-004).
  blocked?: boolean
  // DELETE-SAFETY-003 — true während blockedReasons noch on-demand geladen
  // wird (z.B. Klick auf "Löschen" in einer Listenzeile): unterdrückt den
  // Bestätigen-Button genau wie blockedReasons, zeigt aber einen
  // Lade-Hinweis statt einer (noch unbekannten) Abhängigkeitsliste.
  checking?: boolean
  // DELETE-SAFETY-004 — zusätzliche Aktionen im Blockierungs-Modus (z.B.
  // "Zusammenarbeit öffnen", "Zusammenarbeit aufheben …"), links von
  // "Schließen" platziert. Nur im blockierten Zustand relevant.
  extraActions?: { label: string; onClick: () => void }[]
  // DELETE-SAFETY-004 — öffnet den Dialog sofort beim Mounten statt erst
  // beim Klick auf `trigger`. Für einen zweiten, direkt anschließenden
  // Dialog-Schritt (z.B. nach einer Aktion aus extraActions), der ohne
  // eigenen sichtbaren Trigger-Klick erscheinen muss.
  defaultOpen?: boolean
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Bestätigen',
  danger = false,
  onConfirm,
  acknowledgeLabel,
  typedConfirmation,
  blockedReasons,
  blocked = false,
  checking = false,
  extraActions,
  defaultOpen = false,
}: ConfirmDialogProps) {
  const isBlocked = checking || blocked || (!!blockedReasons && blockedReasons.length > 0)
  const [open, setOpen] = useState(defaultOpen)
  const [isPending, startTransition] = useTransition()
  const [acknowledged, setAcknowledged] = useState(false)
  const [typedValue, setTypedValue] = useState('')
  const submittingRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()
  const acknowledgeId = useId()
  const typedConfirmationId = useId()

  const canConfirm = !isBlocked && (!acknowledgeLabel || acknowledged) && (!typedConfirmation || typedValue === typedConfirmation.expected)

  function openDialog() {
    setAcknowledged(false)
    setTypedValue('')
    setOpen(true)
  }

  function handleConfirm() {
    if (submittingRef.current || !canConfirm) return
    submittingRef.current = true
    // Die Bestätigung ist abgeschlossen; der Dialog darf die Dokumentseite
    // während einer längeren Server Action (z. B. Archivierung) nicht sperren.
    setOpen(false)
    startTransition(async () => {
      try {
        await onConfirm()
      } finally {
        submittingRef.current = false
      }
    })
  }

  return (
    <>
      <span
        aria-busy={isPending}
        className={isPending ? 'pointer-events-none opacity-70' : undefined}
        onClick={() => !isPending && !submittingRef.current && openDialog()}
      >
        {trigger}
      </span>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => !isPending && setOpen(false)}
          />

          {/* Dialog */}
          <div className="relative bg-white rounded-xl border border-stone-200 shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 id={titleId} className="text-base font-600 text-foreground mb-2">{title}</h2>
            <p id={descriptionId} className="whitespace-pre-line text-sm text-muted-foreground mb-4">{description}</p>

            {checking && (
              <p className="mb-4 text-sm text-muted-foreground">Abhängigkeiten werden geprüft…</p>
            )}

            {!checking && isBlocked && !!blockedReasons?.length && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-500 text-amber-900">Vorhandene Abhängigkeiten:</p>
                <ul className="mt-1 space-y-0.5 text-sm text-amber-800">
                  {blockedReasons.map((reason) => <li key={reason}>· {reason}</li>)}
                </ul>
              </div>
            )}

            {!isBlocked && acknowledgeLabel && (
              <label className="mb-3 flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={acknowledged}
                  disabled={isPending}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                {acknowledgeLabel}
              </label>
            )}

            {!isBlocked && typedConfirmation && (
              <div className="mb-4">
                <label htmlFor={typedConfirmationId} className="mb-1 block text-xs font-500 text-muted-foreground">
                  {typedConfirmation.label}
                </label>
                <input
                  id={typedConfirmationId}
                  type="text"
                  autoComplete="off"
                  value={typedValue}
                  disabled={isPending}
                  onChange={(e) => setTypedValue(e.target.value)}
                  placeholder={typedConfirmation.placeholder}
                  className="h-9 w-full rounded-md border border-stone-200 px-3 text-sm mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end">
              {!checking && isBlocked && extraActions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={isPending}
                  onClick={action.onClick}
                  className="h-9 px-4 rounded-md border border-stone-200 bg-white text-sm font-500 text-foreground hover:bg-stone-50 transition-colors disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="h-9 px-4 rounded-md border border-stone-200 bg-white text-sm font-500 text-foreground hover:bg-stone-50 transition-colors disabled:opacity-50"
              >
                {!checking && isBlocked ? 'Schließen' : 'Abbrechen'}
              </button>
              {!isBlocked && (
                <button
                  type="button"
                  disabled={isPending || !canConfirm}
                  onClick={handleConfirm}
                  className={`
                    h-9 px-4 rounded-md text-sm font-500 text-white transition-colors disabled:opacity-50
                    ${danger
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-700 hover:bg-blue-800'
                    }
                  `}
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Wird ausgeführt…
                    </span>
                  ) : confirmLabel}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
