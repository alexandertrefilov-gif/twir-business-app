'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteDeliveryAddressAction,
  setDefaultDeliveryAddressAction,
  setDeliveryAddressActiveAction,
} from '@/app/(dashboard)/customers/[id]/delivery-addresses/actions'

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
  const run = (kind: 'default'|'active'|'delete') => startTransition(async () => {
    if (kind === 'delete' && !window.confirm('Lieferadresse von diesem Kunden entfernen? Die zentrale Adresse bleibt erhalten.')) return
    const result = kind === 'delete'
      ? await deleteDeliveryAddressAction(customerId, addressId)
      : kind === 'default'
        ? await setDefaultDeliveryAddressAction(customerId, addressId)
        : await setDeliveryAddressActiveAction(customerId, addressId, !isActive)
    if (!result.success) setError(result.error)
    else router.refresh()
  })
  return <div className="mt-3 flex flex-wrap items-center gap-2">
    {canSetDefault && <button type="button" disabled={pending} onClick={() => run('default')} className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs">Als Standard</button>}
    {canUpdate && <button type="button" disabled={pending} onClick={() => run('active')} className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs">{isActive ? 'Deaktivieren' : 'Aktivieren'}</button>}
    {canDelete && <button type="button" disabled={pending} onClick={() => run('delete')} className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700">Entfernen</button>}
    {error && <span className="text-xs text-red-700">{error}</span>}
  </div>
}
