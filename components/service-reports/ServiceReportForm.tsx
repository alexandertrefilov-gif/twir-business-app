'use client'
// components/service-reports/ServiceReportForm.tsx

import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RichTextSectionsEditor } from '@/components/offers/RichTextSectionsEditor'
import { ServiceReportPositionsEditor, type ServiceReportPositionValue } from '@/components/service-reports/ServiceReportPositionsEditor'
import { ServiceReportPdfPreview } from '@/components/service-reports/ServiceReportPdfPreview'
import type { ActionState } from '@/app/(dashboard)/services/actions'
import type { ServiceReportItemInput } from '@/lib/validators/service-report.schema'
import { decodeOfferText } from '@/lib/offers/rich-text'
import { DocumentFormWorkflowActions } from '@/components/documents/DocumentFormWorkflowActions'

interface OrderOption { id: string; orderNumber: string; title: string | null; customerName?: string; contactName?: string }

interface ServiceReportFormProps {
  mode:     'create' | 'edit'
  orders:   OrderOption[]
  defaults?: Partial<{
    orderId:     string
    title:       string
    description: string
    reportDate:  string
    items:       ServiceReportPositionValue[]
  }>
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  lockOrder?: boolean
  sourceOfferNumber?: string
  reportId?: string
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const INIT: ActionState = {}
const FORM_ID = 'service-report-form'
const WORKFLOW_ACTIONS_ID = 'service-report-workflow-actions'

export function ServiceReportForm({
  mode, orders, defaults = {}, action, lockOrder, sourceOfferNumber, reportId,
}: ServiceReportFormProps) {
  const [state, formAction, isPending] = useActionState(action, INIT)
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  const [title, setTitle] = useState(defaults.title ?? '')
  const [description, setDescription] = useState(defaults.description ?? '')
  const [selectedOrderId, setSelectedOrderId] = useState(defaults.orderId ?? '')
  const [reportDate, setReportDate] = useState(defaults.reportDate ?? todayStr())
  const [previewItems, setPreviewItems] = useState<ServiceReportItemInput[]>([])
  const [positionDefaults, setPositionDefaults] = useState(defaults.items)
  const positionsHaveData = previewItems.some((item) =>
    item.description.trim() || item.notes?.trim() || item.unitPrice > 0,
  ) || Boolean(positionDefaults?.some((item) =>
    item.description.trim() || item.notes.trim() || Number.parseFloat(item.unitPrice) > 0,
  ))

  const fe = state.fieldErrors ?? {}

  return (
    <form ref={formRef} id={FORM_ID} action={formAction} className="w-full min-w-0 space-y-4">
      {state.error && (
        <div className="flex items-start gap-2 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/></svg>
          {state.error}
        </div>
      )}

      {/* ── Header ── */}
      <section className="form-section">
        <h2 className="mb-4 text-sm font-600 text-foreground">Nachweis-Kopfdaten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Auftrag */}
          <div className="sm:col-span-2">
            <label className="field-label field-required" htmlFor="orderId">Auftrag</label>
            {lockOrder ? (
              <>
                <input type="hidden" name="orderId" value={selectedOrderId} />
                <div className="flex min-h-9 flex-wrap items-center rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-muted-foreground">
                  {orders.find((o) => o.id === defaults.orderId)?.orderNumber}
                  <span className="ml-2 opacity-60">{orders.find((o) => o.id === defaults.orderId)?.title ?? ''}</span>
                  {orders.find((o) => o.id === defaults.orderId)?.customerName && <span className="ml-2 text-xs text-stone-400">· {orders.find((o) => o.id === defaults.orderId)?.customerName}</span>}
                  {orders.find((o) => o.id === defaults.orderId)?.contactName && <span className="ml-2 text-xs text-stone-400">· Ansprechpartner: {orders.find((o) => o.id === defaults.orderId)?.contactName}</span>}
                </div>
              </>
            ) : (
              <select id="orderId" name="orderId" required value={selectedOrderId} onChange={(event) => {
                const orderId = event.target.value
                setSelectedOrderId(orderId)
                if (mode === 'create') router.push(orderId ? `/services/new?order=${orderId}` : '/services/new')
              }}
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
              value={reportDate} onChange={(event) => setReportDate(event.target.value)}
              className={`w-full h-9 px-3 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${fe.reportDate ? 'border-red-400' : 'border-stone-200'}`} />
            {fe.reportDate && <p className="field-error">{fe.reportDate[0]}</p>}
          </div>

          {/* Titel */}
          <div>
            <label className="field-label" htmlFor="title">Bezeichnung</label>
            <input id="title" name="title" type="text" value={title} onChange={(event) => setTitle(event.target.value)}
              placeholder="z.B. Wartung Woche 42"
              className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
          </div>

        </div>
      </section>

      <section className="min-w-0">
        {mode === 'create' && lockOrder && (
          <p className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Der Inhalt wurde vollständig aus {sourceOfferNumber ? `dem Angebot ${sourceOfferNumber}` : 'dem Auftrag'} übernommen. Passen Sie ihn an die tatsächlich ausgeführten Leistungen an und entfernen Sie nicht benötigte Bereiche.
          </p>
        )}
        <RichTextSectionsEditor name="description" label="Leistungsumfang" defaultValue={description}
          placeholder="Ausgeführte Arbeiten beschreiben …" onValueChange={setDescription} removableSections documentLayout
          embeddedPositions={<ServiceReportPositionsEditor defaults={positionDefaults} error={fe.items?.[0]} onItemsChange={setPreviewItems} />}
          embeddedPositionsHasData={positionsHaveData}
          onEmbeddedPositionsRemoved={() => {
            setPositionDefaults(undefined)
            setPreviewItems([])
          }} />
      </section>

      <DocumentFormWorkflowActions
        formRef={formRef}
        isPending={isPending}
        error={state.error}
        targetId={mode === 'create' ? WORKFLOW_ACTIONS_ID : undefined}
        idleLabel={mode === 'create' ? 'Leistungsnachweis erstellen' : 'Änderungen speichern'}
        pendingLabel={mode === 'create' ? 'Wird gespeichert…' : 'Wird aktualisiert…'}
        onCancel={() => router.back()}
        preview={(
          <ServiceReportPdfPreview
            draft={{ reportId, orderId: selectedOrderId, title, description, reportDate, items: decodePositionsEnabled(description) ? previewItems : [] }}
            className="w-full px-3"
          />
        )}
      />

    </form>
  )
}

function decodePositionsEnabled(value: string): boolean {
  return decodeOfferText(value).positionsEnabled !== false
}
