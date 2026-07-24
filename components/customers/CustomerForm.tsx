'use client'
// components/customers/CustomerForm.tsx

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { FormSubmitButton } from '@/components/shared/FormSubmitButton'
import type { ActionState } from '@/app/(dashboard)/customers/actions'

interface CustomerFormProps {
  mode:     'create' | 'edit'
  customerId?: string
  defaults?: Partial<{
    name:        string
    legalName:   string
    legalForm:   string
    vatId:       string
    taxNumber:   string
    street:      string
    houseNumber: string
    postalCode:  string
    city:        string
    country:     string
    email:       string
    phone:       string
    fax:         string
    website:     string
    notes:       string
  }>
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>
}

const INITIAL_STATE: ActionState = {}

export function CustomerForm({ mode, customerId, defaults = {}, action }: CustomerFormProps) {
  const [state, formAction] = useActionState(action, INITIAL_STATE)
  const router = useRouter()

  function err(field: string) {
    return state.fieldErrors?.[field]?.[0]
  }

  return (
    <form action={formAction} className="space-y-4">

      {/* Global error */}
      {state.error && !state.fieldErrors && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
          </svg>
          {state.error}
        </div>
      )}

      {/* ── Stammdaten ── */}
      <div className="form-section">
        <h2 className="form-section-title">Stammdaten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <Field label="Kurzname / Anzeigename" name="name" required
            defaultValue={defaults.name} error={err('name')}
            placeholder="z.B. Mustermann GmbH"
          />
          <Field label="Vollständiger Firmenname" name="legalName"
            defaultValue={defaults.legalName} error={err('legalName')}
            placeholder="Mustermann Bau Gesellschaft mit beschränkter Haftung"
            hint="Erscheint auf Rechnungen (§14 UStG)"
          />
          <Field label="Rechtsform" name="legalForm"
            defaultValue={defaults.legalForm} error={err('legalForm')}
            placeholder="GmbH, AG, e.K., GbR, …"
          />

        </div>
      </div>

      {/* ── Steuer ── */}
      <div className="form-section">
        <h2 className="form-section-title">Steuerinformationen</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <Field label="USt-IdNr." name="vatId"
            defaultValue={defaults.vatId} error={err('vatId')}
            placeholder="DE123456789"
            hint="Format: DE gefolgt von 9 Ziffern"
          />
          <Field label="Steuernummer" name="taxNumber"
            defaultValue={defaults.taxNumber} error={err('taxNumber')}
            placeholder="12/345/67890"
          />

        </div>
      </div>

      {/* ── Adresse ── */}
      <div className="form-section">
        <h2 className="form-section-title">Adresse</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="sm:col-span-2 grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label="Straße" name="street"
                defaultValue={defaults.street} error={err('street')}
                placeholder="Hauptstraße"
              />
            </div>
            <Field label="Hausnummer" name="houseNumber"
              defaultValue={defaults.houseNumber} error={err('houseNumber')}
              placeholder="12a"
            />
          </div>

          <Field label="PLZ" name="postalCode"
            defaultValue={defaults.postalCode} error={err('postalCode')}
            placeholder="70000"
          />
          <Field label="Ort" name="city"
            defaultValue={defaults.city} error={err('city')}
            placeholder="Stuttgart"
          />

          <div>
            <label className="field-label" htmlFor="country">Land</label>
            <select
              id="country"
              name="country"
              defaultValue={defaults.country ?? 'DE'}
              className="w-full h-9 px-2.5 rounded-md border border-stone-200 bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="DE">Deutschland</option>
              <option value="AT">Österreich</option>
              <option value="CH">Schweiz</option>
              <option value="LU">Luxemburg</option>
            </select>
          </div>

        </div>
      </div>

      {/* ── Kontakt ── */}
      <div className="form-section">
        <h2 className="form-section-title">Kontaktdaten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <Field label="E-Mail" name="email" type="email"
            defaultValue={defaults.email} error={err('email')}
            placeholder="kontakt@unternehmen.de"
          />
          <Field label="Telefon" name="phone" type="tel"
            defaultValue={defaults.phone} error={err('phone')}
            placeholder="+49 711 123456"
          />
          <Field label="Fax" name="fax" type="tel"
            defaultValue={defaults.fax} error={err('fax')}
            placeholder="+49 711 123456-99"
          />
          <Field label="Website" name="website" type="url"
            defaultValue={defaults.website} error={err('website')}
            placeholder="https://www.unternehmen.de"
          />

        </div>
      </div>

      {/* ── Notizen ── */}
      <div className="form-section">
        <h2 className="form-section-title">Interne Notizen</h2>
        <div>
          <label className="field-label" htmlFor="notes">Notizen</label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={defaults.notes ?? ''}
            className="w-full px-3 py-2 rounded-md border border-stone-200 bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none"
            placeholder="Interne Hinweise zum Kunden …"
          />
          <p className="field-hint">Nicht auf Dokumenten sichtbar.</p>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-9 px-4 rounded-md border border-stone-200 bg-white text-sm font-500 text-foreground hover:bg-stone-50 transition-colors"
        >
          Abbrechen
        </button>
        <FormSubmitButton
          idleLabel={mode === 'create' ? 'Kunde anlegen' : 'Änderungen speichern'}
          pendingLabel={mode === 'create' ? 'Wird angelegt…' : 'Wird gespeichert…'}
          className="h-9 px-4 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-sm font-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        />
      </div>

    </form>
  )
}

// ── Field helper ─────────────────────────────────────────────

interface FieldProps {
  label:        string
  name:         string
  type?:        string
  required?:    boolean
  defaultValue?: string | null
  error?:       string
  placeholder?: string
  hint?:        string
}

function Field({ label, name, type = 'text', required, defaultValue, error, placeholder, hint }: FieldProps) {
  return (
    <div>
      <label className={`field-label ${required ? 'field-required' : ''}`} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
        className={`
          w-full h-9 px-3 rounded-md border bg-white text-sm text-foreground
          placeholder:text-muted-foreground
          focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent
          transition
          ${error ? 'border-red-400 bg-red-50/30' : 'border-stone-200'}
        `}
      />
      {error && <p className="field-error">{error}</p>}
      {hint && !error && <p className="field-hint">{hint}</p>}
    </div>
  )
}
