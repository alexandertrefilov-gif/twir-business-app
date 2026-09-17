'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useRef, useState, useTransition, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'

export function ExternalConfirmationDialog({ entityType, entityId, label = 'Bestätigung hochladen', hasCustomerPurchaseOrder = false, confirmationType, confirmedAt, confirmationNote }: {
  entityType: 'order' | 'service-report'
  entityId: string
  label?: string
  hasCustomerPurchaseOrder?: boolean
  confirmationType?: string | null
  confirmedAt?: string | null
  confirmationNote?: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [type, setType] = useState(confirmationType ?? 'SIGNED_DOCUMENT')
  const [date, setDate] = useState(confirmedAt?.slice(0, 10) ?? '')
  const [note, setNote] = useState(confirmationNote ?? '')

  function submit() {
    if ((entityType === 'service-report' || type === 'SIGNED_DOCUMENT') && !file) {
      setError('Bitte wählen Sie ein unterschriebenes Dokument aus.')
      return
    }
    if (submitting.current) return
    submitting.current = true
    const data = new FormData()
    if (file) data.set('file', file)
    if (entityType === 'order') {
      data.set('confirmationType', type)
    }
    data.set('confirmedAt', date)
    data.set('confirmationNote', note)
    startTransition(async () => {
      setError(null)
      try {
        const response = await fetch(`/api/document-confirmations/${entityType}/${entityId}`, { method: 'POST', body: data })
        const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null
        if (!response.ok || !result?.success) {
          setError(result?.error ?? 'Bestätigung konnte nicht gespeichert werden.')
          return
        }
        setFile(null)
        setOpen(false)
        router.refresh()
      } finally {
        submitting.current = false
      }
    })
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setFile(event.dataTransfer.files.item(0))
  }

  return <Dialog.Root open={open} onOpenChange={next => !pending && setOpen(next)}>
    <Dialog.Trigger asChild><button type="button" className="min-h-9 w-full rounded-md bg-blue-700 px-3 py-2 text-sm font-500 text-white hover:bg-blue-800">{label}</button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 shadow-2xl" aria-describedby={`confirmation-description-${entityId}`}>
        <Dialog.Title className="text-base font-600">{entityType === 'order' ? 'Auftrag bestätigen' : 'Kundenbestätigung hochladen'}</Dialog.Title>
        <Dialog.Description id={`confirmation-description-${entityId}`} className="mt-1 text-sm text-muted-foreground">Bestätigungsart und Nachweis werden nachvollziehbar im Vorgang gespeichert.</Dialog.Description>
        <div className="mt-4 space-y-3">
          {entityType === 'order' &&
          <label className="block text-sm font-500">Art der Bestätigung
            <select value={type} onChange={event => setType(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-stone-200 bg-white px-3">
              <option value="SIGNED_DOCUMENT">Unterschriebenes Dokument hochladen</option>
              <option value="EMAIL">Per E-Mail bestätigt</option>
              <option value="VERBAL">Mündlich / telefonisch bestätigt</option>
              {hasCustomerPurchaseOrder && <option value="CUSTOMER_PURCHASE_ORDER">Durch Kundenbestellung bestätigt</option>}
              <option value="NOT_REQUIRED">Keine separate Bestätigung erforderlich</option>
            </select>
          </label>}
          <label className="block text-sm">Bestätigungsdatum (optional)<input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-stone-200 px-3" /></label>
          <label className="block text-sm">Bemerkung (optional)<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2" /></label>
        </div>
        {(entityType === 'service-report' || type === 'SIGNED_DOCUMENT' || Boolean(confirmationType)) && <div onDragOver={event => event.preventDefault()} onDrop={drop} className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-5 text-center">
          <p className="text-sm font-500">{type === 'SIGNED_DOCUMENT' || entityType === 'service-report' ? 'Bestätigung hier hineinziehen' : 'Zusätzliches Bestätigungsdokument (optional)'}</p>
          <p className="mt-1 text-xs text-muted-foreground">PDF, DOC/DOCX, XLS/XLSX, EML oder Bild · maximal 20 MB</p>
          <button type="button" className="mt-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm" onClick={() => inputRef.current?.click()}>Datei auswählen</button>
          <input ref={inputRef} type="file" className="sr-only" aria-label="Kundenbestätigung auswählen" accept=".pdf,.doc,.docx,.xls,.xlsx,.eml,.jpg,.jpeg,.png,.gif,.webp" onChange={event => setFile(event.target.files?.[0] ?? null)} />
          {file && <p className="mt-2 break-all text-xs">{file.name}</p>}
        </div>}
        {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-9 rounded-md border border-stone-200 px-4 text-sm">Abbrechen</button>
          <button type="button" disabled={pending || ((entityType === 'service-report' || type === 'SIGNED_DOCUMENT') && !file)} onClick={submit} className="h-9 rounded-md bg-blue-700 px-4 text-sm font-500 text-white disabled:opacity-50">{pending ? 'Wird gespeichert…' : entityType === 'order' ? 'Auftrag bestätigen' : 'Bestätigung speichern'}</button>
        </div>
        <Dialog.Close className="absolute right-4 top-4 text-stone-500" aria-label="Dialog schließen">×</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
