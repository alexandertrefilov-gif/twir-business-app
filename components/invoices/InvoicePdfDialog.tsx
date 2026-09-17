'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

export function InvoicePdfDialog({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) return
    setLoading(true)
    setError('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pdf`, { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error || 'Rechnungsvorschau konnte nicht erzeugt werden.')
      }
      setPreviewUrl(URL.createObjectURL(await response.blob()))
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Rechnungsvorschau konnte nicht erzeugt werden.')
    } finally {
      setLoading(false)
    }
  }

  return <Dialog.Root open={open} onOpenChange={nextOpen => void handleOpenChange(nextOpen)}>
    <Dialog.Trigger asChild><button type="button" className="inline-flex min-h-8 w-full items-center justify-center rounded border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-500 text-blue-700 hover:bg-stone-50">Vorschau</button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px]" />
      <Dialog.Content className="fixed inset-4 z-[100] flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl sm:inset-8" aria-describedby={undefined}>
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <Dialog.Title className="text-sm font-600">Rechnungsvorschau</Dialog.Title>
          <Dialog.Close asChild><button type="button" aria-label="Vorschau schließen" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-xl text-muted-foreground hover:bg-stone-100">×</button></Dialog.Close>
        </div>
        <div className="min-h-0 flex-1 bg-stone-100">
          {loading && <div className="flex h-full items-center justify-center text-sm text-muted-foreground">PDF-Vorschau wird geladen …</div>}
          {!loading && error && <div className="flex h-full items-center justify-center p-6 text-sm text-red-700">{error}</div>}
          {!loading && previewUrl && <iframe src={previewUrl} title="PDF-Vorschau der Rechnung" className="h-full w-full border-0" />}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
