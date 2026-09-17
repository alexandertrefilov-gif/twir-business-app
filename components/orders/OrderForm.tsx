'use client'
// components/orders/OrderForm.tsx

import { useActionState, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useRouter }   from 'next/navigation'
import type { ActionState } from '@/app/(dashboard)/orders/actions'
import { RichTextSectionsEditor } from '@/components/offers/RichTextSectionsEditor'
import { DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID, DocumentFormWorkflowActions } from '@/components/documents/DocumentFormWorkflowActions'

interface CustomerOption { id: string; name: string; number: string }

interface ItemRow {
  _key:        string
  description: string
  quantity:    string
  unit:        string
  unitPrice:   string
  taxRate:     string
  notes:       string
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
  return { _key: crypto.randomUUID(), description: '', quantity: '1', unit: 'Stk.', unitPrice: '', taxRate: '19', notes: '' }
}
const todayStr = () => new Date().toISOString().slice(0, 10)
const INIT: ActionState = {}

export function OrderForm({ mode, customers, defaults = {}, action, lockCustomer }: OrderFormProps) {
  const [state, formAction, isPending] = useActionState(action, INIT)
  const router    = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [items, setItems] = useState<ItemRow[]>(defaults.items ?? [])

  const computed = useMemo(() => items.map((r) => {
    const net = Math.round((parseFloat(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0) * 100) / 100
    return { ...r, net }
  }), [items])

  const totalNet = computed.reduce((s, i) => s + i.net, 0)

  function upd(key: string, field: keyof ItemRow, val: string) {
    setItems((p) => p.map((r) => r._key === key ? { ...r, [field]: val } : r))
  }

  const serialized = JSON.stringify(
    items.map((r, i) => ({
      position:    i + 1,
      description: r.description,
      quantity:    parseFloat(r.quantity)  || 0,
      unit:        r.unit,
      unitPrice:   parseFloat(r.unitPrice) || 0,
      taxRate:     parseFloat(r.taxRate)   || 0,
      notes:       r.notes || null,
    })),
  )

  const fe = state.fieldErrors ?? {}

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
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

      <section id="order-content-cards" className="min-w-0 scroll-mt-4">
        {lockCustomer && (
          <p className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Der Inhalt wurde vollständig aus dem Angebot übernommen. Nicht benötigte Text- und Positionskarten können einzeln entfernt werden.
          </p>
        )}
        <RichTextSectionsEditor
          name="description"
          label="Auftragsumfang"
          defaultValue={defaults.description}
          placeholder="Auftragsumfang beschreiben …"
          removableSections
          documentLayout
          embeddedPositions={(
            <OrderPositionsEditor
              computed={computed}
              items={items}
              totalNet={totalNet}
              updateItem={upd}
              setItems={setItems}
            />
          )}
          embeddedPositionsHasData={items.length > 0}
          onEmbeddedPositionsRemoved={() => setItems([])}
        />
      </section>

      <DocumentFormWorkflowActions
        formRef={formRef}
        isPending={isPending}
        error={state.error}
        targetId={mode === 'create' ? DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID : undefined}
        idleLabel={mode === 'create' ? 'Auftrag anlegen' : 'Änderungen speichern'}
        pendingLabel={mode === 'create' ? 'Wird angelegt…' : 'Wird gespeichert…'}
        onCancel={() => router.back()}
      />
    </form>
  )
}

function OrderPositionsEditor({
  computed,
  items,
  totalNet,
  updateItem,
  setItems,
}: {
  computed: Array<ItemRow & { net: number }>
  items: ItemRow[]
  totalNet: number
  updateItem: (key: string, field: keyof ItemRow, value: string) => void
  setItems: Dispatch<SetStateAction<ItemRow[]>>
}) {
  return (
    <div className="min-w-0">
      <p className="mb-3 text-xs text-muted-foreground">Aus dem Angebot übernommen oder hier manuell erfasst.</p>
      <div className="mb-1 hidden gap-2 px-1 md:grid md:grid-cols-[minmax(180px,2fr)_80px_90px_100px_70px_90px_32px]">
        {['Beschreibung *', 'Menge', 'Einheit', 'Einzelpreis', 'MwSt.', 'Netto', ''].map((heading) => (
          <span key={heading} className="text-[10px] font-600 uppercase tracking-wider text-muted-foreground">{heading}</span>
        ))}
      </div>
      <div className="space-y-2">
        {computed.map((item) => (
          <div key={item._key} className="grid grid-cols-1 items-start gap-2 rounded border border-stone-100 bg-stone-50 p-3 md:grid-cols-[minmax(180px,2fr)_80px_90px_100px_70px_90px_32px] md:rounded-none md:border-none md:bg-transparent md:p-0">
            <div className="space-y-1.5">
              <input
                type="text"
                value={item.description}
                onChange={(event) => updateItem(item._key, 'description', event.target.value)}
                placeholder="Leistung …"
                className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                type="text"
                value={item.notes}
                onChange={(event) => updateItem(item._key, 'notes', event.target.value)}
                placeholder="Positionsnotiz (optional)"
                maxLength={500}
                className="h-8 w-full rounded-md border border-stone-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <input type="number" value={item.quantity} onChange={(event) => updateItem(item._key, 'quantity', event.target.value)} min="0.001" step="0.001" className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-right text-sm mono focus:outline-none focus:ring-2 focus:ring-blue-600" />
            <select value={item.unit} onChange={(event) => updateItem(item._key, 'unit', event.target.value)} className="h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
              {UNITS.map((unit) => <option key={unit}>{unit}</option>)}
            </select>
            <div className="relative">
              <input type="number" value={item.unitPrice} onChange={(event) => updateItem(item._key, 'unitPrice', event.target.value)} min="0" step="0.01" placeholder="0,00" className="h-9 w-full rounded-md border border-stone-200 bg-white pl-3 pr-6 text-right text-sm mono focus:outline-none focus:ring-2 focus:ring-blue-600" />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
            </div>
            <select value={item.taxRate} onChange={(event) => updateItem(item._key, 'taxRate', event.target.value)} className="h-9 w-full rounded-md border border-stone-200 bg-white px-2 text-sm mono focus:outline-none focus:ring-2 focus:ring-blue-600">
              {TAX_OPTS.map((tax) => <option key={tax.value} value={tax.value}>{tax.label}</option>)}
            </select>
            <div className="flex h-9 items-center justify-end rounded-md border border-stone-100 bg-stone-50 px-3">
              <span className="text-sm mono">{item.net.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
            </div>
            <button type="button" onClick={() => setItems((current) => current.filter((row) => row._key !== item._key))} aria-label="Position entfernen" className="flex h-8 w-8 items-center justify-center rounded text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
        <button type="button" onClick={() => setItems((current) => [...current, newRow()])} className="inline-flex h-7 items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 text-xs font-500 text-blue-700 hover:bg-blue-100">
          <span aria-hidden>＋</span> Zeile hinzufügen
        </button>
        <span className="text-sm font-500 mono">Netto: {totalNet.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
      </div>
    </div>
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
