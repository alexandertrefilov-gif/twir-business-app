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
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Bestätigen',
  danger = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const submittingRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  function handleConfirm() {
    if (submittingRef.current) return
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
        onClick={() => !isPending && !submittingRef.current && setOpen(true)}
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
            <p id={descriptionId} className="text-sm text-muted-foreground mb-6">{description}</p>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="h-9 px-4 rounded-md border border-stone-200 bg-white text-sm font-500 text-foreground hover:bg-stone-50 transition-colors disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={isPending}
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
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
