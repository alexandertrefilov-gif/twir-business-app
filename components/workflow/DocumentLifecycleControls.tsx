'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ExternalConfirmationDialog } from '@/components/documents/ExternalConfirmationDialog'
import { markOrderSentAction } from '@/app/(dashboard)/orders/actions'

export function DocumentLifecycleControls({ id, sent, hasCustomerPurchaseOrder, confirmationType, confirmedAt, confirmationNote }: {
  id: string
  sent: boolean
  hasCustomerPurchaseOrder: boolean
  confirmationType?: string | null
  confirmedAt?: string | null
  confirmationNote?: string | null
}) {
  const router = useRouter()
  const pending = useRef(false)
  const [error, setError] = useState<string | null>(null)

  async function markSent() {
    if (pending.current) return
    pending.current = true
    setError(null)
    try {
      const result = await markOrderSentAction(id)
      if (!result.success) setError(result.error ?? 'Versandstatus konnte nicht gespeichert werden.')
      else router.refresh()
    } finally {
      pending.current = false
    }
  }

  return <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}
    {!sent && <ConfirmDialog
      title="Als versendet markieren?"
      description="Der Versand wird mit Datum und Benutzer im Vorgang protokolliert."
      confirmLabel="Als versendet markieren"
      onConfirm={markSent}
      trigger={<button type="button" className="min-h-9 w-full rounded-md bg-blue-700 px-3 py-2 text-sm font-500 text-white">Als versendet markieren</button>}
    />}
    {sent && <ExternalConfirmationDialog
      entityType="order"
      entityId={id}
      hasCustomerPurchaseOrder={hasCustomerPurchaseOrder}
      confirmationType={confirmationType}
      confirmedAt={confirmedAt}
      confirmationNote={confirmationNote}
    />}
  </div>
}
