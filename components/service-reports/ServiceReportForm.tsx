'use client'
// components/service-reports/ServiceReportForm.tsx

import { useMemo, useState } from 'react'
import { useFormState } from 'react-dom'
import { useRouter } from 'next/navigation'
import { FormSubmitButton } from '@/components/shared/FormSubmitButton'
import type { ActionState } from '@/app/(dashboard)/services/actions'
import {
  SERVICE_ITEM_TYPES,
  SERVICE_ITEM_TYPE_LABELS,
  DEFAULT_UNIT,
  type ServiceItemType,
} from '@/lib/validators/service-report.schema'

interface OrderOption { id: string; orderNumber: string; title: string | null }

interface ItemRow {
  _key:        string
  type:        ServiceItemType
  description: string
  quantity:    string
  unit:        string
  unitPrice:   string
  notes:       string
}

interface ServiceReportFormProps {
  mode:     'create' | 'edit'
  orders:   OrderOption[]
  defaults?: Partial<{
    orderId:     string
    title:       string
    description: string
    reportDate:  string
    items:       ItemRow[]
  }>
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  lockOrder?: boolean
}

function newRow(type: ServiceItemType = 'hours'): ItemRow {
  return {
    _key:        crypto.randomUUID(),
    type,
    description: '',
    quantity:    type === 'hours' ? '1' : '1',
    unit:        DEFAULT_UNIT[type],
    unitPrice:   '',
    notes:       '',
  }
}
const todayStr = () => new Date().toISOString().slice(0, 10)
const INIT: ActionState = {}

const TYPE_COLORS: Record<ServiceItemType, string> = {
  hours:    'bg-blue-50 text-blue-700 border-blue-200',
  material: 'bg-amber-50 text-amber-700 border-amber-200',
  flat:     'bg-violet-50 text-violet-700 border-violet-200',
}

export function ServiceReportForm({
  mode, orders, defaults = {}, action, lockOrder,
}: ServiceReportFormProps) {
  const [state, formAction] = useFormState(action, INIT)
  const router = useRouter()

  const [items, setItems] = useState<ItemRow[]>(
    defaults.items?.length ? defaults.items : [newRow('hours')],
  )

  const computed = useMemo(() => items.map((r) => ({
    ...r,
    net: Math.round((parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0) * 100) / 100,
  })), [items])

  const totalNet = computed.reduce((s, i) => s + i.net, 0)

  // Group totals by type
  const byType = useMemo(() => {
    const g: Record<string, number> = {}
    for (const i of computed) {
      g[i.type] = Math.round(((g[i.type] ?? 0) + i.net) * 100) / 100
    }
    return g
  }, [computed])

  function upd(key: string, field: keyof ItemRow, val: string) {
    setItems((p) => p.map((r) => {
      if (r._key !== key) return r
      // When type changes, auto-update unit
      if (field === 'type') {
        return { ...r, type: val as ServiceItemType, unit: DEFAULT_UNIT[val as ServiceItemType] }
      }
      return { ...r, [field]: val }
    }))
  }

  const serialized = JSON.stringify(items.map((r, i) => ({
    position:    i + 1,
    type:        r.type,
    description: r.description,
    quantity:    parseFloat(r.quantity)  || 0,
    unit:        r.unit,
    unitPrice:   parseFloat(r.unitPrice) || 0,
    notes:       r.notes || null,
  })))

  const fe = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="itemsJson" value={serialized} />

      {state.error && (
        <div className="flex items-start gap-2 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/></svg>
          {state.error}
        </div>
      )}

      {/* ── Header ── */}
      <div className="form-section">
        <h2 className="form-section-title">Nachweis-Kopfdaten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Auftrag */}
          <div className="sm:col-span-2">
            <label className="field-label field-required" htmlFor="orderId">Auftrag</label>
            {lockOrder ? (
              <>
                <input type="hidden" name="orderId" value={defaults.orderId} />
                <div className="h-9 px-3 rounded-md border border-stone-200 bg-stone-50 text-sm flex items-center text-muted-foreground">
                  {orders.find((o) => o.id === defaults.orderId)?.orderNumber}
                  <span className="ml-2 opacity-60">{orders.find((o) => o.id === defaults.orderId)?.title ?? ''}</span>
                </div>
              </>
            ) : (
              <select id="orderId" name="orderId" required defaultValue={defaults.orderId ?? ''}
                className={`w-full h-9 px-2.5 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${fe.orderId ? 'border-red-400' : 'border-stone-200'}`}>
                <option value="">— Auftrag auswählen —</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber}{o.title ? ` · ${o.title}` : ''}
                  </option>
                ))}
              </select>
            )}
            {fe.orderId && <p className="field-error">{fe.orderId[0]}</p>}
          </div>

          {/* Datum */}
          <div>
            <label className="field-label field-required" htmlFor="reportDate">Leistungsdatum</label>
            <input id="reportDate" name="reportDate" type="date" required
              defaultValue={defaults.reportDate ?? todayStr()}
              className={`w-full h-9 px-3 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${fe.reportDate ? 'border-red-400' : 'border-stone-200'}`} />
            {fe.reportDate && <p className="field-error">{fe.reportDate[0]}</p>}
          </div>

          {/* Titel */}
          <div>
            <label className="field-label" htmlFor="title">Bezeichnung</label>
            <input id="title" name="title" type="text" defaultValue={defaults.title ?? ''}
              placeholder="z.B. Wartung Woche 42"
              className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
          </div>

          {/* Beschreibung */}
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="description">Beschreibung / Tätigkeitsbericht</label>
            <textarea id="description" name="description" rows={3}
              defaultValue={defaults.description ?? ''}
              placeholder="Kurze Beschreibung der durchgeführten Arbeiten …"
              className="w-full px-3 py-2 rounded-md border border-stone-200 bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none" />
          </div>
        </div>
      </div>

      {/* ── Positionen ── */}
      <div className="form-section">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
          <div>
            <h2 className="text-sm font-600 text-foreground">
              Positionen
              {fe.items && <span className="ml-2 text-red-600 text-xs font-400">{fe.items[0]}</span>}
            </h2>
            <div className="flex gap-2 mt-1">
              {SERVICE_ITEM_TYPES.map((t) => (
                <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border font-500 ${TYPE_COLORS[t]}`}>
                  {SERVICE_ITEM_TYPE_LABELS[t]}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5">
            {SERVICE_ITEM_TYPES.map((t) => (
              <button key={t} type="button"
                onClick={() => setItems((p) => [...p, newRow(t)])}
                className={`h-7 px-2.5 rounded border text-xs font-500 transition-colors ${TYPE_COLORS[t]} hover:opacity-80`}>
                + {t === 'hours' ? 'Std.' : t === 'material' ? 'Mat.' : 'Psch.'}
              </button>
            ))}
          </div>
        </div>

        {/* Table header */}
        <div className="hidden md:grid grid-cols-[90px_2fr_80px_80px_110px_110px_32px] gap-2 px-1 mb-1">
          {['Typ', 'Beschreibung *', 'Menge *', 'Einheit', 'Einzelpreis *', 'Netto', ''].map((h) => (
            <span key={h} className="text-[10px] font-600 uppercase tracking-wider text-muted-foreground">{h}</span>
          ))}
        </div>

        <div className="space-y-2">
          {computed.map((item, idx) => (
            <div key={item._key}
              className="grid grid-cols-1 md:grid-cols-[90px_2fr_80px_80px_110px_110px_32px] gap-2 p-3 md:p-0 rounded md:rounded-none bg-stone-50 md:bg-transparent border border-stone-100 md:border-none items-center">

              {/* Type badge/selector */}
              <select value={item.type} onChange={(e) => upd(item._key, 'type', e.target.value)}
                className={`h-9 px-2 rounded-md border text-xs font-500 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${TYPE_COLORS[item.type]}`}>
                {SERVICE_ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>{SERVICE_ITEM_TYPE_LABELS[t]}</option>
                ))}
              </select>

              {/* Description */}
              <input type="text" value={item.description}
                onChange={(e) => upd(item._key, 'description', e.target.value)}
                placeholder={item.type === 'hours' ? 'Tätigkeit beschreiben …' : item.type === 'material' ? 'Materialbezeichnung …' : 'Pauschalleistung …'}
                className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />

              {/* Quantity */}
              <input type="number" value={item.quantity}
                onChange={(e) => upd(item._key, 'quantity', e.target.value)}
                min="0.001" step={item.type === 'hours' ? '0.25' : '0.001'} placeholder="1"
                className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm text-right mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />

              {/* Unit */}
              <input type="text" value={item.unit}
                onChange={(e) => upd(item._key, 'unit', e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />

              {/* Unit price */}
              <div className="relative">
                <input type="number" value={item.unitPrice}
                  onChange={(e) => upd(item._key, 'unitPrice', e.target.value)}
                  min="0" step="0.01" placeholder="0,00"
                  className="w-full h-9 pl-3 pr-6 rounded-md border border-stone-200 bg-white text-sm text-right mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
              </div>

              {/* Net */}
              <div className="h-9 px-3 rounded-md bg-stone-50 border border-stone-100 flex items-center justify-end">
                <span className="text-sm mono">
                  {item.net.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Remove */}
              <button type="button" onClick={() => setItems((p) => p.filter((r) => r._key !== item._key))}
                disabled={items.length <= 1}
                className="w-8 h-8 flex items-center justify-center rounded text-stone-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>

        {/* Totals by type + grand total */}
        <div className="mt-5 pt-4 border-t border-stone-200 flex justify-end">
          <div className="w-72 space-y-1.5">
            {SERVICE_ITEM_TYPES.filter((t) => (byType[t] ?? 0) > 0).map((t) => (
              <div key={t} className="flex justify-between">
                <span className="text-sm text-muted-foreground">{SERVICE_ITEM_TYPE_LABELS[t]}</span>
                <span className="mono text-sm">
                  {(byType[t] ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                </span>
              </div>
            ))}
            <div className="border-t border-stone-300 pt-1.5">
              <div className="flex justify-between">
                <span className="text-sm font-600">Gesamt netto</span>
                <span className="mono text-sm font-600">
                  {totalNet.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <button type="button" onClick={() => router.back()}
          className="h-9 px-4 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors">
          Abbrechen
        </button>
        <FormSubmitButton
          idleLabel={mode === 'create' ? 'Leistungsnachweis erstellen' : 'Änderungen speichern'}
          pendingLabel={mode === 'create' ? 'Wird gespeichert…' : 'Wird aktualisiert…'}
          className="h-9 px-5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-sm font-500 disabled:opacity-50 transition-colors"
        />
      </div>
    </form>
  )
}
