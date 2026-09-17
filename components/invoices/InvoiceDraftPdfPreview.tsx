'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function InvoiceDraftPdfPreview({ invoiceId }: { invoiceId?: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function openPreview(button: HTMLButtonElement) {
    const form = button.form
    if (!form) return
    setOpen(true)
    setLoading(true)
    setError('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')

    const formData = new FormData(form)
    const nullable = (name: string) => String(formData.get(name) ?? '').trim() || null
    let items: unknown[] = []
    try { items = JSON.parse(String(formData.get('itemsJson') ?? '[]')) as unknown[] } catch { /* API validation reports the error */ }
    const payload = {
      invoiceId,
      customerId: nullable('customerId'),
      invoiceRecipientSource: nullable('invoiceRecipientSource') ?? 'CUSTOMER',
      billingAddressId: nullable('billingAddressId'),
      recipientName: nullable('recipientName'), recipientAdditional: nullable('recipientAdditional'),
      recipientContactName: nullable('recipientContactName'), recipientEmail: nullable('recipientEmail'),
      recipientStreet: nullable('recipientStreet'), recipientHouseNumber: nullable('recipientHouseNumber'),
      recipientPostalCode: nullable('recipientPostalCode'), recipientCity: nullable('recipientCity'),
      recipientCountry: nullable('recipientCountry'), orderId: nullable('orderId'),
      invoiceDate: nullable('invoiceDate'), dueDate: nullable('dueDate'), deliveryDate: nullable('deliveryDate'),
      deliveryPeriodStart: nullable('deliveryPeriodStart'), deliveryPeriodEnd: nullable('deliveryPeriodEnd'),
      paymentTermDays: nullable('paymentTermDays'), introText: nullable('introText'), outroText: nullable('outroText'),
      items,
    }

    try {
      const response = await fetch('/api/invoices/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(result?.error || 'Vorschau konnte nicht erzeugt werden.')
      }
      setPreviewUrl(URL.createObjectURL(await response.blob()))
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Vorschau konnte nicht erzeugt werden.')
    } finally {
      setLoading(false)
    }
  }

  return <>
    <button type="button" onClick={event => void openPreview(event.currentTarget)} className="h-9 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-500 text-blue-700 hover:bg-blue-100">PDF-Vorschau</button>
    {open && createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="invoice-preview-title">
        <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-3">
            <h2 id="invoice-preview-title" className="font-600">PDF-Vorschau Rechnung</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Vorschau schließen" className="flex h-9 w-9 items-center justify-center rounded text-xl text-muted-foreground hover:bg-stone-100">×</button>
          </div>
          <div className="min-h-0 flex-1 bg-stone-100">
            {loading && <div className="flex h-full items-center justify-center text-sm text-muted-foreground">PDF-Vorschau wird erzeugt …</div>}
            {!loading && error && <div className="flex h-full items-center justify-center p-6 text-sm text-red-700">{error}</div>}
            {!loading && previewUrl && <iframe title="PDF-Vorschau Rechnung" src={previewUrl} className="h-full w-full border-0" />}
          </div>
        </div>
      </div>, document.body,
    )}
  </>
}
