'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { assignCustomerAddressAction, createCustomerAddressAction, searchCustomerAddressesAction, type AddressResult } from '@/app/(dashboard)/customers/[id]/addresses/actions'

export function CustomerAddressPicker({ customerId, type }: { customerId: string; type: 'BILLING' | 'SHIPPING' }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [query, setQuery] = useState('')
  const [label, setLabel] = useState(type === 'BILLING' ? 'Rechnungsstelle' : 'Lieferstelle')
  const [results, setResults] = useState<AddressResult[]>([])
  const [duplicate, setDuplicate] = useState<AddressResult>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const close = () => { setOpen(false); setError(undefined); setDuplicate(undefined) }
  const assign = (addressId: string) => startTransition(async () => {
    const result = await assignCustomerAddressAction(customerId, addressId, type, label)
    if (!result.success) return setError(result.error)
    close(); router.refresh()
  })
  const search = () => startTransition(async () => {
    const result = await searchCustomerAddressesAction(query)
    setResults(result.results ?? []); setError(result.error)
  })
  const create = (formData: FormData) => startTransition(async () => {
    const result = await createCustomerAddressAction(customerId, type, formData)
    setDuplicate(result.duplicate); setError(result.error)
    if (result.success) { close(); router.refresh() }
  })

  return <Dialog.Root open={open} onOpenChange={next => next ? setOpen(true) : close()}>
    <Dialog.Trigger asChild><button type="button" className="rounded-md bg-blue-700 px-3 py-2 text-sm text-white">Adresse hinzufügen</button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4"><Dialog.Title className="text-lg font-600">{type === 'BILLING' ? 'Rechnungsadresse' : 'Lieferadresse'} hinzufügen</Dialog.Title><Dialog.Close asChild><button type="button" aria-label="Dialog schließen" className="h-8 w-8 rounded text-xl text-stone-500 hover:bg-stone-100">×</button></Dialog.Close></div>
        <div className="mt-4 flex border-b border-stone-200" role="tablist">
          <Tab active={mode === 'existing'} onClick={() => setMode('existing')}>Bestehende Adresse</Tab>
          <Tab active={mode === 'new'} onClick={() => setMode('new')}>Neue Adresse</Tab>
        </div>
        {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        {mode === 'existing' ? <div className="mt-4 space-y-4">
          <div><label htmlFor={`address-search-${type}`} className="field-label">Firma, Straße, PLZ oder Ort suchen …</label><div className="flex gap-2"><input id={`address-search-${type}`} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') search() }} className="h-9 min-w-0 flex-1 rounded-md border border-stone-200 px-3 text-sm" /><button type="button" disabled={pending || query.trim().length < 2} onClick={search} className="h-9 rounded-md border border-stone-200 px-4 text-sm disabled:opacity-50">Suchen</button></div></div>
          <div><label htmlFor={`assignment-label-${type}`} className="field-label">Bezeichnung beim Kunden</label><input id={`assignment-label-${type}`} value={label} onChange={event => setLabel(event.target.value)} className="h-9 w-full rounded-md border border-stone-200 px-3 text-sm" /></div>
          <div className="space-y-2">{results.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Treffer.</p> : results.map(address => <AddressChoice key={address.id} address={address} pending={pending} onSelect={() => assign(address.id)} />)}</div>
        </div> : <form action={create} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="label" label="Bezeichnung" required defaultValue={label} /><Field name="companyName" label="Firma / Name" required />
            <Field name="additional" label="Zusatz / Abteilung" /><Field name="contactName" label="Ansprechpartner" />
            <Field name="street" label="Straße" required /><Field name="houseNumber" label="Hausnummer" />
            <Field name="postalCode" label="PLZ" required /><Field name="city" label="Ort" required />
            <Field name="country" label="Land (ISO)" required defaultValue="DE" /><Field name="email" label="E-Mail" type="email" />
            <Field name="phone" label="Telefon" type="tel" />
          </div>
          {duplicate && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"><p className="font-600">Wahrscheinlich bereits vorhanden</p><p>{duplicate.companyName} · {duplicate.street} {duplicate.houseNumber} · {duplicate.postalCode} {duplicate.city}</p><button type="button" disabled={pending} onClick={() => assign(duplicate.id)} className="mt-2 rounded-md border border-amber-400 bg-white px-3 py-1.5">Bestehende verwenden</button></div>}
          <div className="flex justify-end gap-2"><button type="button" onClick={close} className="h-9 rounded-md border border-stone-200 px-4 text-sm">Abbrechen</button><button disabled={pending} className="h-9 rounded-md bg-blue-700 px-4 text-sm text-white disabled:opacity-50">Adresse anlegen</button></div>
        </form>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`px-4 py-2 text-sm ${active ? 'border-b-2 border-blue-700 font-600 text-blue-700' : 'text-muted-foreground'}`}>{children}</button> }
function Field({ name, label, required, defaultValue, type = 'text' }: { name: string; label: string; required?: boolean; defaultValue?: string; type?: string }) { return <div><label htmlFor={`new-${name}`} className={`field-label${required ? ' field-required' : ''}`}>{label}</label><input id={`new-${name}`} name={name} type={type} required={required} defaultValue={defaultValue} className="h-9 w-full rounded-md border border-stone-200 px-3 text-sm" /></div> }
function AddressChoice({ address, pending, onSelect }: { address: AddressResult; pending: boolean; onSelect: () => void }) { return <div className="flex flex-col justify-between gap-3 rounded-md border border-stone-200 p-3 sm:flex-row sm:items-center"><div><p className="text-sm font-600">{address.companyName}</p><p className="text-sm text-muted-foreground">{address.street} {address.houseNumber}<br />{address.postalCode} {address.city} · {address.country}</p>{address.usedBy?.length ? <p className="mt-1 text-xs text-muted-foreground">Verwendet bei: {address.usedBy.join(', ')}</p> : null}</div><button type="button" disabled={pending} onClick={onSelect} className="rounded-md border border-blue-200 px-3 py-1.5 text-sm text-blue-700 disabled:opacity-50">Auswählen</button></div> }
