import type { BusinessProcessData } from '@/lib/services/business-process.service'
import { isServiceReportReadyForInvoice } from '@/lib/workflow/invoice-eligibility'

export type ProcessStageKey = 'offer' | 'order' | 'serviceReport' | 'invoice'
export type ProcessStageState = 'existing' | 'current' | 'later' | 'special' | 'unavailable'
export type WorkflowIndicatorState = 'completed' | 'active' | 'pending' | 'blocked'

export interface ProcessStage {
  key: ProcessStageKey
  label: string
  state: ProcessStageState
  documents: BusinessProcessData['serviceReports']
  hint?: string
}

const offerSpecial = new Set(['REJECTED', 'EXPIRED'])
const invoiceSpecial = new Set(['CANCELLED', 'CORRECTED'])
const invoiceTypeSpecial = new Set(['CORRECTION', 'CANCELLATION'])

export function isBusinessProcessStageCompleted(key: ProcessStageKey, data: BusinessProcessData): boolean {
  if (key === 'offer') return data.offer?.status === 'CONVERTED_TO_ORDER'
  if (key === 'order') return Boolean(data.order?.sentAt && data.order.confirmedAt)
  if (key === 'serviceReport') {
    return data.serviceReports.length === 1 && isServiceReportReadyForInvoice(data.serviceReports[0])
  }
  return data.invoices.length > 0 && data.invoices.every(invoice => invoice.status === 'PAID')
}

export function deriveWorkflowIndicatorState(
  key: ProcessStageKey,
  data: BusinessProcessData,
  stageState: ProcessStageState,
): WorkflowIndicatorState {
  if (isBusinessProcessStageCompleted(key, data)) return 'completed'
  if (stageState === 'special' || stageState === 'unavailable') return 'blocked'
  if (stageState === 'current') return 'active'
  return 'pending'
}

export function derivePurchaseOrderIndicatorState(data: BusinessProcessData): WorkflowIndicatorState {
  if (data.customerPurchaseOrder?.documents.length) return 'completed'
  if (!data.offer || ['REJECTED', 'EXPIRED'].includes(data.offer.status)) return 'blocked'
  return data.offer.status === 'ACCEPTED' || data.offer.status === 'CONVERTED_TO_ORDER' ? 'active' : 'pending'
}

export function isBusinessProcessCompleted(data: BusinessProcessData): boolean {
  const offerPathComplete = !data.offer || (
    isBusinessProcessStageCompleted('offer', data)
    && derivePurchaseOrderIndicatorState(data) === 'completed'
  )
  return offerPathComplete
    && isBusinessProcessStageCompleted('order', data)
    && isBusinessProcessStageCompleted('serviceReport', data)
    && isBusinessProcessStageCompleted('invoice', data)
}

export function deriveBusinessProcessStages(data: BusinessProcessData): ProcessStage[] {
  const haltedOffer = data.offer ? offerSpecial.has(data.offer.status) : false
  const haltedOrder = data.order?.status === 'CANCELLED'
  const ambiguousReports = data.serviceReports.length > 1
  const activeInvoices = data.invoices.filter((invoice) => !invoiceSpecial.has(invoice.status))
  const hasSpecialInvoice = data.invoices.some((invoice) => invoiceSpecial.has(invoice.status) || invoiceTypeSpecial.has(invoice.type ?? ''))
  let next: ProcessStageKey | null = null

  if (haltedOffer || haltedOrder || ambiguousReports) next = null
  else if (data.offer && !data.order) next = data.offer.status === 'ACCEPTED' ? 'order' : 'offer'
  else if (data.order && data.serviceReports.length === 0) next = 'serviceReport'
  else if (data.order && activeInvoices.length === 0) {
    const report = data.serviceReports[0]
    next = report && isServiceReportReadyForInvoice(report) ? 'invoice' : 'serviceReport'
  }

  const offerDocuments = data.offer ? [data.offer] : []
  const orderDocuments = data.order ? [data.order] : []
  const stages: ProcessStage[] = [
    { key: 'offer', label: 'Angebot', documents: offerDocuments, state: 'later' },
    { key: 'order', label: 'Auftrag', documents: orderDocuments, state: 'later' },
    { key: 'serviceReport', label: 'Leistungsnachweis', documents: data.serviceReports, state: 'later' },
    { key: 'invoice', label: data.invoices.length === 1 ? 'Rechnung' : 'Rechnungen', documents: data.invoices, state: 'later' },
  ]

  for (const stage of stages) {
    if (!data.offer && !data.order && data.invoices.length > 0 && stage.key !== 'invoice') {
      stage.state = 'unavailable'; stage.hint = 'Rechnung ohne Auftragsbezug'; continue
    }
    if (stage.key === 'offer' && !data.offer && data.order) {
      stage.state = 'unavailable'; stage.hint = 'Direktauftrag ohne Angebot'; continue
    }
    if ((haltedOffer && stage.key === 'offer') || (haltedOrder && stage.key === 'order')) {
      stage.state = 'special'; continue
    }
    if (ambiguousReports && stage.key === 'serviceReport') {
      stage.state = 'special'; stage.hint = 'Mehrfachdaten müssen fachlich bereinigt werden'; continue
    }
    if (ambiguousReports && stage.key === 'invoice') {
      stage.state = 'unavailable'; stage.hint = 'Rechnung erst nach Datenbereinigung erstellen'; continue
    }
    if (stage.key === 'invoice' && hasSpecialInvoice) {
      stage.state = 'special'; continue
    }
    if (stage.key === next) { stage.state = 'current'; continue }
    if (stage.documents.length > 0) { stage.state = 'existing'; continue }
    if ((haltedOffer && stage.key !== 'offer') || (haltedOrder && ['serviceReport', 'invoice'].includes(stage.key))) {
      stage.state = 'unavailable'; stage.hint = 'Prozess beendet'; continue
    }
    stage.state = 'later'
  }
  return stages
}
