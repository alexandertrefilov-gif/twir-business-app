'use client'
// components/orders/OrderForm.tsx

import { useActionState, useMemo, useState } from 'react'
import { useRouter }   from 'next/navigation'
import { FormSubmitButton } from '@/components/shared/FormSubmitButton'
import type { ActionState } from '@/app/(dashboard)/orders/actions'

interface CustomerOption { id: string; name: string; number: string }

interface ItemRow {
  _key:        string
  description: string
  quantity:    string
  unit:        string
  unitPrice:   string
  taxRate:     string
}

interface OrderFormProps {
  mode:      'create' | 'edit'
  customers: CustomerOption[]
  defaults?: Partial<{
    customerId:  string
    title:       string
    description: string
    orderDate:   string
    startDate:   string
    endDate:     string
    items:       ItemRow[]
  }>
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  /** When created from an offer, customer is fixed */
  lockCustomer?: boolean
}

const UNITS    = ['Stk.', 'Std.', 'Psch.', 'kg', 't', 'm', 'm²', 'm³', 'l', 'km']
const TAX_OPTS = [{ value: '19', label: '19 %' }, { value: '7', label: '7 %' }, { value: '0', label: '0 %' }]

function newRow(): ItemRow {
  return { _key: crypto.randomUUID(), description: '', quantity: '1', unit: 'Stk.', unitPrice: '', taxRate: '19' }
}
const todayStr = () => new Date().toISOString().slice(0, 10)
const INIT: ActionState = {}

export function OrderForm({ mode, customers, defaults = {}, action, lockCustomer }: OrderFormProps) {
  const [state, formAction] = useActionState(action, INIT)
  const router    = useRouter()
  const [items, setItems] = useState<ItemRow[]>(defaults.items ?? [])
  const [showItems, setShowItems] = useState((defaults.items?.length ?? 0) > 0)

  const computed = useMemo(() => items.map((r) => {
    const net = Math.round((parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0) * 100) / 100
    return { ...r, net }
  }), [items])

  const totalNet = computed.reduce((s, i) => s + i.net, 0)

  function upd(key: string, field: keyof ItemRow, val: string) {
    setItems((p) => p.map((r) => r._key === key ? { ...r, [field]: val } : r))
  }

  const serialized = JSON.stringify(
    showItems ? items.map((r, i) => ({
      position:    i + 1,
      description: r.description,
      quantity:    parseFloat(r.quantity)  || 0,
      unit:        r.unit,
      unitPrice:   parseFloat(r.unitPrice) || 0,
      taxRate:     parseFloat(r.taxRate)   || 0,
    })) : [],
  )

  const fe = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="itemsJson" value={serialized} />

      {state.error && (
        <div className="flex items-start gap-2 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
          <ErrIcon />
          {state.error}
        </div>
      )}

      {/* ── Stammdaten ── */}
      <div className="form-section">
        <h2 className="form-section-title">Auftragsdaten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Kunde */}
          <div className="sm:col-span-2">
            <label className="field-label field-required" htmlFor="customerId">Kunde</label>
            {lockCustomer ? (
              <>
                <input type="hidden" name="customerId" value={defaults.customerId} />
                <div className="h-9 px-3 rounded-md border border-stone-200 bg-stone-50 text-sm flex items-center text-muted-foreground">
                  {customers.find((c) => c.id === defaults.customerId)?.name ?? defaults.customerId}
                  <span className="ml-2 text-xs text-stone-400">(aus Angebot übernommen)</span>
                </div>
              </>
            ) : (
              <select id="customerId" name="customerId" required defaultValue={defaults.customerId ?? ''}
                className={`w-full h-9 px-2.5 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${fe.customerId ? 'border-red-400' : 'border-stone-200'}`}>
                <option value="">— Kunde auswählen —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.number} · {c.name}</option>)}
              </select>
            )}
            {fe.customerId && <p className="field-error">{fe.customerId[0]}</p>}
          </div>

          {/* Bezeichnung */}
          <div className="sm:col-span-2">
            <label className="field-label field-required" htmlFor="title">Auftragsbezeichnung</label>
            <input id="title" name="title" type="text" required
              defaultValue={defaults.title ?? ''}
              placeholder="z.B. Wartung Anlage B2 – Quartal 3"
              className={`w-full h-9 px-3 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${fe.title ? 'border-red-400' : 'border-stone-200'}`} />
            {fe.title && <p className="field-error">{fe.title[0]}</p>}
          </div>

          {/* Dates */}
          <F label="Auftragsdatum" name="orderDate" type="date" required
            defaultValue={defaults.orderDate ?? todayStr()} error={fe.orderDate?.[0]} />
          <div /> {/* spacer */}
          <F label="Startdatum"    name="startDate"  type="date"
            defaultValue={defaults.startDate ?? ''} error={fe.startDate?.[0]} hint="Optional" />
          <F label="Enddatum"      name="endDate"    type="date"
            defaultValue={defaults.endDate ?? ''}   error={fe.endDate?.[0]}   hint="Optional" />
        </div>
      </div>

      {/* ── Beschreibung ── */}
      <div className="form-section">
        <h2 className="form-section-title">Beschreibung</h2>
        <textarea name="description" rows={3}
          defaultValue={defaults.description ?? ''}
          placeholder="Interne Beschreibung des Auftragsumfangs …"
          className="w-full px-3 py-2 rounded-md border border-stone-200 bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none" />
      </div>

      {/* ── Optional line items ── */}
      <div className="form-section">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
          <div>
            <h2 className="text-sm font-600 text-foreground">Positionen</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Optional — werden aus dem Angebot übernommen oder hier manuell erfasst</p>
          </div>
          <button type="button" onClick={() => { setShowItems((v) => !v); if (!showItems) setItems([newRow()]) }}
            className="text-xs text-blue-700 hover:underline">
            {showItems ? 'Ausblenden' : 'Positionen hinzufügen'}
          </button>
        </div>

        {showItems && (
          <>
            <div className="hidden md:grid grid-cols-[2fr_80px_90px_100px_70px_90px_32px] gap-2 px-1 mb-1">
              {['Beschreibung *', 'Menge', 'Einheit', 'Einzelpreis', 'MwSt.', 'Netto', ''].map((h) => (
                <span key={h} className="text-[10px] font-600 uppercase tracking-wider text-muted-foreground">{h}</span>
              ))}
            </div>
            <div className="space-y-2">
              {computed.map((item, idx) => (
                <div key={item._key} className="grid grid-cols-1 md:grid-cols-[2fr_80px_90px_100px_70px_90px_32px] gap-2 items-center p-3 md:p-0 rounded md:rounded-none bg-stone-50 md:bg-transparent border border-stone-100 md:border-none">
                  <input type="text" value={item.description} onChange={(e) => upd(item._key, 'description', e.target.value)}
                    placeholder="Leistung …"
                    className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                  <input type="number" value={item.quantity} onChange={(e) => upd(item._key, 'quantity', e.target.value)}
                    min="0.001" step="0.001"
                    className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm text-right mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                  <select value={item.unit} onChange={(e) => upd(item._key, 'unit', e.target.value)}
                    className="w-full h-9 px-2 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent">
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                  <div className="relative">
                    <input type="number" value={item.unitPrice} onChange={(e) => upd(item._key, 'unitPrice', e.target.value)}
                      min="0" step="0.01" placeholder="0,00"
                      className="w-full h-9 pl-3 pr-6 rounded-md border border-stone-200 bg-white text-sm text-right mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
                  </div>
                  <select value={item.taxRate} onChange={(e) => upd(item._key, 'taxRate', e.target.value)}
                    className="w-full h-9 px-2 rounded-md border border-stone-200 bg-white text-sm mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent">
                    {TAX_OPTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <div className="h-9 px-3 rounded-md bg-stone-50 border border-stone-100 flex items-center justify-end">
                    <span className="text-sm mono">{item.net.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <button type="button" onClick={() => setItems((p) => p.filter((r) => r._key !== item._key))}
                    disabled={items.length <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded text-stone-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-stone-100">
              <button type="button" onClick={() => setItems((p) => [...p, newRow()])}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded border border-blue-200 bg-blue-50 text-blue-700 text-xs font-500 hover:bg-blue-100 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                Zeile hinzufügen
              </button>
              <span className="text-sm mono font-500">
                Netto: {totalNet.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <button type="button" onClick={() => router.back()}
          className="h-9 px-4 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors">
          Abbrechen
        </button>
        <FormSubmitButton
          idleLabel={mode === 'create' ? 'Auftrag anlegen' : 'Änderungen speichern'}
          pendingLabel={mode === 'create' ? 'Wird angelegt…' : 'Wird gespeichert…'}
          className="h-9 px-5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-sm font-500 disabled:opacity-50 transition-colors"
        />
      </div>
    </form>
  )
}

function F({ label, name, type = 'text', required, defaultValue, error, hint }: {
  label: string; name: string; type?: string; required?: boolean
  defaultValue?: string; error?: string; hint?: string
}) {
  return (
    <div>
      <label className={`field-label ${required ? 'field-required' : ''}`} htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue ?? ''}
        className={`w-full h-9 px-3 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${error ? 'border-red-400' : 'border-stone-200'}`} />
      {error && <p className="field-error">{error}</p>}
      {hint && !error && <p className="field-hint">{hint}</p>}
    </div>
  )
}

function ErrIcon() {
  return <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/></svg>
}
