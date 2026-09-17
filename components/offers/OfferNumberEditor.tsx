'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ActionState } from '@/app/(dashboard)/offers/actions'

interface OfferNumberEditorProps {
  offerNumber: string
  action: (offerNumber: string) => Promise<ActionState>
}

export function OfferNumberEditor({ offerNumber, action }: OfferNumberEditorProps) {
  const router = useRouter()
  const [currentNumber, setCurrentNumber] = useState(offerNumber)
  const [newNumber, setNewNumber] = useState(offerNumber)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function cancelEditing() {
    setNewNumber(currentNumber)
    setError(undefined)
    setIsEditing(false)
  }

  function save() {
    setError(undefined)
    startTransition(async () => {
      const result = await action(newNumber)
      if (!result.success) {
        setError(result.error ?? 'Angebotsnummer konnte nicht geändert werden.')
        return
      }
      const normalizedNumber = newNumber.trim()
      setCurrentNumber(normalizedNumber)
      setNewNumber(normalizedNumber)
      setIsEditing(false)
      router.refresh()
    })
  }

  return (
    <div>
      <label className="field-label" htmlFor="manualOfferNumber">Angebotsnummer</label>
      {!isEditing ? (
        <div className="flex flex-wrap items-center gap-3">
          <output id="manualOfferNumber" className="min-w-0 flex-1 h-9 px-3 rounded-md border border-stone-200 bg-stone-50 text-sm font-600 flex items-center">
            {currentNumber}
          </output>
          <button type="button" onClick={() => setIsDialogOpen(true)} className="h-9 px-3 rounded-md border border-stone-200 bg-white text-sm text-blue-700 hover:bg-blue-50">
            Nummer bearbeiten
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input id="manualOfferNumber" value={newNumber} onChange={(event) => setNewNumber(event.target.value)} className="min-w-52 flex-1 h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
            <button type="button" onClick={save} disabled={isPending} className="h-9 px-3 rounded-md bg-blue-700 text-sm text-white hover:bg-blue-800 disabled:opacity-50">{isPending ? 'Speichert …' : 'Speichern'}</button>
            <button type="button" onClick={cancelEditing} disabled={isPending} className="h-9 px-3 rounded-md border border-stone-200 bg-white text-sm hover:bg-stone-50 disabled:opacity-50">Abbrechen</button>
          </div>
          <p className="field-hint">Nur freie Nummern aus einem bereits erreichten Angebotsnummernkreis sind zulässig.</p>
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      )}

      {isDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsDialogOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-5 shadow-xl" role="alertdialog" aria-modal="true" aria-labelledby="offer-number-dialog-title" aria-describedby="offer-number-dialog-description">
            <h3 id="offer-number-dialog-title" className="text-base font-600 text-foreground">Angebotsnummer manuell ändern</h3>
            <p id="offer-number-dialog-description" className="mt-2 text-sm text-muted-foreground">Die Angebotsnummer ist Bestandteil der Dokumenthistorie. Änderungen werden protokolliert.</p>
            <dl className="mt-4 text-sm"><dt className="text-muted-foreground">Aktuelle Nummer</dt><dd className="mt-1 font-600">{currentNumber}</dd></dl>
            <label className="field-label mt-4" htmlFor="proposedOfferNumber">Neue Nummer</label>
            <input id="proposedOfferNumber" autoFocus value={newNumber} onChange={(event) => setNewNumber(event.target.value)} className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setNewNumber(currentNumber); setIsDialogOpen(false) }} className="h-9 px-3 rounded-md border border-stone-200 bg-white text-sm hover:bg-stone-50">Abbrechen</button>
              <button type="button" onClick={() => { setError(undefined); setIsDialogOpen(false); setIsEditing(true) }} className="h-9 px-3 rounded-md bg-blue-700 text-sm text-white hover:bg-blue-800">Bearbeitung freigeben</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
