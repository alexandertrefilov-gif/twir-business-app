'use client'
// components/offers/OfferForm.tsx
// Komplexeste Komponente in Phase 4:
// - Dynamische Positionen mit Echtzeit-Berechnung
// - Tax-Breakdown (7% / 19% separat)
// - JSON-Serialisierung für Server Action
// - Kundenselektor

import { useActionState, useMemo, useState } from 'react'
import { useRouter }        from 'next/navigation'
import { FormSubmitButton } from '@/components/shared/FormSubmitButton'
import { RichTextSectionsEditor } from '@/components/offers/RichTextSectionsEditor'
import type { ActionState } from '@/app/(dashboard)/offers/actions'

// ── Types ─────────────────────────────────────────────────────

interface CustomerOption {
  id:   string
  name: string
  number: string
}

interface ItemRow {
  _key:        string   // local React key
  description: string
  quantity:    string
  unit:        string
  unitPrice:   string
  taxRate:     string
  notes:       string
}

interface OfferFormProps {
  mode:      'create' | 'edit'
  offerId?:  string
  customers: CustomerOption[]
  defaults?: {
    customerId?: string
    title?:      string
    introText?:  string
    outroText?:  string
    offerDate?:  string   // 'YYYY-MM-DD'
    validUntil?: string
    items?:      ItemRow[]
  }
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
}

// ── Constants ─────────────────────────────────────────────────

const UNITS    = ['Stk.', 'Std.', 'Psch.', 'kg', 't', 'm', 'm²', 'm³', 'l', 'km']
const TAX_OPTS = [{ value: '19', label: '19 %' }, { value: '7', label: '7 %' }, { value: '0', label: '0 %' }]

function newRow(): ItemRow {
  return {
    _key:        crypto.randomUUID(),
    description: '',
    quantity:    '1',
    unit:        'Stk.',
    unitPrice:   '',
    taxRate:     '19',
    notes:       '',
  }
}

const today30 = () => {
  const d = new Date(); d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}
const todayStr = () => new Date().toISOString().slice(0, 10)

// ── Component ─────────────────────────────────────────────────

const INIT: ActionState = {}

export function OfferForm({ mode, customers, defaults = {}, action }: OfferFormProps) {
  const [state, formAction] = useActionState(action, INIT)
  const router = useRouter()
  const [customerId, setCustomerId] = useState(defaults.customerId ?? '')

  const [items, setItems] = useState<ItemRow[]>(
    defaults.items?.length ? defaults.items : [newRow()],
  )

  // ── Computed totals ──────────────────────────────────────────
  const computed = useMemo(() => {
    return items.map((item) => {
      const qty   = parseFloat(item.quantity)  || 0
      const price = parseFloat(item.unitPrice) || 0
      const tax   = parseFloat(item.taxRate)   || 0
      const net   = Math.round(qty * price * 100)      / 100
      const taxA  = Math.round(net * tax / 100 * 100)  / 100
      const gross = Math.round((net + taxA) * 100)     / 100
      return { ...item, net, taxA, gross }
    })
  }, [items])

  const totals = useMemo(() => {
    const totalNet = computed.reduce((s, i) => s + i.net, 0)
    const groups: Record<string, number> = {}
    for (const i of computed) {
      const k = i.taxRate
      groups[k] = Math.round(((groups[k] ?? 0) + i.taxA) * 100) / 100
    }
    const totalTax = Object.values(groups).reduce((s, v) => s + v, 0)
    return {
      totalNet:   Math.round(totalNet * 100) / 100,
      taxGroups:  groups,
      totalTax:   Math.round(totalTax * 100) / 100,
      totalGross: Math.round((totalNet + totalTax) * 100) / 100,
    }
  }, [computed])

  // ── Item helpers ─────────────────────────────────────────────

  function updateItem(key: string, field: keyof ItemRow, value: string) {
    setItems((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)),
    )
  }

  function addRow() {
    setItems((prev) => [...prev, newRow()])
  }

  function removeRow(key: string) {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((r) => r._key !== key))
  }

  function moveRow(key: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx  = prev.findIndex((r) => r._key === key)
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  // ── Serialise items for server ───────────────────────────────
  const serializedItems = JSON.stringify(
    items.map((item, i) => ({
      position:    i + 1,
      description: item.description,
      quantity:    parseFloat(item.quantity)  || 0,
      unit:        item.unit,
      unitPrice:   parseFloat(item.unitPrice) || 0,
      taxRate:     parseFloat(item.taxRate)   || 0,
      notes:       item.notes || null,
    })),
  )

  const fe = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="offer-standard-font space-y-4">
      <input type="hidden" name="itemsJson" value={serializedItems} />

      {/* Global error */}
      {state.error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
          </svg>
          {state.error}
        </div>
      )}

      {/* ── Kopfdaten ── */}
      <div className="form-section">
        <h2 className="form-section-title">Angebotskopf</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Kunde */}
          <div className="sm:col-span-2">
            <label className="field-label field-required" htmlFor="customerId">Kunde</label>
            <select
              id="customerId"
              name="customerId"
              required
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className={`w-full h-9 px-2.5 rounded-md border bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent
                ${fe.customerId ? 'border-red-400' : 'border-stone-200'}`}
            >
              <option value="">— Kunde auswählen —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} · {c.name}
                </option>
              ))}
            </select>
            {fe.customerId && <p className="field-error">{fe.customerId[0]}</p>}
          </div>

          {/* Betreff */}
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="title">Betreff</label>
            <input
              id="title" name="title" type="text"
              defaultValue={defaults.title ?? ''}
              placeholder="z. B. Wartungspaket 2025"
              className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* Datum */}
          <div>
            <label className="field-label field-required" htmlFor="offerDate">Angebotsdatum</label>
            <input
              id="offerDate" name="offerDate" type="date" required
              defaultValue={defaults.offerDate ?? todayStr()}
              className={`w-full h-9 px-3 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent
                ${fe.offerDate ? 'border-red-400' : 'border-stone-200'}`}
            />
            {fe.offerDate && <p className="field-error">{fe.offerDate[0]}</p>}
          </div>

          {/* Gültig bis */}
          <div>
            <label className="field-label" htmlFor="validUntil">Gültig bis</label>
            <input
              id="validUntil" name="validUntil" type="date"
              defaultValue={defaults.validUntil ?? today30()}
              className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <p className="field-hint">Standard: 30 Tage ab Angebotsdatum</p>
          </div>

        </div>
      </div>

      {/* ── Aufgaben- und zusätzliche Angebotstexte ── */}
      <div className="form-section">
        <h2 className="form-section-title">1. Aufgabenbeschreibung und Angebotstexte</h2>
        <RichTextSectionsEditor
          name="introText"
          label="Erster Textbereich: Aufgabenbeschreibung für Angebot und Auftrag"
          defaultValue={defaults.introText}
          placeholder="Beschreiben Sie hier präzise die Aufgabe. Dieser erste Textbereich wird in den Auftrag übernommen …"
        />
        {fe.introText && <p className="field-error mt-2">{fe.introText[0]}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Über „＋ Textbereich“ können beliebig weitere Texte vor dem Positionskalkulator ergänzt werden.
          Nur der erste Textbereich wird als Auftragsbeschreibung übernommen.
        </p>
      </div>

      {/* ── Positionskalkulator ── */}
      <div className="form-section">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100">
          <h2 className="text-sm font-600 text-foreground">
            2. Positionskalkulator
            {fe.items && <span className="ml-2 text-red-600 text-xs font-400">{fe.items[0]}</span>}
          </h2>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded border border-blue-200 bg-blue-50 text-blue-700 text-xs font-500 hover:bg-blue-100 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Position hinzufügen
          </button>
        </div>

        {/* Table header */}
        <div className="hidden md:grid grid-cols-[2fr_80px_90px_100px_70px_90px_36px] gap-2 px-1 mb-1">
          {['Beschreibung *', 'Menge *', 'Einheit', 'Einzelpreis *', 'MwSt.', 'Netto', ''].map((h) => (
            <span key={h} className="text-[10px] font-600 uppercase tracking-wider text-muted-foreground">{h}</span>
          ))}
        </div>

        <div className="space-y-2">
          {computed.map((item, idx) => (
            <div
              key={item._key}
              className="grid grid-cols-1 md:grid-cols-[2fr_80px_90px_100px_70px_90px_36px] gap-2 p-3 md:p-0 rounded-md bg-stone-50 md:bg-transparent border border-stone-100 md:border-none items-center"
            >
              {/* Description */}
              <div>
                <span className="md:hidden text-[10px] font-600 uppercase tracking-wider text-muted-foreground block mb-1">Beschreibung</span>
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(item._key, 'description', e.target.value)}
                  placeholder="Leistungsbeschreibung …"
                  className={`w-full h-9 px-3 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent
                    ${!item.description && state.fieldErrors ? 'border-red-300' : 'border-stone-200'}`}
                />
              </div>

              {/* Quantity */}
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => updateItem(item._key, 'quantity', e.target.value)}
                min="0.001" step="0.001" placeholder="1"
                className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />

              {/* Unit */}
              <select
                value={item.unit}
                onChange={(e) => updateItem(item._key, 'unit', e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>

              {/* Unit price */}
              <div className="relative">
                <input
                  type="number"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(item._key, 'unitPrice', e.target.value)}
                  min="0" step="0.01" placeholder="0,00"
                  className="w-full h-9 pl-3 pr-6 rounded-md border border-stone-200 bg-white text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
              </div>

              {/* Tax rate */}
              <select
                value={item.taxRate}
                onChange={(e) => updateItem(item._key, 'taxRate', e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-stone-200 bg-white text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                {TAX_OPTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              {/* Net (calculated) */}
              <div className="h-9 px-3 rounded-md bg-stone-50 border border-stone-100 flex items-center justify-end">
                <span className="text-sm tabular-nums text-foreground">
                  {item.net.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Row actions */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveRow(item._key, -1)}
                  disabled={idx === 0}
                  className="w-8 h-8 flex items-center justify-center rounded text-stone-400 hover:text-stone-600 hover:bg-stone-100 disabled:opacity-30 transition-colors"
                  title="Nach oben"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(item._key, 1)}
                  disabled={idx === items.length - 1}
                  className="w-8 h-8 flex items-center justify-center rounded text-stone-400 hover:text-stone-600 hover:bg-stone-100 disabled:opacity-30 transition-colors"
                  title="Nach unten"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(item._key)}
                  disabled={items.length <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded text-stone-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors"
                  title="Position entfernen"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Totals summary ── */}
        <div className="mt-6 border-t border-stone-200 pt-4">
          <div className="flex justify-end">
            <div className="w-72 space-y-1.5">
              <TotalRow label="Nettobetrag" value={totals.totalNet} />
              {Object.entries(totals.taxGroups)
                .filter(([, v]) => v > 0)
                .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
                .map(([rate, amount]) => (
                  <TotalRow
                    key={rate}
                    label={`zzgl. ${rate}% MwSt.`}
                    value={amount}
                    muted
                  />
                ))}
              <div className="border-t border-stone-300 pt-1.5 mt-1.5">
                <TotalRow label="Gesamtbetrag brutto" value={totals.totalGross} bold />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Unterschrift und Schlusstext ── */}
      <div className="form-section">
        <h2 className="form-section-title">3. Unterschrift und Schlusstext</h2>
        <RichTextSectionsEditor
          name="outroText"
          label="Textbereich nach dem Positionskalkulator"
          defaultValue={defaults.outroText}
          placeholder="Schlusstext, Ort, Datum und Unterschriftsbereich …"
        />
        {fe.outroText && <p className="field-error mt-2">{fe.outroText[0]}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Dieser Bereich erscheint im Angebot nach dem Kalkulator und kann für die Unterschrift verwendet werden.
        </p>
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
          idleLabel={mode === 'create' ? 'Angebot anlegen' : 'Änderungen speichern'}
          pendingLabel={mode === 'create' ? 'Wird angelegt…' : 'Wird gespeichert…'}
          className="h-9 px-5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-sm font-500 disabled:opacity-50 transition-colors"
        />
      </div>
    </form>
  )
}

// ── Helper ────────────────────────────────────────────────────

function TotalRow({
  label, value, bold, muted,
}: {
  label: string; value: number; bold?: boolean; muted?: boolean
}) {
  const fmt = value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className={`text-sm ${muted ? 'text-muted-foreground' : bold ? 'font-600 text-foreground' : 'text-foreground'}`}>
        {label}
      </span>
      <span className={`text-sm tabular-nums ${bold ? 'font-600' : ''}`}>
        {fmt} €
      </span>
    </div>
  )
}
