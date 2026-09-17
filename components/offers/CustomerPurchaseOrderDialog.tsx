'use client'

import { useRef, useState, useTransition, type DragEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'

export function CustomerPurchaseOrderDialog({ offerId, mode, trigger }: {
  offerId: string
  mode: 'accept' | 'add'
  trigger: ReactNode
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [orderNumber, setOrderNumber] = useState('')
  const [orderDate, setOrderDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const submittingRef = useRef(false)

  function submit(skipDocument = false) {
    if (submittingRef.current) return
    submittingRef.current = true
    const form = new FormData()
    if (!skipDocument) {
      form.set('orderNumber', orderNumber)
      form.set('orderDate', orderDate)
      if (file) form.set('file', file)
    }
    startTransition(async () => {
      setError(null)
      const response = await fetch(`/api/offers/${offerId}/customer-purchase-order${mode === 'accept' ? '?accept=1' : ''}`, { method: 'POST', body: form })
      const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null
      if (!response.ok || !result?.success) {
        submittingRef.current = false
        setError(result?.error ?? 'Aktion fehlgeschlagen.')
        return
      }
      setFile(null)
      setOrderNumber('')
      setOrderDate('')
      setOpen(false)
      router.refresh()
    })
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setFile(event.dataTransfer.files.item(0))
  }

  return <Dialog.Root open={open} onOpenChange={next => !pending && setOpen(next)}>
    <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 shadow-2xl" aria-describedby={`purchase-order-description-${offerId}`}>
        <Dialog.Title className="text-base font-600">{mode === 'accept' ? 'Angebot annehmen' : 'Kundenbestellung hinzufügen'}</Dialog.Title>
        <Dialog.Description id={`purchase-order-description-${offerId}`} className="mt-1 text-sm text-muted-foreground">Bestätigung der Beauftragung</Dialog.Description>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Kundenbestellnummer (optional)<input value={orderNumber} onChange={event => setOrderNumber(event.target.value)} name="orderNumber" className="mt-1 h-9 w-full rounded-md border border-stone-200 px-3" /></label>
          <label className="text-sm">Bestelldatum (optional)<input value={orderDate} onChange={event => setOrderDate(event.target.value)} name="orderDate" type="date" className="mt-1 h-9 w-full rounded-md border border-stone-200 px-3" /></label>
        </div>
        <div onDragOver={event => event.preventDefault()} onDrop={drop} className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-5 text-center">
          <p className="text-sm font-500">Bestellung hier hineinziehen</p>
          <p className="mt-1 text-xs text-muted-foreground">PDF, DOC/DOCX, XLS/XLSX, EML, JPG, PNG, GIF oder WebP · maximal 20 MB</p>
          <button type="button" className="mt-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm" onClick={() => inputRef.current?.click()}>Datei auswählen</button>
          <input ref={inputRef} type="file" className="sr-only" aria-label="Bestelldokument auswählen" accept=".pdf,.doc,.docx,.xls,.xlsx,.eml,.jpg,.jpeg,.png,.gif,.webp" onChange={event => setFile(event.target.files?.[0] ?? null)} />
          {file && <p className="mt-2 break-all text-xs text-foreground">{file.name}</p>}
        </div>
        {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-9 rounded-md border border-stone-200 px-4 text-sm">Abbrechen</button>
          {mode === 'accept' && <button type="button" disabled={pending} onClick={() => submit(true)} className="h-9 rounded-md border border-stone-200 px-4 text-sm font-500">Ohne Bestellung annehmen</button>}
          <button type="button" disabled={pending} onClick={() => submit(false)} className="h-9 rounded-md bg-blue-700 px-4 text-sm font-500 text-white disabled:opacity-50">{pending ? 'Wird übernommen…' : mode === 'accept' ? 'Annehmen und Bestellung speichern' : 'Bestellung speichern'}</button>
        </div>
        <Dialog.Close className="absolute right-4 top-4 text-stone-500" aria-label="Dialog schließen">×</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
