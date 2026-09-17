'use client'
// components/settings/SettingsForm.tsx

import { useActionState, useState, useTransition } from 'react'
import type { ActionState } from '@/app/(dashboard)/settings/actions'
import {
  testDocumentArchiveAction,
  updateLogoScaleAction,
  updateSettingsAction,
} from '@/app/(dashboard)/settings/actions'
import { FormSubmitButton } from '@/components/shared/FormSubmitButton'

interface SequenceStatus {
  type:       string
  year:       number
  prefix:     string
  lastNumber: number
}

interface SettingsFormProps {
  defaults:  Record<string, string | number>
  sequences: SequenceStatus[]
}

const INIT: ActionState = {}

export function SettingsForm({ defaults, sequences }: SettingsFormProps) {
  const [state, formAction] = useActionState(updateSettingsAction, INIT)
  const [isSavingLogoScale, startLogoScaleTransition] = useTransition()
  const [logoScaleMessage, setLogoScaleMessage] = useState('')
  const [logoScale, setLogoScale] = useState(() => {
    const initial = Number(defaults.logoScale ?? 140)
    return Math.min(400, Math.max(50, initial))
  })
  const [archiveMessage, setArchiveMessage] = useState('')
  const [archivePath, setArchivePath] = useState(() => String(defaults.documentArchivePath ?? ''))
  const fe = state.fieldErrors ?? {}
  const v  = (key: string) => String(defaults[key] ?? '')

  function changeLogoScale(delta: number) {
    const previous = logoScale
    const next = Math.min(400, Math.max(50, previous + delta))
    if (next === previous) return
    setLogoScale(next)
    setLogoScaleMessage('Wird gespeichert …')
    startLogoScaleTransition(async () => {
      const result = await updateLogoScaleAction(next)
      if (result.success) {
        setLogoScaleMessage('Gespeichert – neue PDF-Vorschau öffnen')
      } else {
        setLogoScale(previous)
        setLogoScaleMessage(result.error ?? 'Speichern fehlgeschlagen')
      }
    })
  }

  return (
    <form action={formAction} className="space-y-4">

      {state.success && (
        <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd"/></svg>
          Einstellungen gespeichert.
        </div>
      )}
      {state.error && !state.fieldErrors && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{state.error}</div>
      )}

      {/* ── 1. Firmendaten ── */}
      <Section title="Firmendaten" hint="Erscheinen auf allen PDF-Dokumenten">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-full">
            <label className="field-label" htmlFor="companyLogo">Firmenlogo für PDF-Kopfzeile</label>
            <input
              id="companyLogo"
              name="companyLogo"
              type="file"
              accept="image/png,image/jpeg"
              className="block w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-xs file:font-600 file:text-blue-700"
            />
            <p className="field-hint">
              PNG oder JPEG, maximal 2 MB. Das Logo erscheint rechts oben im Angebot.
              {v('logoPath') ? ' Aktuell ist ein Logo hinterlegt.' : ''}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <input type="hidden" name="logoScale" value={logoScale} />
              <button
                type="button"
                onClick={() => changeLogoScale(-10)}
                disabled={logoScale <= 50 || isSavingLogoScale}
                aria-label="Logo verkleinern"
                className="h-9 w-9 rounded-md border border-stone-200 bg-white text-lg font-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                −
              </button>
              <div className="min-w-28 text-center">
                <p className="text-sm font-600 text-foreground">{logoScale} %</p>
                <p className="text-[11px] text-muted-foreground">Logo-Größe</p>
              </div>
              <button
                type="button"
                onClick={() => changeLogoScale(10)}
                disabled={logoScale >= 400 || isSavingLogoScale}
                aria-label="Logo vergrößern"
                className="h-9 w-9 rounded-md border border-blue-200 bg-blue-50 text-lg font-600 text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ＋
              </button>
              {logoScaleMessage && (
                <p className="text-xs text-muted-foreground" role="status">{logoScaleMessage}</p>
              )}
            </div>
          </div>
          <F label="Firmenname" name="companyName" required defaultValue={v('companyName')} error={fe.companyName?.[0]} />
          <F label="Rechtsform" name="legalForm"   defaultValue={v('legalForm')} placeholder="GmbH, AG, e.K., …" />
          <F
            label="Art der Tätigkeit"
            name="businessActivity"
            defaultValue={v('businessActivity')}
            placeholder="z. B. Fachbauleitung, Fremdfirmenkoordination"
            error={fe.businessActivity?.[0]}
            span
          />
          <F label="Geschäftsführer / Vorstand" name="managingDirector" defaultValue={v('managingDirector')} span />
          <div className="col-span-full grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <F label="Straße" name="street" defaultValue={v('street')} />
            </div>
            <F label="Hausnummer" name="houseNumber" defaultValue={v('houseNumber')} />
          </div>
          <F label="PLZ" name="postalCode" defaultValue={v('postalCode')} />
          <F label="Ort"  name="city"       defaultValue={v('city')} />
          <F label="E-Mail" name="email" type="email" defaultValue={v('email')} error={fe.email?.[0]} />
          <F label="Telefon" name="phone" type="tel" defaultValue={v('phone')} />
          <F label="Website" name="website" defaultValue={v('website')} />
          <F label="Fax" name="fax" defaultValue={v('fax')} />
        </div>
      </Section>

      {/* ── 2. Handelsregister ── */}
      <Section title="Handelsregister / Rechtliches">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <F label="Amtsgericht (Registergericht)" name="registerCourt"  defaultValue={v('registerCourt')} />
          <F label="HRB-Nummer" name="registerNumber" defaultValue={v('registerNumber')} />
          <F
            label="Lieferantennummer (LN-Nr.)"
            name="supplierNumber"
            defaultValue={v('supplierNumber')}
            placeholder="z. B. 18045419"
          />
        </div>
      </Section>

      {/* ── 3. Steuer ── */}
      <Section title="Steuerdaten" hint="Pflichtangaben nach §14 UStG">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <F label="USt-IdNr." name="vatId" defaultValue={v('vatId')} error={fe.vatId?.[0]}
            placeholder="DE123456789" hint="Format: DE + 9 Ziffern" />
          <F label="Steuernummer" name="taxNumber" defaultValue={v('taxNumber')} placeholder="12/345/67890" />
          <F label="Finanzamt" name="taxOffice" defaultValue={v('taxOffice')} />
          <div>
            <label className="field-label field-required" htmlFor="defaultTaxRate">Standard-Steuersatz (%)</label>
            <select id="defaultTaxRate" name="defaultTaxRate"
              defaultValue={v('defaultTaxRate')}
              className="w-full h-9 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent">
              <option value="19">19 % (Regelsteuersatz)</option>
              <option value="7">7 % (ermäßigter Steuersatz)</option>
              <option value="0">0 % (steuerfrei)</option>
            </select>
          </div>
        </div>
      </Section>

      {/* ── 4. Bankdaten ── */}
      <Section title="Bankverbindung" hint="Erscheint auf Rechnungen und Mahnungen">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <F label="Kreditinstitut" name="bankName" defaultValue={v('bankName')} />
          <div /> {/* spacer */}
          <F label="IBAN" name="iban" defaultValue={v('iban')} error={fe.iban?.[0]}
            placeholder="DE12 3456 7890 1234 5678 90" />
          <F label="BIC / SWIFT" name="bic" defaultValue={v('bic')} placeholder="XXXXXXXX" />
        </div>
      </Section>

      {/* ── 5. Nummernkreise & Defaults ── */}
      <Section title="Nummernkreise & Rechnungsstandards">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <F label="Rechnungs-Präfix" name="invoicePrefix"        defaultValue={v('invoicePrefix')} />
          <F label="Angebots-Präfix"  name="offerPrefix"          defaultValue={v('offerPrefix')} />
          <F label="Auftrags-Präfix"  name="orderPrefix"          defaultValue={v('orderPrefix')} />
          <F label="Leistungs-Präfix" name="serviceReportPrefix"  defaultValue={v('serviceReportPrefix')} />
        </div>

        {/* Current sequence counters (read-only) */}
        {sequences.length > 0 && (
          <div className="mb-4 p-3 rounded-md bg-stone-50 border border-stone-200">
            <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-2">
              Aktuelle Zähler ({new Date().getFullYear()})
            </p>
            <div className="flex gap-6 flex-wrap">
              {sequences.map((s) => (
                <div key={s.type} className="text-xs">
                  <span className="text-muted-foreground">{s.type}: </span>
                  <span className="mono font-500">{s.lastNumber.toLocaleString('de-DE')} vergeben</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label field-required" htmlFor="defaultPaymentTermDays">
              Standard-Zahlungsziel (Tage)
            </label>
            <input id="defaultPaymentTermDays" name="defaultPaymentTermDays"
              type="number" min="0" max="365" required
              defaultValue={v('defaultPaymentTermDays')}
              className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm mono text-right focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
          </div>
        </div>

        {/* Default texts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <TextArea label="Standard-Einleitungstext Rechnung" name="defaultInvoiceIntro" defaultValue={v('defaultInvoiceIntro')} />
          <TextArea label="Standard-Schlusstext Rechnung"     name="defaultInvoiceOutro" defaultValue={v('defaultInvoiceOutro')} />
          <TextArea label="Standard-Einleitungstext Angebot"  name="defaultOfferIntro"   defaultValue={v('defaultOfferIntro')} />
          <TextArea label="Standard-Schlusstext Angebot"      name="defaultOfferOutro"   defaultValue={v('defaultOfferOutro')} />
        </div>
      </Section>

      <Section title="Dokumentenarchiv" hint="PDF- und Word-Notfallkopien auf dem Server-Dateisystem">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="documentArchiveEnabled" defaultChecked={v('documentArchiveEnabled') === 'true'} />
            Archivierung aktiv
          </label>
          <div>
            <label className="field-label" htmlFor="documentArchivePath">Basispfad</label>
            <input id="documentArchivePath" name="documentArchivePath" value={archivePath} onChange={(event) => setArchivePath(event.target.value)} placeholder="/Users/…/TWIR_Dokumente" className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm font-mono" />
            <p className="field-hint">Der Pfad gehört zum Rechner, auf dem der Next.js-Server läuft. Lokale OneDrive-Sync-Ordner werden unterstützt.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="documentArchiveJsonEnabled" defaultChecked={v('documentArchiveJsonEnabled') === 'true'} />
            Zusätzlich minimale JSON-Metadaten archivieren
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="h-9 px-3 rounded-md border border-stone-200 bg-white text-sm" onClick={() => startLogoScaleTransition(async () => { const result = await testDocumentArchiveAction(archivePath, false); setArchiveMessage(result.success ? 'Speicherort erreichbar.' : result.error ?? 'Prüfung fehlgeschlagen.') })}>Speicherort prüfen</button>
            <button type="button" className="h-9 px-3 rounded-md border border-stone-200 bg-white text-sm" onClick={() => startLogoScaleTransition(async () => { const result = await testDocumentArchiveAction(archivePath, true); setArchiveMessage(result.success ? 'Testdatei erfolgreich erstellt und entfernt.' : result.error ?? 'Test fehlgeschlagen.') })}>Testdatei erstellen</button>
            {archiveMessage && <span className="text-xs text-muted-foreground" role="status">{archiveMessage}</span>}
          </div>
        </div>
      </Section>

      {/* ── Actions ── */}
      <div className="flex justify-end pb-6">
        <FormSubmitButton
          idleLabel="Einstellungen speichern"
          pendingLabel="Wird gespeichert…"
          className="h-9 px-6 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-sm font-500 disabled:opacity-50 transition-colors"
        />
      </div>

    </form>
  )
}

// ── Primitives ────────────────────────────────────────────────

function Section({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="form-section">
      <div className="form-section-title flex items-baseline gap-2">
        {title}
        {hint && <span className="text-xs font-400 text-muted-foreground normal-case tracking-normal">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function F({ label, name, type = 'text', required, defaultValue, error, hint, placeholder, span }: {
  label: string; name: string; type?: string; required?: boolean
  defaultValue?: string; error?: string; hint?: string; placeholder?: string; span?: boolean
}) {
  return (
    <div className={span ? 'col-span-full' : ''}>
      <label className={`field-label ${required ? 'field-required' : ''}`} htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required}
        defaultValue={defaultValue ?? ''} placeholder={placeholder ?? ''}
        className={`w-full h-9 px-3 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${error ? 'border-red-400' : 'border-stone-200'}`} />
      {error && <p className="field-error">{error}</p>}
      {hint && !error && <p className="field-hint">{hint}</p>}
    </div>
  )
}

function TextArea({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <div>
      <label className="field-label" htmlFor={name}>{label}</label>
      <textarea id={name} name={name} rows={3} defaultValue={defaultValue ?? ''}
        className="w-full px-3 py-2 rounded-md border border-stone-200 bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none" />
    </div>
  )
}
