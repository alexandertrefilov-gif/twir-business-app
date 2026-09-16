import { describe, expect, it } from 'vitest'
import { deriveBusinessProcessStages, derivePurchaseOrderIndicatorState, deriveWorkflowIndicatorState, isBusinessProcessCompleted, isBusinessProcessStageCompleted } from '@/lib/workflow/business-process'
import type { BusinessProcessData } from '@/lib/services/business-process.service'
import { isOfferTransitionAllowed } from '@/types/enums'

const offer = { id: 'offer-1', number: 'AN-1', status: 'ACCEPTED' }
const order = { id: 'order-1', number: 'AU-1', status: 'COMPLETED' }
const report = { id: 'report-1', number: 'LN-1', status: 'FINALIZED', finalizedAt: new Date(), sentAt: new Date(), confirmedAt: new Date() }
const invoice = { id: 'invoice-1', number: 'RE-1', status: 'FINALIZED', type: 'STANDARD' }

const data = (partial: Partial<BusinessProcessData>): BusinessProcessData => ({
  offer: null, order: null, serviceReports: [], invoices: [], ...partial,
})
const states = (process: BusinessProcessData) => Object.fromEntries(
  deriveBusinessProcessStages(process).map((stage) => [stage.key, stage.state]),
)

describe('einheitlicher Geschäftsvorgang-Navigator', () => {
  it('trennt Versand, Kundenentscheidung und Folgeobjekte fachlich', () => {
    expect(isOfferTransitionAllowed('DRAFT', 'SENT')).toBe(true)
    expect(isOfferTransitionAllowed('SENT', 'ACCEPTED')).toBe(true)
    expect(isOfferTransitionAllowed('SENT', 'REJECTED')).toBe(true)
    expect(isOfferTransitionAllowed('SENT', 'CONVERTED_TO_ORDER')).toBe(false)

    const sent = data({ offer: { ...offer, status: 'SENT' } })
    expect(sent.customerPurchaseOrder).toBeUndefined()
    expect(sent.order).toBeNull()
    expect(states(sent).offer).toBe('current')
  })

  it('markiert bei nur angenommenem Angebot den Auftrag als nächsten Schritt', () => {
    expect(states(data({ offer }))).toEqual({ offer: 'existing', order: 'current', serviceReport: 'later', invoice: 'later' })
  })

  it('markiert bei Angebot und Auftrag den Leistungsnachweis als nächsten Schritt', () => {
    expect(states(data({ offer, order }))).toEqual({ offer: 'existing', order: 'existing', serviceReport: 'current', invoice: 'later' })
  })

  it('markiert ein noch nicht angenommenes Angebot selbst als aktuellen Schritt', () => {
    expect(states(data({ offer: { ...offer, status: 'SENT' } }))).toEqual({ offer: 'current', order: 'later', serviceReport: 'later', invoice: 'later' })
  })

  it('markiert einen laufenden Auftrag ohne Leistung weiter als aktuellen Auftrag', () => {
    expect(states(data({ offer, order: { ...order, status: 'IN_PROGRESS' } }))).toEqual({ offer: 'existing', order: 'existing', serviceReport: 'current', invoice: 'later' })
  })

  it('markiert nach vorhandenem Leistungsnachweis die Rechnung als nächsten Schritt', () => {
    expect(states(data({ offer, order, serviceReports: [report] })).invoice).toBe('current')
  })

  it('berechnet den Abschluss jedes Hauptschritts aus seinem vollständigen Lebenszyklus', () => {
    const completeProcess = data({
      offer: { ...offer, status: 'CONVERTED_TO_ORDER' },
      order: { ...order, sentAt: new Date(), confirmedAt: new Date() },
      serviceReports: [report],
      invoices: [{ ...invoice, status: 'PAID' }],
      customerPurchaseOrder: { id: 'po-1', orderNumber: null, orderDate: null, documents: [{ id: 'doc-1', originalName: 'Bestellung.pdf', mimeType: 'application/pdf' }] },
    })
    for (const key of ['offer', 'order', 'serviceReport', 'invoice'] as const) {
      expect(isBusinessProcessStageCompleted(key, completeProcess)).toBe(true)
      expect(deriveWorkflowIndicatorState(key, completeProcess, 'existing')).toBe('completed')
    }
    expect(derivePurchaseOrderIndicatorState(completeProcess)).toBe('completed')
    expect(isBusinessProcessCompleted(completeProcess)).toBe(true)
  })

  it('wertet bloße Existenz nicht als Abschluss', () => {
    const incomplete = data({
      offer,
      order: { ...order, sentAt: null, confirmedAt: null },
      serviceReports: [{ ...report, confirmedAt: null }],
      invoices: [invoice],
    })
    for (const key of ['offer', 'order', 'serviceReport', 'invoice'] as const) {
      expect(isBusinessProcessStageCompleted(key, incomplete)).toBe(false)
      expect(deriveWorkflowIndicatorState(key, incomplete, 'existing')).toBe('pending')
    }
    expect(isBusinessProcessCompleted(incomplete)).toBe(false)
  })

  it.each([
    { invoiceStatus: 'DRAFT', label: 'Rechnungsentwurf' },
    { invoiceStatus: 'FINALIZED', label: 'finalisierte Rechnung' },
    { invoiceStatus: 'SENT', label: 'versendete offene Rechnung' },
    { invoiceStatus: 'PARTIALLY_PAID', label: 'teilbezahlte Rechnung' },
  ])('zeigt für $label keinen Gesamtabschluss', ({ invoiceStatus }) => {
    const process = data({
      offer: { ...offer, status: 'CONVERTED_TO_ORDER' },
      order: { ...order, sentAt: new Date(), confirmedAt: new Date() },
      serviceReports: [report],
      invoices: [{ ...invoice, status: invoiceStatus }],
      customerPurchaseOrder: { id: 'po-1', orderNumber: null, orderDate: null, documents: [{ id: 'doc-1', originalName: 'Bestellung.pdf', mimeType: 'application/pdf' }] },
    })
    expect(isBusinessProcessCompleted(process)).toBe(false)
  })

  it('unterscheidet aktive und gesperrte Hauptschritte', () => {
    const process = data({ offer: { ...offer, status: 'SENT' } })
    expect(deriveWorkflowIndicatorState('offer', process, 'current')).toBe('active')
    expect(deriveWorkflowIndicatorState('order', process, 'unavailable')).toBe('blocked')
    expect(derivePurchaseOrderIndicatorState(process)).toBe('pending')
  })

  it.each([
    { ...report, status: 'DRAFT' },
    { ...report, finalizedAt: null },
    { ...report, sentAt: null },
    { ...report, confirmedAt: null },
  ])('hält die Rechnung bis zum vollständig abgeschlossenen Leistungsnachweis gesperrt', incompleteReport => {
    const result = states(data({ offer, order, serviceReports: [incompleteReport] }))
    expect(result.serviceReport).toBe('current')
    expect(result.invoice).toBe('later')
  })

  it('stellt einen vollständigen Prozess vollständig als vorhanden dar', () => {
    expect(Object.values(states(data({ offer, order, serviceReports: [report], invoices: [invoice] }))))
      .toEqual(['existing', 'existing', 'existing', 'existing'])
  })

  it('behandelt Direktaufträge ohne erfundenes Angebot', () => {
    const stages = deriveBusinessProcessStages(data({ order }))
    expect(stages[0]).toMatchObject({ state: 'unavailable', hint: 'Direktauftrag ohne Angebot' })
    expect(stages[2].state).toBe('current')
  })

  it('erfindet bei einer freien Rechnung keinen vorgelagerten Vorgang', () => {
    const stages = deriveBusinessProcessStages(data({ invoices: [invoice] }))
    expect(stages.slice(0, 3).every((stage) => stage.state === 'unavailable')).toBe(true)
    expect(stages[3].state).toBe('existing')
  })

  it('blockiert den Rechnungsübergang bei historischen Mehrfach-Leistungsnachweisen', () => {
    const stages = deriveBusinessProcessStages(data({
      offer, order,
      serviceReports: [report, { ...report, id: 'report-2', number: 'LN-2' }],
      invoices: [invoice, { ...invoice, id: 'invoice-2', number: 'RE-2' }],
    }))
    expect(stages.find((stage) => stage.key === 'serviceReport')?.documents).toHaveLength(2)
    expect(stages.find((stage) => stage.key === 'invoice')?.documents).toHaveLength(2)
    expect(stages.find((stage) => stage.key === 'serviceReport')).toMatchObject({ state: 'special' })
    expect(stages.find((stage) => stage.key === 'invoice')).toMatchObject({ state: 'unavailable' })
  })

  it('kennzeichnet Storno und Korrektur als Sonderstatus', () => {
    const corrected = { ...invoice, status: 'CORRECTED', type: 'STANDARD' }
    expect(states(data({ order, invoices: [corrected] })).invoice).toBe('special')
    expect(states(data({ order, invoices: [{ ...invoice, type: 'CANCELLATION' }] })).invoice).toBe('special')
  })
})
