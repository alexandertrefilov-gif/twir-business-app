'use client'
// components/invoices/InvoiceForm.tsx
// Rechnungsformular (Entwurf erstellen/bearbeiten).
// Itemzeilen-Logik analog OfferForm (Phase 4) — kein Kopieren, gleiche Muster.

import { useActionState, useMemo, useRef, useState } from 'react'
import { useRouter }   from 'next/navigation'
import { InvoiceDraftPdfPreview } from '@/components/invoices/InvoiceDraftPdfPreview'
import type { ActionState } from '@/app/(dashboard)/invoices/actions'
import { RichTextSectionsEditor } from '@/components/offers/RichTextSectionsEditor'
import { DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID, DocumentFormWorkflowActions } from '@/components/documents/DocumentFormWorkflowActions'

interface CustomerOption {
  id: string; name: string; number: string; legalName?: string | null
  street?: string | null; houseNumber?: string | null; postalCode?: string | null; city?: string | null; country: string
  billingAddresses: Array<{ id:string; label:string; companyName:string; additional:string|null; street:string; houseNumber:string|null; postalCode:string; city:string; country:string; contactName:string|null; email:string|null; isDefault:boolean }>
}
interface OrderOption    { id: string; orderNumber: string; title: string | null }

interface ItemRow {
  _key: string; description: string; quantity: string
  unit: string; unitPrice: string; taxRate: string
}

interface InvoiceFormProps {
  mode:       'create' | 'edit'
  customers:  CustomerOption[]
  orders:     OrderOption[]
  defaults?:  Partial<{
    customerId: string; orderId: string; invoiceDate: string; dueDate: string
    deliveryDate: string; paymentTermDays: string
    introText: string; outroText: string; items: ItemRow[]
    invoiceRecipientSource: 'CUSTOMER' | 'BILLING' | 'CUSTOM'
    billingAddressId: string
    recipientName: string; recipientAdditional: string; recipientStreet: string
    recipientHouseNumber: string; recipientPostalCode: string; recipientCity: string; recipientCountry: string
    recipientContactName: string; recipientEmail: string
  }>
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  lockCustomer?: boolean
  lockOrder?:    boolean
  invoiceId?:    string
}

const UNITS    = ['Stk.', 'Std.', 'Psch.', 'kg', 't', 'm', 'm²', 'm³', 'l', 'km']
const TAX_OPTS = [{ v: '19', l: '19 %' }, { v: '7', l: '7 %' }, { v: '0', l: '0 %' }]
const INIT: ActionState = {}
const todayStr = () => new Date().toISOString().slice(0, 10)
function addDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function InvoiceForm({
  mode, customers, orders, defaults = {}, action, lockCustomer, lockOrder, invoiceId,
}: InvoiceFormProps) {
  const [state, formAction, isPending] = useActionState(action, INIT)
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const initialCustomer = customers.find(customer => customer.id === (defaults.customerId ?? ''))
  const initialDefaultAddress = initialCustomer?.billingAddresses.find(address => address.isDefault)
  const [selectedCustomerId, setSelectedCustomerId] = useState(defaults.customerId ?? '')
  const [recipientSource, setRecipientSource] = useState<'CUSTOMER' | 'BILLING' | 'CUSTOM'>(defaults.invoiceRecipientSource ?? (initialDefaultAddress ? 'BILLING' : 'CUSTOMER'))
  const [billingAddressId, setBillingAddressId] = useState(defaults.billingAddressId ?? initialDefaultAddress?.id ?? '')
  const [items, setItems] = useState<ItemRow[]>(
    defaults.items?.length ? defaults.items : [newRow()],
  )

  function newRow(): ItemRow {
    return { _key: crypto.randomUUID(), description: '', quantity: '1', unit: 'Stk.', unitPrice: '', taxRate: '19' }
  }

  const computed = useMemo(() => items.map((r) => {
    const net = Math.round((parseFloat(r.quantity)||0)*(parseFloat(r.unitPrice)||0)*100)/100
    const tax = Math.round(net*(parseFloat(r.taxRate)||0)/100*100)/100
    return { ...r, net, tax, gross: Math.round((net+tax)*100)/100 }
  }), [items])

  const totals = useMemo(() => {
    const net = computed.reduce((s,i)=>s+i.net,0)
    const groups: Record<string,number> = {}
    for (const i of computed) groups[i.taxRate] = Math.round(((groups[i.taxRate]??0)+i.tax)*100)/100
    const tax = Object.values(groups).reduce((s,v)=>s+v,0)
    return { net:Math.round(net*100)/100, groups, tax:Math.round(tax*100)/100, gross:Math.round((net+tax)*100)/100 }
  }, [computed])

  function upd(key:string,f:keyof ItemRow,v:string){setItems(p=>p.map(r=>r._key===key?{...r,[f]:v}:r))}

  const serialized = JSON.stringify(items.map((r,i)=>({
    position:i+1, description:r.description, quantity:parseFloat(r.quantity)||0,
    unit:r.unit, unitPrice:parseFloat(r.unitPrice)||0, taxRate:parseFloat(r.taxRate)||0,
  })))

  const fe = state.fieldErrors ?? {}
  const fmt = (n:number) => n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId)
  const selectedBillingAddress = selectedCustomer?.billingAddresses.find(address => address.id === billingAddressId)

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="itemsJson" value={serialized} />
      <input type="hidden" name="billingAddressId" value={recipientSource === 'BILLING' ? billingAddressId : ''} />

      {state.error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* ── Rechnungsempfänger ── */}
      <div className="form-section">
        <h2 className="form-section-title">Rechnungsempfänger</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label field-required" htmlFor="customerId">Kunde</label>
            {lockCustomer
              ? (<>
                  <input type="hidden" name="customerId" value={defaults.customerId} />
                  <div className="flex h-9 items-center rounded-md border border-stone-200 bg-stone-50 px-3 text-sm text-muted-foreground">
                    {selectedCustomer?.name ?? defaults.customerId}
                  </div>
                </>)
              : (<select id="customerId" name="customerId" required defaultValue={defaults.customerId??''}
                  onChange={(event) => { const next = customers.find(customer => customer.id === event.target.value); setSelectedCustomerId(event.target.value); const defaultAddress = next?.billingAddresses.find(address => address.isDefault); setBillingAddressId(defaultAddress?.id ?? ''); setRecipientSource(defaultAddress ? 'BILLING' : 'CUSTOMER') }}
                  className={`h-9 w-full rounded-md border bg-white px-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600 ${fe.customerId?'border-red-400':'border-stone-200'}`}>
                  <option value="">— Kunde auswählen —</option>
                  {customers.map(c=><option key={c.id} value={c.id}>{c.number} · {c.name}</option>)}
                </select>)}
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="invoiceRecipientSource">Anschrift verwenden</label>
            <select id="invoiceRecipientSource" value={recipientSource === 'BILLING' ? `BILLING:${billingAddressId}` : recipientSource}
              onChange={(event) => { const value = event.target.value; if (value.startsWith('BILLING:')) { setRecipientSource('BILLING'); setBillingAddressId(value.slice(8)) } else setRecipientSource(value as 'CUSTOMER' | 'CUSTOM') }}
              className="h-9 w-full rounded-md border border-stone-200 bg-white px-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600">
              <option value="CUSTOMER">Kundenanschrift</option>
              {selectedCustomer?.billingAddresses.map(address => <option key={address.id} value={`BILLING:${address.id}`}>{address.label} · {address.companyName}</option>)}
              <option value="CUSTOM">Einmalige abweichende Rechnungsadresse</option>
            </select>
            <input type="hidden" name="invoiceRecipientSource" value={recipientSource} />
          </div>
          {recipientSource !== 'CUSTOM' && selectedCustomer && (
            <address className="sm:col-span-2 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm not-italic leading-5 text-muted-foreground">
              {recipientSource === 'BILLING' ? selectedBillingAddress?.companyName : (selectedCustomer.legalName ?? selectedCustomer.name)}<br />
              {recipientSource === 'BILLING' && selectedBillingAddress?.additional && <>{selectedBillingAddress.additional}<br /></>}
              {recipientSource === 'BILLING' && selectedBillingAddress?.contactName && <>{selectedBillingAddress.contactName}<br /></>}
              {recipientSource === 'BILLING' ? selectedBillingAddress?.street : selectedCustomer.street} {recipientSource === 'BILLING' ? selectedBillingAddress?.houseNumber : selectedCustomer.houseNumber}<br />
              {recipientSource === 'BILLING' ? selectedBillingAddress?.postalCode : selectedCustomer.postalCode} {recipientSource === 'BILLING' ? selectedBillingAddress?.city : selectedCustomer.city}
            </address>
          )}
          {recipientSource === 'CUSTOM' && <>
            <AF label="Firma / Name" name="recipientName" required defaultValue={defaults.recipientName} error={fe.recipientName?.[0]} />
            <AF label="Zusatz / Abteilung" name="recipientAdditional" defaultValue={defaults.recipientAdditional} error={fe.recipientAdditional?.[0]} />
            <AF label="Ansprechpartner" name="recipientContactName" defaultValue={defaults.recipientContactName} error={fe.recipientContactName?.[0]} />
            <AF label="E-Mail" name="recipientEmail" defaultValue={defaults.recipientEmail} error={fe.recipientEmail?.[0]} />
            <div className="grid grid-cols-3 gap-4 sm:col-span-2">
              <div className="col-span-2"><AF label="Straße" name="recipientStreet" required defaultValue={defaults.recipientStreet} error={fe.recipientStreet?.[0]} /></div>
              <AF label="Hausnummer" name="recipientHouseNumber" defaultValue={defaults.recipientHouseNumber} error={fe.recipientHouseNumber?.[0]} />
            </div>
            <AF label="PLZ" name="recipientPostalCode" required defaultValue={defaults.recipientPostalCode} error={fe.recipientPostalCode?.[0]} />
            <AF label="Ort" name="recipientCity" required defaultValue={defaults.recipientCity} error={fe.recipientCity?.[0]} />
            <div>
              <label className="field-label field-required" htmlFor="recipientCountry">Land</label>
              <select id="recipientCountry" name="recipientCountry" defaultValue={defaults.recipientCountry ?? 'DE'} className="h-9 w-full rounded-md border border-stone-200 bg-white px-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="DE">Deutschland</option><option value="AT">Österreich</option><option value="CH">Schweiz</option><option value="LU">Luxemburg</option>
              </select>
            </div>
          </>}
        </div>
      </div>

      {/* ── Kopfdaten ── */}
      <div className="form-section">
        <h2 className="form-section-title">Rechnungsdaten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Auftrag (optional) */}
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="orderId">Auftrag (optional)</label>
            {lockOrder
              ? (<>
                  <input type="hidden" name="orderId" value={defaults.orderId} />
                  <div className="h-9 px-3 rounded-md border border-stone-200 bg-stone-50 text-sm flex items-center text-muted-foreground">
                    {orders.find(o=>o.id===defaults.orderId)?.orderNumber}
                  </div>
                </>)
              : (<select id="orderId" name="orderId" defaultValue={defaults.orderId??''}
                  className="w-full h-9 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent">
                  <option value="">— Kein Auftrag verknüpft —</option>
                  {orders.map(o=><option key={o.id} value={o.id}>{o.orderNumber}{o.title?` · ${o.title}`:''}</option>)}
                </select>)
            }
          </div>

          {/* Dates */}
          <FD label="Rechnungsdatum" name="invoiceDate" required defaultValue={defaults.invoiceDate??todayStr()} error={fe.invoiceDate?.[0]} />
          <FD label="Zahlungsziel"   name="dueDate"      defaultValue={defaults.dueDate??addDays(14)} hint="Standard: 14 Tage" />
          <FD label="Leistungsdatum" name="deliveryDate" defaultValue={defaults.deliveryDate??''} hint="Einzeltag (optional)" />
          <div>
            <label className="field-label" htmlFor="paymentTermDays">Zahlungsziel (Tage)</label>
            <input id="paymentTermDays" name="paymentTermDays" type="number" min="0" max="365"
              defaultValue={defaults.paymentTermDays??'14'}
              className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm mono text-right focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
          </div>
        </div>
      </div>

      {/* ── Texte ── */}
      <div className="form-section">
        <h2 className="form-section-title">Leistungsbeschreibung / Abrechnungstext</h2>
        <div className="space-y-4">
          <RichTextSectionsEditor
            name="introText"
            label="Textmodule"
            defaultValue={defaults.introText}
            placeholder="Abrechnungstext eingeben …"
            removableSections
            documentLayout
          />
          <TA label="Schlusstext"     name="outroText" defaultValue={defaults.outroText??''} />
        </div>
      </div>

      {/* ── Positionen ── */}
      <div className="form-section">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
          <h2 className="text-sm font-600 text-foreground">
            Positionen {fe.items && <span className="text-red-600 text-xs font-400 ml-2">{fe.items[0]}</span>}
          </h2>
          <button type="button" onClick={()=>setItems(p=>[...p,newRow()])}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded border border-blue-200 bg-blue-50 text-blue-700 text-xs font-500 hover:bg-blue-100 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            Position hinzufügen
          </button>
        </div>

        <div className="hidden md:grid grid-cols-[2fr_80px_90px_100px_70px_90px_36px] gap-2 px-1 mb-1">
          {['Beschreibung *','Menge *','Einheit','Einzelpreis *','MwSt.','Netto',''].map(h=>(
            <span key={h} className="text-[10px] font-600 uppercase tracking-wider text-muted-foreground">{h}</span>
          ))}
        </div>

        <div className="space-y-2">
          {computed.map((item,idx)=>(
            <div key={item._key} className="grid grid-cols-1 md:grid-cols-[2fr_80px_90px_100px_70px_90px_36px] gap-2 p-3 md:p-0 rounded md:rounded-none bg-stone-50 md:bg-transparent border border-stone-100 md:border-none items-center">
              <input type="text" value={item.description} onChange={e=>upd(item._key,'description',e.target.value)} placeholder="Leistungsbeschreibung …"
                className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
              <input type="number" value={item.quantity} onChange={e=>upd(item._key,'quantity',e.target.value)} min="0.001" step="0.001" placeholder="1"
                className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm text-right mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
              <select value={item.unit} onChange={e=>upd(item._key,'unit',e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent">
                {UNITS.map(u=><option key={u}>{u}</option>)}
              </select>
              <div className="relative">
                <input type="number" value={item.unitPrice} onChange={e=>upd(item._key,'unitPrice',e.target.value)} min="0" step="0.01" placeholder="0,00"
                  className="w-full h-9 pl-3 pr-6 rounded-md border border-stone-200 bg-white text-sm text-right mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
              </div>
              <select value={item.taxRate} onChange={e=>upd(item._key,'taxRate',e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-stone-200 bg-white text-sm mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent">
                {TAX_OPTS.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
              <div className="h-9 px-3 rounded-md bg-stone-50 border border-stone-100 flex items-center justify-end">
                <span className="text-sm mono">{fmt(item.net)}</span>
              </div>
              <button type="button" onClick={()=>setItems(p=>p.filter(r=>r._key!==item._key))} disabled={items.length<=1}
                className="w-8 h-8 flex items-center justify-center rounded text-stone-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-6 border-t border-stone-200 pt-4 flex justify-end">
          <div className="w-72 space-y-1.5">
            <TRow label="Nettobetrag"  value={`${fmt(totals.net)} €`} />
            {Object.entries(totals.groups).filter(([,v])=>v>0).sort(([a],[b])=>parseFloat(b)-parseFloat(a)).map(([rate,amount])=>(
              <TRow key={rate} label={`zzgl. ${rate}% MwSt.`} value={`${fmt(amount)} €`} muted />
            ))}
            <div className="border-t border-stone-300 pt-1.5 mt-1.5">
              <TRow label="Bruttobetrag" value={`${fmt(totals.gross)} €`} bold />
            </div>
          </div>
        </div>
      </div>

      <DocumentFormWorkflowActions
        formRef={formRef}
        isPending={isPending}
        error={state.error}
        targetId={mode === 'create' ? DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID : undefined}
        idleLabel={mode === 'create' ? 'Entwurf anlegen' : 'Änderungen speichern'}
        pendingLabel={mode === 'create' ? 'Wird angelegt…' : 'Wird gespeichert…'}
        onCancel={() => router.back()}
        preview={<InvoiceDraftPdfPreview invoiceId={invoiceId} />}
      />
    </form>
  )
}

function FD({label,name,required,defaultValue,error,hint}:{label:string;name:string;required?:boolean;defaultValue?:string;error?:string;hint?:string}){
  return(
    <div>
      <label className={`field-label${required?' field-required':''}`} htmlFor={name}>{label}</label>
      <input id={name} name={name} type="date" required={required} defaultValue={defaultValue??''}
        className={`w-full h-9 px-3 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${error?'border-red-400':'border-stone-200'}`}/>
      {error&&<p className="field-error">{error}</p>}
      {hint&&!error&&<p className="field-hint">{hint}</p>}
    </div>
  )
}
function AF({label,name,required,defaultValue,error}:{label:string;name:string;required?:boolean;defaultValue?:string;error?:string}){
  return <div><label className={`field-label${required?' field-required':''}`} htmlFor={name}>{label}</label><input id={name} name={name} required={required} defaultValue={defaultValue??''} className={`h-9 w-full rounded-md border bg-white px-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600 ${error?'border-red-400':'border-stone-200'}`} />{error&&<p className="field-error">{error}</p>}</div>
}
function TA({label,name,defaultValue}:{label:string;name:string;defaultValue?:string}){
  return(
    <div>
      <label className="field-label" htmlFor={name}>{label}</label>
      <textarea id={name} name={name} rows={3} defaultValue={defaultValue??''}
        className="w-full px-3 py-2 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none"/>
    </div>
  )
}
function TRow({label,value,bold,muted}:{label:string;value:string;bold?:boolean;muted?:boolean}){
  return(
    <div className="flex justify-between items-baseline gap-4">
      <span className={`text-sm${muted?' text-muted-foreground':bold?' font-600':''}`}>{label}</span>
      <span className={`mono text-sm tabular-nums${bold?' font-600':''}`}>{value}</span>
    </div>
  )
}
