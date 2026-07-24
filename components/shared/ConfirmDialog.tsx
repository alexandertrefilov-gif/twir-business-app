'use client'
// components/shared/ConfirmDialog.tsx

import { useState, useTransition } from 'react'

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

  function handleConfirm() {
    startTransition(async () => {
      await onConfirm()
      setOpen(false)
    })
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => !isPending && setOpen(false)}
          />

          {/* Dialog */}
          <div className="relative bg-white rounded-xl border border-stone-200 shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-600 text-foreground mb-2">{title}</h2>
            <p className="text-sm text-muted-foreground mb-6">{description}</p>

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
        </div>
      )}
    </>
  )
}
