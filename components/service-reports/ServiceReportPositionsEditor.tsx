'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_UNIT,
  SERVICE_ITEM_TYPES,
  SERVICE_ITEM_TYPE_LABELS,
  calcReportItemAmounts,
  calcReportTotals,
  type ServiceItemType,
  type ServiceReportItemInput,
} from '@/lib/validators/service-report.schema'
import { UNITS } from '@/lib/validators/offer.schema'

export interface ServiceReportPositionValue {
  _key?: string
  position: number
  type: ServiceItemType
  description: string
  quantity: string
  unit: string
  unitPrice: string
  discountRate?: string
  taxRate?: string
  notes: string
}

interface Props {
  defaults?: ServiceReportPositionValue[]
  error?: string
  onItemsChange?: (items: ServiceReportItemInput[]) => void
}

const UNIT_OPTIONS = [...new Set([...UNITS, 'Tag', 'Pauschal', 'Satz'])]
const TAX_OPTIONS = ['19', '7', '0']

function createPosition(type: ServiceItemType = 'hours', position = 1): Required<ServiceReportPositionValue> {
  return {
    _key: crypto.randomUUID(),
    position,
    type,
    description: '',
    quantity: '1',
    unit: DEFAULT_UNIT[type],
    unitPrice: '',
    discountRate: '0',
    taxRate: '19',
    notes: '',
  }
}

function money(value: number) {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ServiceReportPositionsEditor({ defaults, error, onItemsChange }: Props) {
  const [items, setItems] = useState(() => defaults?.length
    ? defaults.map((item) => ({
        ...item,
        _key: item._key ?? crypto.randomUUID(),
        discountRate: item.discountRate ?? '0',
        taxRate: item.taxRate ?? '19',
      }))
    : [createPosition()])
  const [showPrices, setShowPrices] = useState(false)
  const [automaticPositions, setAutomaticPositions] = useState(true)
  const [draggedKey, setDraggedKey] = useState<string | null>(null)

  const numericItems = useMemo(() => items.map((item, index) => ({
    position: automaticPositions ? index + 1 : item.position,
    type: item.type,
    description: item.description,
    quantity: Number.parseFloat(item.quantity) || 0,
    unit: item.unit,
    unitPrice: Number.parseFloat(item.unitPrice) || 0,
    discountRate: Number.parseFloat(item.discountRate) || 0,
    taxRate: Number.parseFloat(item.taxRate) || 0,
    notes: item.notes || null,
  })), [automaticPositions, items])
  const totals = useMemo(() => calcReportTotals(numericItems), [numericItems])

  useEffect(() => {
    onItemsChange?.(numericItems)
  }, [numericItems, onItemsChange])

  function updateItem(key: string, patch: Partial<ServiceReportPositionValue>) {
    setItems((current) => current.map((item) => item._key === key ? { ...item, ...patch } : item))
  }

  function addItem() {
    setItems((current) => [...current, createPosition(current.at(-1)?.type ?? 'hours', current.length + 1)])
  }

  function removeItem(key: string) {
    setItems((current) => current.length === 1 ? current : current.filter((item) => item._key !== key))
  }

  function moveItem(key: string, direction: -1 | 1) {
    setItems((current) => {
      const from = current.findIndex((item) => item._key === key)
      const to = from + direction
      if (from < 0 || to < 0 || to >= current.length) return current
      const next = [...current]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    })
  }

  function dropOn(targetKey: string) {
    if (!draggedKey || draggedKey === targetKey) return
    setItems((current) => {
      const from = current.findIndex((item) => item._key === draggedKey)
      const to = current.findIndex((item) => item._key === targetKey)
      if (from < 0 || to < 0) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setDraggedKey(null)
  }

  return (
    <div className="min-w-0">
      <input type="hidden" name="itemsJson" value={JSON.stringify(numericItems)} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
        <div>{error && <p className="field-error">{error}</p>}</div>
        <button type="button" onClick={addItem} className="inline-flex min-h-9 items-center rounded border border-blue-200 bg-blue-50 px-3 text-xs font-500 text-blue-700 hover:bg-blue-100">
          ＋ Position hinzufügen
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" checked={automaticPositions} onChange={(event) => setAutomaticPositions(event.target.checked)} />
          Positionsnummern automatisch vergeben
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" checked={showPrices} onChange={(event) => setShowPrices(event.target.checked)} />
          Preise und Summen anzeigen
        </label>
      </div>

      <div className="mt-3 space-y-3">
        {items.map((item, index) => {
          const key = item._key as string
          const amount = calcReportItemAmounts({
            quantity: Number.parseFloat(item.quantity) || 0,
            unitPrice: Number.parseFloat(item.unitPrice) || 0,
            discountRate: Number.parseFloat(item.discountRate) || 0,
            taxRate: Number.parseFloat(item.taxRate) || 0,
          })
          return (
            <article
              key={key}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(key)}
              className="rounded-md border border-stone-200 bg-stone-50/60 p-3"
            >
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[44px_minmax(140px,0.7fr)_minmax(180px,1.3fr)_auto]">
                <label className="min-w-0 text-xs text-muted-foreground">
                  Pos.
                  <input
                    aria-label={`Positionsnummer Position ${index + 1}`}
                    type="number"
                    min="1"
                    disabled={automaticPositions}
                    value={automaticPositions ? index + 1 : item.position}
                    onChange={(event) => updateItem(key, { position: Number.parseInt(event.target.value, 10) || 1 })}
                    className="mt-1 h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-center text-sm tabular-nums disabled:bg-stone-100"
                  />
                </label>
                <label className="min-w-0 text-xs text-muted-foreground">
                  Typ
                  <select value={item.type} onChange={(event) => updateItem(key, { type: event.target.value as ServiceItemType })} className="mt-1 h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-sm">
                    {SERVICE_ITEM_TYPES.map((type) => <option key={type} value={type}>{SERVICE_ITEM_TYPE_LABELS[type]}</option>)}
                  </select>
                </label>
                <label className="min-w-0 text-xs text-muted-foreground">
                  Leistung / Material
                  <input value={item.description} onChange={(event) => updateItem(key, { description: event.target.value })} maxLength={500} placeholder="Kurze Bezeichnung" className="mt-1 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm" />
                </label>
                <div className="flex items-end gap-1">
                  <button type="button" draggable onDragStart={() => setDraggedKey(key)} onDragEnd={() => setDraggedKey(null)} aria-label={`Position ${index + 1} verschieben`} title="Ziehen zum Verschieben" className="flex h-9 w-9 cursor-grab items-center justify-center rounded text-stone-500 hover:bg-stone-100">⠿</button>
                  <button type="button" onClick={() => moveItem(key, -1)} disabled={index === 0} aria-label={`Position ${index + 1} nach oben`} className="h-9 w-8 rounded hover:bg-stone-100 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => moveItem(key, 1)} disabled={index === items.length - 1} aria-label={`Position ${index + 1} nach unten`} className="h-9 w-8 rounded hover:bg-stone-100 disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => removeItem(key)} disabled={items.length === 1} aria-label={`Position ${index + 1} löschen`} className="h-9 w-9 rounded text-red-600 hover:bg-red-50 disabled:opacity-30">×</button>
                </div>
              </div>

              <div className={`mt-3 grid min-w-0 grid-cols-1 gap-3 ${showPrices ? 'sm:grid-cols-2 lg:grid-cols-[minmax(180px,2fr)_70px_82px_90px_70px_64px_94px]' : 'sm:grid-cols-[minmax(220px,1fr)_90px_110px]'}`}>
                <label className="min-w-0 text-xs text-muted-foreground">
                  Beschreibung
                  <textarea value={item.notes} onChange={(event) => updateItem(key, { notes: event.target.value })} maxLength={500} rows={2} placeholder="Details zur Position" className="mt-1 min-h-[4.5rem] w-full resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-muted-foreground">Menge<input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(key, { quantity: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-right text-sm tabular-nums" /></label>
                <label className="text-xs text-muted-foreground">Einheit<input list="service-units" value={item.unit} onChange={(event) => updateItem(key, { unit: event.target.value })} maxLength={20} className="mt-1 h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-sm" /></label>
                {showPrices && <>
                  <label className="text-xs text-muted-foreground">Einzelpreis<input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(key, { unitPrice: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-right text-sm tabular-nums" /></label>
                  <label className="text-xs text-muted-foreground">Rabatt %<input type="number" min="0" max="100" step="0.01" value={item.discountRate} onChange={(event) => updateItem(key, { discountRate: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-right text-sm tabular-nums" /></label>
                  <label className="text-xs text-muted-foreground">MwSt.<select value={item.taxRate} onChange={(event) => updateItem(key, { taxRate: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-sm">{TAX_OPTIONS.map((tax) => <option key={tax} value={tax}>{tax} %</option>)}</select></label>
                  <div className="text-xs text-muted-foreground">Gesamt<div className="mt-1 flex h-9 items-center justify-end rounded-md border border-stone-100 bg-white px-2 text-sm tabular-nums">{money(amount.netAmount)} €</div></div>
                </>}
              </div>
            </article>
          )
        })}
      </div>
      <datalist id="service-units">{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit} />)}</datalist>

      <button type="button" onClick={addItem} className="mt-3 min-h-9 text-sm font-500 text-blue-700 hover:underline">＋ Weitere Position hinzufügen</button>

      {showPrices && (
        <dl className="ml-auto mt-5 w-full max-w-xs space-y-1.5 border-t border-stone-200 pt-4 text-sm tabular-nums">
          <Total label="Zwischensumme" value={totals.subtotal} />
          <Total label="Rabatt gesamt" value={-totals.totalDiscount} />
          <Total label="Netto" value={totals.totalNet} />
          <Total label="MwSt." value={totals.totalTax} />
          <Total label="Gesamtbetrag" value={totals.totalGross} strong />
        </dl>
      )}
    </div>
  )
}

function Total({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 ${strong ? 'border-t border-stone-300 pt-2 font-600' : ''}`}><dt>{label}</dt><dd>{money(value)} €</dd></div>
}
