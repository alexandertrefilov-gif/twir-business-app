'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteBillingAddressAction, setDefaultBillingAddressAction } from '@/app/(dashboard)/customers/[id]/billing-addresses/actions'

export function CustomerBillingAddressActions({ customerId, addressId, canDelete, canSetDefault }: { customerId:string; addressId:string; canDelete:boolean; canSetDefault:boolean }) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const run = (kind: 'default'|'delete') => startTransition(async () => {
    if (kind === 'delete' && !window.confirm('Rechnungsadresse von diesem Kunden entfernen? Die zentrale Adresse bleibt erhalten.')) return
    const result = kind === 'delete' ? await deleteBillingAddressAction(customerId, addressId) : await setDefaultBillingAddressAction(customerId, addressId)
    if (!result.success) setError(result.error)
    else router.refresh()
  })
  return <div className="mt-3 flex flex-wrap items-center gap-2">
    {canSetDefault && <button disabled={pending} onClick={() => run('default')} className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs">Als Standard</button>}
    {canDelete && <button disabled={pending} onClick={() => run('delete')} className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700">Entfernen</button>}
    {error && <span className="text-xs text-red-700">{error}</span>}
  </div>
}
