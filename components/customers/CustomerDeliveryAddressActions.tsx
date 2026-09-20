'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteDeliveryAddressAction,
  setDefaultDeliveryAddressAction,
  setDeliveryAddressActiveAction,
} from '@/app/(dashboard)/customers/[id]/delivery-addresses/actions'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

export function CustomerDeliveryAddressActions({ customerId, addressId, isActive, canDelete, canSetDefault, canUpdate }: {
  customerId: string
  addressId: string
  isActive: boolean
  canDelete: boolean
  canSetDefault: boolean
  canUpdate: boolean
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const run = (kind: 'default'|'active') => startTransition(async () => {
    const result = kind === 'default'
      ? await setDefaultDeliveryAddressAction(customerId, addressId)
      : await setDeliveryAddressActiveAction(customerId, addressId, !isActive)
    if (!result.success) setError(result.error)
    else router.refresh()
  })
  async function remove() {
    const result = await deleteDeliveryAddressAction(customerId, addressId)
    if (!result.success) { setError(result.error); return }
    router.refresh()
  }
  return <div className="mt-3 flex flex-wrap items-center gap-2">
    {canSetDefault && <button type="button" disabled={pending} onClick={() => run('default')} className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs">Als Standard</button>}
    {canUpdate && <button type="button" disabled={pending} onClick={() => run('active')} className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs">{isActive ? 'Deaktivieren' : 'Aktivieren'}</button>}
    {canDelete && (
      <ConfirmDialog
        title="Lieferadresse entfernen?"
        description="Die Lieferadresse wird von diesem Kunden entfernt. Die zentrale Adresse bleibt erhalten."
        confirmLabel="Entfernen"
        danger
        onConfirm={remove}
        trigger={<button type="button" className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700">Entfernen</button>}
      />
    )}
    {error && <span className="text-xs text-red-700">{error}</span>}
  </div>
}
