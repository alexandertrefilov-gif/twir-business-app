'use client'
// components/customers/DeleteCustomerButton.tsx

import { useRouter }         from 'next/navigation'
import { ConfirmDialog }     from '@/components/shared/ConfirmDialog'
import { deleteCustomerAction } from '@/app/(dashboard)/customers/actions'
import { useState }          from 'react'

export function DeleteCustomerButton({ customerId }: { customerId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}
      <ConfirmDialog
        title="Kunden löschen?"
        description="Der Kunde wird als gelöscht markiert und aus allen Listen entfernt. Bestehende Angebote, Aufträge und Rechnungen bleiben erhalten."
        confirmLabel="Ja, löschen"
        danger
        onConfirm={async () => {
          const result = await deleteCustomerAction(customerId)
          if (!result.success) {
            setError(result.error ?? 'Fehler beim Löschen')
            throw new Error(result.error)
          }
          router.push('/customers')
          router.refresh()
        }}
        trigger={
          <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-red-200 bg-white text-sm font-500 text-red-600 hover:bg-red-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
            </svg>
            Löschen
          </button>
        }
      />
    </div>
  )
}
