'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteBillingAddressAction, setDefaultBillingAddressAction } from '@/app/(dashboard)/customers/[id]/billing-addresses/actions'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

export function CustomerBillingAddressActions({ customerId, addressId, canDelete, canSetDefault }: { customerId:string; addressId:string; canDelete:boolean; canSetDefault:boolean }) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const setDefault = () => startTransition(async () => {
    const result = await setDefaultBillingAddressAction(customerId, addressId)
    if (!result.success) setError(result.error)
    else router.refresh()
  })
  async function remove() {
    const result = await deleteBillingAddressAction(customerId, addressId)
    if (!result.success) { setError(result.error); return }
    router.refresh()
  }
  return <div className="mt-3 flex flex-wrap items-center gap-2">
    {canSetDefault && <button disabled={pending} onClick={setDefault} className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs">Als Standard</button>}
    {canDelete && (
      <ConfirmDialog
        title="Rechnungsadresse entfernen?"
        description="Die Rechnungsadresse wird von diesem Kunden entfernt. Die zentrale Adresse bleibt erhalten."
        confirmLabel="Entfernen"
        danger
        onConfirm={remove}
        trigger={<button className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700">Entfernen</button>}
      />
    )}
    {error && <span className="text-xs text-red-700">{error}</span>}
  </div>
}
