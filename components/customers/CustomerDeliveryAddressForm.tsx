'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormSubmitButton } from '@/components/shared/FormSubmitButton'
import { SharedAddressNotice, type AddressCoUser } from '@/components/customers/SharedAddressNotice'
import type { DeliveryAddressActionState } from '@/app/(dashboard)/customers/[id]/delivery-addresses/actions'

type Defaults = Partial<Record<'label'|'companyName'|'additional'|'street'|'houseNumber'|'postalCode'|'city'|'country'|'contactName'|'email'|'phone', string>> & {
  isActive?: boolean
  isDefault?: boolean
}

export function CustomerDeliveryAddressForm({ action, defaults = {}, mode, sharedWith = [] }: {
  action: (state: DeliveryAddressActionState, data: FormData) => Promise<DeliveryAddressActionState>
  defaults?: Defaults
  mode: 'create' | 'edit'
  sharedWith?: AddressCoUser[]
}) {
  const [state, formAction] = useActionState(action, {})
  const [active, setActive] = useState(defaults.isActive ?? true)
  const router = useRouter()
  const error = (name: string) => state.fieldErrors?.[name]?.[0]
  return <form action={formAction} className="space-y-4">
    {state.error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
    <SharedAddressNotice sharedWith={sharedWith} />
    <div className="form-section">
      <h2 className="form-section-title">Lieferadresse</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field name="label" label="Bezeichnung" required value={defaults.label} error={error('label')} />
        <Field name="companyName" label="Firma / Name" required value={defaults.companyName} error={error('companyName')} />
        <Field name="additional" label="Zusatz / Abteilung" value={defaults.additional} error={error('additional')} />
        <Field name="contactName" label="Ansprechpartner" value={defaults.contactName} error={error('contactName')} />
        <div className="grid grid-cols-3 gap-4 sm:col-span-2">
          <div className="col-span-2"><Field name="street" label="Straße" required value={defaults.street} error={error('street')} /></div>
          <Field name="houseNumber" label="Hausnummer" value={defaults.houseNumber} error={error('houseNumber')} />
        </div>
        <Field name="postalCode" label="PLZ" required value={defaults.postalCode} error={error('postalCode')} />
        <Field name="city" label="Ort" required value={defaults.city} error={error('city')} />
        <Field name="country" label="Land (ISO)" required value={defaults.country ?? 'DE'} error={error('country')} />
        <Field name="email" label="E-Mail" type="email" value={defaults.email} error={error('email')} />
        <Field name="phone" label="Telefon" type="tel" value={defaults.phone} error={error('phone')} />
        <label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Für neue Dokumente auswählbar</label>
        <label className="flex items-center gap-2 text-sm"><input name="isDefault" type="checkbox" defaultChecked={defaults.isDefault} disabled={!active} /> Standard-Lieferadresse</label>
      </div>
    </div>
    <div className="flex justify-end gap-3">
      <button type="button" onClick={() => router.back()} className="h-9 rounded-md border border-stone-200 px-4 text-sm">Abbrechen</button>
      <FormSubmitButton idleLabel={mode === 'create' ? 'Adresse anlegen' : 'Änderungen speichern'} pendingLabel="Wird gespeichert…" className="h-9 rounded-md bg-blue-700 px-4 text-sm text-white" />
    </div>
  </form>
}

function Field({ name, label, required, value, error, type = 'text' }: { name:string; label:string; required?:boolean; value?:string; error?:string; type?:string }) {
  return <div><label htmlFor={name} className={`field-label${required ? ' field-required' : ''}`}>{label}</label><input id={name} name={name} type={type} required={required} defaultValue={value ?? ''} className={`h-9 w-full rounded-md border bg-white px-3 text-sm ${error ? 'border-red-400' : 'border-stone-200'}`} />{error && <p className="field-error">{error}</p>}</div>
}
