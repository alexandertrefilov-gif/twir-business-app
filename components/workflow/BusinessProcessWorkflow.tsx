import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { OrderPdfDialog } from '@/components/orders/OrderPdfDialog'
import { OfferPdfDialog } from '@/components/offers/OfferPdfDialog'
import { ServiceReportPdfDialog } from '@/components/service-reports/ServiceReportPdfDialog'
import { DocumentPrintButton } from '@/components/documents/DocumentPrintButton'
import type { BusinessProcessData } from '@/lib/services/business-process.service'
import { deriveBusinessProcessStages, derivePurchaseOrderIndicatorState, deriveWorkflowIndicatorState, isBusinessProcessCompleted, type ProcessStageKey, type ProcessStageState, type WorkflowIndicatorState } from '@/lib/workflow/business-process'
import { DocumentLifecycleControls } from '@/components/workflow/DocumentLifecycleControls'
import { ORDER_CONFIRMATION_TYPE_LABELS, type OrderConfirmationType } from '@/types/enums'
import { isServiceReportReadyForInvoice } from '@/lib/workflow/invoice-eligibility'

interface Props {
  process: BusinessProcessData
  currentDocument: { type: ProcessStageKey; id: string }
  activeStage?: ProcessStageKey
  permissions: {
    readOffer: boolean
    readOrder: boolean
    readServiceReport: boolean
    readInvoice: boolean
    createOrder: boolean
    createServiceReport: boolean
    createInvoice: boolean
    updateOrder: boolean
    updateServiceReport: boolean
  }
  orderAction?: ReactNode
  offerCopyHref?: string
  serviceReportAction?: ReactNode
  invoiceAction?: ReactNode
  editingAction?: ReactNode
  offerLifecycle?: {
    status: string
    sentDate?: string
    actions: ReactNode
  }
  customerPurchaseOrderAction?: ReactNode
  projectAction?: ReactNode
}

const statusLabels: Record<string, string> = {
  DRAFT: 'Entwurf', SENT: 'Versendet', ACCEPTED: 'Angenommen', REJECTED: 'Abgelehnt',
  EXPIRED: 'Abgelaufen', CONVERTED_TO_ORDER: 'In Auftrag umgewandelt', OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung', COMPLETED: 'Abgeschlossen', INVOICED: 'Abgerechnet',
  CANCELLED: 'Storniert', FINALIZED: 'Finalisiert', PAID: 'Bezahlt', OVERDUE: 'Überfällig',
  PARTIALLY_PAID: 'Teilbezahlt', CREATED: 'Erstellt',
}
const invoiceTypeLabels: Record<string, string> = { CORRECTION: 'Korrekturrechnung', CANCELLATION: 'Stornorechnung', ADVANCE: 'Abschlagsrechnung', PARTIAL: 'Teilrechnung', FINAL: 'Schlussrechnung' }
const germanDateFormatter = new Intl.DateTimeFormat('de-DE')
const offerBasedStageNumber: Record<ProcessStageKey, number> = {
  offer: 1,
  order: 3,
  serviceReport: 4,
  invoice: 5,
}

const stateStyle: Record<ProcessStageState, { shell: string }> = {
  existing: { shell: 'border-stone-200 bg-white' },
  current: { shell: 'border-blue-300 bg-blue-50/60 ring-1 ring-blue-100' },
  later: { shell: 'border-stone-200 bg-stone-50/50' },
  special: { shell: 'border-amber-200 bg-amber-50/60' },
  unavailable: { shell: 'border-stone-200 bg-stone-50/40' },
}

const indicatorStyle: Record<WorkflowIndicatorState, { icon: string; className: string; label: string }> = {
  completed: { icon: '✓', className: 'border-emerald-600 bg-emerald-600 text-white', label: 'Abgeschlossen' },
  active: { icon: '●', className: 'border-blue-700 bg-blue-700 text-white', label: 'Aktueller Schritt' },
  pending: { icon: '○', className: 'border-stone-300 bg-white text-stone-500', label: 'Ausstehend' },
  blocked: { icon: '–', className: 'border-stone-300 bg-stone-100 text-stone-500', label: 'Gesperrt' },
}

function WorkflowStepIndicator({ state, connector }: { state: WorkflowIndicatorState; connector?: WorkflowIndicatorState }) {
  const style = indicatorStyle[state]
  return <>
    {connector && <span data-workflow-connector={connector} aria-hidden="true" className={`absolute -bottom-9 left-[11px] top-6 z-[5] w-px ${connector === 'completed' ? 'bg-emerald-600' : 'bg-stone-200'}`} />}
    <span aria-hidden="true" className={`absolute left-0 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-700 ${style.className}`}>{style.icon}</span>
    <span className="sr-only">{style.label}</span>
  </>
}

function connectorState(from: WorkflowIndicatorState, to: WorkflowIndicatorState): WorkflowIndicatorState {
  return from === 'completed' && to === 'completed' ? 'completed' : 'pending'
}

export function BusinessProcessWorkflow({ process, currentDocument, activeStage, permissions, orderAction, offerCopyHref, serviceReportAction, invoiceAction, editingAction, offerLifecycle, customerPurchaseOrderAction, projectAction }: Props) {
  const stages = deriveBusinessProcessStages(process)
  const processCompleted = isBusinessProcessCompleted(process)
  return (
    <div data-business-workflow-sidebar className="card-base p-6">
      {process.project
        ? <Link href={`/projects/${process.project.id}`} className="mb-4 block rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 hover:bg-blue-100">Projekt: {process.project.number} · {process.project.name}</Link>
        : projectAction && <div className="mb-4">{projectAction}</div>}
      <nav aria-label="Geschäftsvorgang">
        <p className="mb-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Workflow</p>
        <ol className="relative space-y-3">
        {stages.map((stage, index) => {
          const visualState = activeStage
            ? stage.key === activeStage
              ? 'current'
              : stage.state === 'current' ? 'later' : stage.state
            : stage.state
          const style = stateStyle[visualState]
          const indicatorState = deriveWorkflowIndicatorState(stage.key, process, visualState)
          const opened = stage.key === currentDocument.type && stage.documents.some((document) => document.id === currentDocument.id)
          const active = stage.key === activeStage
          const nextStage = stages[index + 1]
          const nextMainIndicator = nextStage ? deriveWorkflowIndicatorState(nextStage.key, process, nextStage.state) : null
          const nextIndicator = stage.key === 'offer' && offerLifecycle?.status !== 'DRAFT'
            ? (indicatorState === 'completed' ? 'completed' : 'pending')
            : stage.key === 'invoice' && processCompleted
              ? 'completed'
              : nextMainIndicator
          return (
            <Fragment key={stage.key}>
            <li className="relative min-w-0 pl-8">
              <WorkflowStepIndicator state={indicatorState} connector={nextIndicator ? connectorState(indicatorState, nextIndicator) : undefined} />
              <div className={`relative h-full min-w-0 rounded-md border p-3 ${style.shell}`}>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <p className="text-sm font-600">{process.offer ? offerBasedStageNumber[stage.key] : index + 1} {stage.label}</p>
                  {(opened || active) && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{active ? 'Aktueller Schritt' : 'Aktuell geöffnet'}</span>}
                </div>
                {stage.documents.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{stage.hint ?? (stage.state === 'current' ? 'Nächster Arbeitsschritt' : 'Noch nicht erstellt')}</p>
                ) : (
                  <div className="mt-1.5 space-y-1.5">
                    {!canReadStage(stage.key, permissions) ? (
                      <p className="text-xs text-muted-foreground">{stage.documents.length} vorhanden · Keine Leseberechtigung</p>
                    ) : stage.documents.map((document) => (
                      <div key={document.id} className="space-y-2 text-xs">
                        <div><span className="mono font-500">{document.number}</span><span className="ml-1.5 text-muted-foreground">{statusLabels[document.status] ?? document.status}{document.type && document.type !== 'STANDARD' ? ` · ${invoiceTypeLabels[document.type] ?? document.type}` : ''}</span></div>
                        <DocumentActions stageKey={stage.key} documentId={document.id} offerCopyHref={offerCopyHref} />
                        {(stage.key === 'order' || stage.key === 'serviceReport') && <DocumentLifecycle
                          stageKey={stage.key}
                          document={document}
                          canUpdate={stage.key === 'order' ? permissions.updateOrder : permissions.updateServiceReport}
                          hasCustomerPurchaseOrder={Boolean(process.customerPurchaseOrder)}
                        />}
                        {stage.key === 'invoice' && <InvoiceLifecycle status={document.status} />}
                      </div>
                    ))}
                  </div>
                )}
                {stage.key === 'order' && orderAction && <div className="mt-2">{orderAction}</div>}
                {stage.key === 'offer' && offerLifecycle?.status === 'DRAFT' && <div className="mt-3 border-t border-stone-200 pt-3">{offerLifecycle.actions}</div>}
                {stage.key === 'serviceReport' && serviceReportAction && <div className="mt-3 border-t border-blue-200 pt-3">{serviceReportAction}</div>}
                {stage.key === 'invoice' && invoiceAction && <div className="mt-3 border-t border-blue-200 pt-3">{invoiceAction}</div>}
                <StageActions
                  stageKey={stage.key}
                  stageState={stage.state}
                  primary={visualState === 'current'}
                  process={process}
                  permissions={permissions}
                  suppressOrderCreate={Boolean(orderAction)}
                  suppressServiceReportCreate={Boolean(serviceReportAction)}
                />
              </div>
            </li>
            {stage.key === 'offer' && offerLifecycle && offerLifecycle.status !== 'DRAFT' && (
              <OfferLifecycleSteps {...offerLifecycle} purchaseOrderState={derivePurchaseOrderIndicatorState(process)} />
            )}
            {stage.key === 'offer' && process.offer && ['SENT', 'ACCEPTED', 'CONVERTED_TO_ORDER'].includes(process.offer.status) && (
              <CustomerPurchaseOrderStep process={process} action={customerPurchaseOrderAction} />
            )}
            </Fragment>
          )
        })}
        {processCompleted && <WorkflowCompletionNode />}
        </ol>
      </nav>
      {editingAction && (
        <section className="mt-4 border-t border-stone-200 pt-4" aria-labelledby="workflow-editing-title">
          <h2 id="workflow-editing-title" className="mb-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">
            Bearbeitung
          </h2>
          {editingAction}
        </section>
      )}
    </div>
  )
}

function InvoiceLifecycle({ status }: { status: string }) {
  const finalized = status !== 'DRAFT'
  const sent = ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'].includes(status)
  const paid = status === 'PAID'
  const partiallyPaid = status === 'PARTIALLY_PAID'
  return <div className="space-y-1.5 pt-1 text-xs">
    <p className="text-emerald-700">✓ Erstellt</p>
    <p className={finalized ? 'text-emerald-700' : 'text-muted-foreground'}>{finalized ? '✓ Finalisiert' : '○ Noch nicht finalisiert'}</p>
    {finalized && <p className={sent ? 'text-emerald-700' : 'text-muted-foreground'}>{sent ? '✓ Versendet' : '○ Noch nicht versendet'}</p>}
    {sent && <p className={paid ? 'text-emerald-700' : partiallyPaid ? 'text-amber-800' : 'text-muted-foreground'}>{paid ? '✓ Bezahlt' : partiallyPaid ? '◐ Teilbezahlt' : '○ Zahlung offen'}</p>}
  </div>
}

function DocumentLifecycle({ stageKey, document, canUpdate, hasCustomerPurchaseOrder }: {
  stageKey: 'order' | 'serviceReport'
  document: BusinessProcessData['serviceReports'][number]
  canUpdate: boolean
  hasCustomerPurchaseOrder: boolean
}) {
  const sent = Boolean(document.sentAt)
  const confirmed = Boolean(document.confirmedAt)
  const canSend = stageKey === 'order' || document.status === 'FINALIZED'
  return <div className="space-y-1.5 pt-1 text-xs">
    <p className="text-emerald-700">✓ Erstellt</p>
    {stageKey === 'serviceReport' && <p className={document.status === 'FINALIZED' ? 'text-emerald-700' : 'text-muted-foreground'}>{document.status === 'FINALIZED' ? '✓ Finalisiert' : '○ Noch nicht finalisiert'}</p>}
    <p className={sent ? 'text-emerald-700' : 'text-muted-foreground'}>{sent ? '✓ Versendet' : '○ Noch nicht versendet'}</p>
    {sent && <p className={confirmed ? 'text-emerald-700' : 'text-amber-800'}>{confirmed
      ? document.confirmationType === 'NOT_REQUIRED' ? '✓ Bestätigung nicht erforderlich' : '✓ Bestätigt'
      : '⚠ Bestätigung offen'}</p>}
    {confirmed && document.confirmationType && <p className="text-muted-foreground">{ORDER_CONFIRMATION_TYPE_LABELS[document.confirmationType as OrderConfirmationType] ?? document.confirmationType}</p>}
    {confirmed && document.confirmationNote && <p className="whitespace-pre-wrap text-muted-foreground">{document.confirmationNote}</p>}
    {document.confirmationDocuments?.map(file => <a key={file.id} className="block break-all text-blue-700 hover:underline" href={`/api/documents/${file.id}/download?disposition=inline`} target="_blank" rel="noreferrer">Bestätigung öffnen: {file.originalName}</a>)}
    {canUpdate && canSend && <DocumentLifecycleControls type={stageKey} id={document.id} sent={sent} confirmed={confirmed}
      hasCustomerPurchaseOrder={hasCustomerPurchaseOrder} confirmationType={document.confirmationType}
      confirmedAt={document.confirmedAt?.toISOString() ?? null} confirmationNote={document.confirmationNote} />}
    {canUpdate && !canSend && <p className="text-muted-foreground">Vor Versand zuerst finalisieren.</p>}
  </div>
}

function CustomerPurchaseOrderStep({ process, action }: { process: BusinessProcessData; action?: ReactNode }) {
  const purchaseOrder = process.customerPurchaseOrder
  const present = Boolean(purchaseOrder?.documents.length)
  const awaitingDecision = process.offer?.status === 'SENT'
  const indicatorState = derivePurchaseOrderIndicatorState(process)
  return <li className="relative min-w-0 pl-8">
    <WorkflowStepIndicator state={indicatorState} connector={connectorState(indicatorState, deriveWorkflowIndicatorState('order', process, deriveBusinessProcessStages(process).find(stage => stage.key === 'order')?.state ?? 'later'))} />
    <div className={`min-w-0 rounded-md border p-3 ${present ? 'border-stone-200 bg-white' : 'border-amber-200 bg-amber-50/60'}`}>
      <p className="text-sm font-600">2 Kundenbestellung</p>
      {!present ? <>
        <p className="mt-1 text-xs text-amber-800">{awaitingDecision ? 'Noch nicht vorhanden · nach Annahme ergänzbar' : 'Bestelldokument noch nicht hinterlegt'}</p>
        {purchaseOrder?.orderNumber && <p className="mt-2 text-xs"><span className="text-muted-foreground">Bestellnummer:</span> {purchaseOrder.orderNumber}</p>}
        {purchaseOrder?.orderDate && <p className="mt-1 text-xs"><span className="text-muted-foreground">Bestelldatum:</span> {germanDateFormatter.format(new Date(purchaseOrder.orderDate))}</p>}
        {action && <div className="mt-3">{action}</div>}
      </> : <div className="mt-2 space-y-2 text-xs">
        {purchaseOrder?.orderNumber && <p><span className="text-muted-foreground">Bestellnummer:</span> {purchaseOrder.orderNumber}</p>}
        {purchaseOrder?.orderDate && <p><span className="text-muted-foreground">Bestelldatum:</span> {germanDateFormatter.format(new Date(purchaseOrder.orderDate))}</p>}
        {purchaseOrder?.documents.map(document => <div key={document.id} className="rounded border border-stone-200 bg-stone-50 p-2">
          <p className="break-all font-500">{document.originalName}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <a className="rounded border border-stone-200 bg-white px-2 py-1.5 text-center text-blue-700" href={`/api/documents/${document.id}/download?disposition=inline`} target="_blank" rel="noreferrer">Öffnen</a>
            <a className="rounded border border-stone-200 bg-white px-2 py-1.5 text-center text-blue-700" href={`/api/documents/${document.id}/download`}>Download</a>
          </div>
        </div>)}
        {action && <div className="pt-1">{action}</div>}
      </div>}
    </div>
  </li>
}

function OfferLifecycleSteps({ status, sentDate, actions, purchaseOrderState }: NonNullable<Props['offerLifecycle']> & { purchaseOrderState: WorkflowIndicatorState }) {
  const decision = status === 'ACCEPTED' || status === 'CONVERTED_TO_ORDER'
    ? { icon: '✓', title: 'Kundenentscheidung', detail: '✓ Angebot angenommen', marker: 'border-emerald-600 bg-emerald-600 text-white' }
    : status === 'REJECTED'
      ? { icon: '×', title: 'Kundenentscheidung', detail: '× Angebot abgelehnt · Prozess beendet', marker: 'border-red-600 bg-red-600 text-white' }
      : status === 'EXPIRED'
        ? { icon: '◷', title: 'Kundenentscheidung', detail: '◷ Angebot abgelaufen · Prozess beendet', marker: 'border-amber-500 bg-amber-500 text-white' }
        : null
  return (
    <>
      <li className="relative min-w-0 pl-8">
        <WorkflowStepIndicator state="completed" connector={connectorState('completed', decision ? (status === 'ACCEPTED' || status === 'CONVERTED_TO_ORDER' ? 'completed' : 'blocked') : 'active')} />
        <div className="min-w-0 rounded-md py-3">
          <p className="text-xs font-600 text-foreground">Angebot versendet</p>
          {sentDate && <p className="mt-0.5 text-xs text-muted-foreground">{sentDate}</p>}
        </div>
      </li>
      <li className="relative min-w-0 pl-8">
        <WorkflowStepIndicator
          state={decision ? (status === 'ACCEPTED' || status === 'CONVERTED_TO_ORDER' ? 'completed' : 'blocked') : 'active'}
          connector={['SENT', 'ACCEPTED', 'CONVERTED_TO_ORDER'].includes(status)
            ? connectorState(decision ? (status === 'ACCEPTED' || status === 'CONVERTED_TO_ORDER' ? 'completed' : 'blocked') : 'active', purchaseOrderState)
            : undefined}
        />
        <div className="min-w-0 rounded-md border border-stone-200 bg-white p-3">
          <p className="text-sm font-600 text-foreground">{decision?.title ?? 'Kundenentscheidung'}</p>
          {status === 'SENT' ? <div className="mt-3">{actions}</div> : decision?.detail && <p className="mt-1 text-xs text-muted-foreground">{decision.detail}</p>}
          {status === 'SENT' && <p className="mt-2 text-[10px] font-500 text-muted-foreground">Weiter nach Annahme</p>}
        </div>
      </li>
    </>
  )
}

function WorkflowCompletionNode() {
  return <li className="relative min-w-0 pl-8" data-workflow-completion>
    <WorkflowStepIndicator state="completed" />
    <div className="min-w-0 py-2.5">
      <p className="text-sm font-600 text-emerald-700">Vorgang abgeschlossen</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Alle Prozessschritte erledigt</p>
    </div>
  </li>
}

function StageActions({ stageKey, stageState, primary, process, permissions, suppressOrderCreate, suppressServiceReportCreate }: {
  stageKey: ProcessStageKey
  stageState: ProcessStageState
  primary: boolean
  process: BusinessProcessData
  permissions: Props['permissions']
  suppressOrderCreate: boolean
  suppressServiceReportCreate: boolean
}) {
  const className = `mt-2 flex min-h-9 w-full items-center justify-center rounded-md px-3 py-2 text-sm font-500 transition-colors ${primary ? 'bg-blue-700 text-white hover:bg-blue-800' : 'border border-stone-200 bg-white text-blue-700 hover:bg-stone-50'}`
  if (stageKey === 'order' && stageState === 'current' && permissions.createOrder && !suppressOrderCreate) {
    return <a href="#document-status-actions" className={className}>Auftrag erstellen</a>
  }
  if (stageKey === 'serviceReport' && !suppressServiceReportCreate && process.order && process.serviceReports.length === 0 && permissions.createServiceReport && !['CANCELLED', 'INVOICED'].includes(process.order.status)) {
    return <Link href={`/services/new?order=${process.order.id}`} className={className}>Leistungsnachweis erstellen</Link>
  }
  if (stageKey === 'invoice' && process.order && process.serviceReports.length === 1 && process.invoices.length === 0 && permissions.createInvoice && !['CANCELLED', 'INVOICED'].includes(process.order.status)) {
    const report = process.serviceReports[0]
    if (isServiceReportReadyForInvoice(report)) {
      return <Link href={`/invoices/new?order=${process.order.id}`} className={className}>Rechnung erstellen</Link>
    }
    return <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 p-2 text-xs text-muted-foreground"><p className="font-600">Gesperrt</p><p>Leistungsnachweis muss zuerst vom Kunden bestätigt werden.</p></div>
  }
  return null
}

function DocumentActions({ stageKey, documentId, offerCopyHref }: { stageKey: ProcessStageKey; documentId: string; offerCopyHref?: string }) {
  const className = 'inline-flex min-h-8 w-full items-center justify-center rounded border border-stone-200 bg-white px-2.5 py-1.5 text-center font-500 leading-tight text-blue-700 hover:bg-stone-50'
  if (stageKey === 'offer') {
    return (
      <div className="grid w-full grid-cols-2 items-start gap-1.5">
        <OfferPdfDialog offerId={documentId} />
        <Link href={documentHref(stageKey, documentId)} className={`${className} inline-flex items-center justify-center`}>Anzeigen</Link>
        <DocumentPrintButton pdfUrl={documentPdfHref(stageKey, documentId)} className={className} />
        {offerCopyHref && <Link href={offerCopyHref} className={`${className} inline-flex items-center justify-center`}>Kopieren</Link>}
      </div>
    )
  }
  if (stageKey === 'order') {
    return (
      <div className="grid w-full grid-cols-2 items-start gap-1.5">
        <OrderPdfDialog orderId={documentId} />
        <Link href={documentHref(stageKey, documentId)} className={`${className} inline-flex items-center justify-center`}>Anzeigen</Link>
        <DocumentPrintButton pdfUrl={documentPdfHref(stageKey, documentId)} className={className} />
      </div>
    )
  }
  if (stageKey === 'serviceReport') {
    return (
      <div className="grid w-full grid-cols-2 items-start gap-1.5">
        <Link href={documentHref(stageKey, documentId)} className={`${className} inline-flex items-center justify-center`}>Anzeigen</Link>
        <ServiceReportPdfDialog reportId={documentId} />
        <DocumentPrintButton pdfUrl={documentPdfHref(stageKey, documentId)} className={className} />
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={documentHref(stageKey, documentId)} className={className}>Anzeigen</Link>
    </div>
  )
}

function canReadStage(key: ProcessStageKey, permissions: Props['permissions']) {
  return key === 'offer' ? permissions.readOffer : key === 'order' ? permissions.readOrder : key === 'serviceReport' ? permissions.readServiceReport : permissions.readInvoice
}

function documentHref(key: ProcessStageKey, id: string) {
  return key === 'offer' ? `/offers/${id}` : key === 'order' ? `/orders/${id}` : key === 'serviceReport' ? `/services/${id}` : `/invoices/${id}`
}

function documentPdfHref(key: ProcessStageKey, id: string) {
  return key === 'offer' ? `/api/offers/${id}/preview` : key === 'order' ? `/api/orders/${id}/pdf` : key === 'serviceReport' ? `/api/services/${id}/pdf` : `/api/invoices/${id}/pdf`
}
