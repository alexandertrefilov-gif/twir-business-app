'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { deleteOfferAction } from '@/app/(dashboard)/offers/actions'
import { deleteOrderAction } from '@/app/(dashboard)/orders/actions'
import { deleteServiceReportAction } from '@/app/(dashboard)/services/actions'
import { deleteInvoiceDraftAction } from '@/app/(dashboard)/invoices/actions'
import { deleteCustomerAction } from '@/app/(dashboard)/customers/actions'

type RecordType = 'customer' | 'offer' | 'order' | 'serviceReport' | 'invoice'

const LABELS: Record<RecordType, { title: string; description: string }> = {
  customer: {
    title: 'Kunden löschen?',
    description: 'Der Kunde wird deaktiviert. Bestehende Dokumentverknüpfungen bleiben erhalten.',
  },
  offer: {
    title: 'Angebotsentwurf löschen?',
    description: 'Der Angebotsentwurf wird dauerhaft gelöscht.',
  },
  order: {
    title: 'Auftrag löschen?',
    description: 'Der Auftrag wird dauerhaft gelöscht. Dies ist nur ohne erfasste Leistungen möglich.',
  },
  serviceReport: {
    title: 'Leistungsnachweis löschen?',
    description: 'Der Leistungsnachweis und seine Positionen werden dauerhaft gelöscht.',
  },
  invoice: {
    title: 'Rechnungsentwurf löschen?',
    description: 'Der Rechnungsentwurf und seine Positionen werden dauerhaft gelöscht.',
  },
}

export function RecordDeleteButton({
  id,
  type,
}: {
  id: string
  type: RecordType
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const labels = LABELS[type]

  async function remove() {
    setError(null)
    const result = type === 'customer'
      ? await deleteCustomerAction(id)
      : type === 'offer'
        ? await deleteOfferAction(id)
        : type === 'order'
          ? await deleteOrderAction(id)
          : type === 'serviceReport'
            ? await deleteServiceReportAction(id)
            : await deleteInvoiceDraftAction(id)

    if (!result.success) {
      setError(result.error ?? 'Löschen nicht möglich')
      return
    }
    router.refresh()
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <ConfirmDialog
        title={labels.title}
        description={`${labels.description} Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        danger
        onConfirm={remove}
        trigger={
          <button
            type="button"
            aria-label={labels.title}
            title="Löschen"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        }
      />
    </div>
  )
}
