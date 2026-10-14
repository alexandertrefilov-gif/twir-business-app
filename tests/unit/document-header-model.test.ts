import { describe, expect, it } from 'vitest'
import { buildBusinessDocumentHeader, type HeaderPermissions } from '@/lib/workflow/document-header'
import type { BusinessProcessData } from '@/lib/services/business-process.service'

const all: HeaderPermissions = {
  readOffer: true, readOrder: true, readServiceReport: true, readInvoice: true,
  readDocument: true, readProject: true, readCustomer: true,
}
const none: HeaderPermissions = {
  readOffer: false, readOrder: false, readServiceReport: false, readInvoice: false,
  readDocument: false, readProject: false, readCustomer: false,
}
const customer = { id: 'c1', name: 'Kunde AG', street: 'Weg', houseNumber: '1', postalCode: '70000', city: 'Stuttgart' }

function process(overrides: Partial<BusinessProcessData> = {}): BusinessProcessData {
  return {
    project: { id: 'p1', number: 'PR-1', name: 'Projekt' },
    offer: { id: 'o1', number: 'AN-1', status: 'CONVERTED_TO_ORDER' },
    order: { id: 'a1', number: 'AU-1', status: 'OPEN', confirmationDocuments: [{ id: 'd2', originalName: 'Annahme.pdf', mimeType: 'application/pdf' }] },
    serviceReports: [{ id: 's1', number: 'LN-1', status: 'DRAFT' }],
    invoices: [{ id: 'i1', number: 'RE-1', status: 'DRAFT' }],
    customerPurchaseOrder: {
      id: 'k1', orderNumber: ' PO-4711 ', orderDate: new Date('2026-09-01'),
      documents: [{ id: 'd1', originalName: 'Bestellung.pdf', mimeType: 'application/pdf' }],
    },
    ...overrides,
  }
}

const build = (current: 'offer' | 'order' | 'serviceReport', p: BusinessProcessData, permissions: HeaderPermissions) =>
  buildBusinessDocumentHeader({
    current, customer, process: p, permissions,
    dates: [{ label: 'Datum', value: new Date('2026-09-10') }, { label: 'Leer', value: null }],
  })

describe('WF-1A Dokumentkopf-Modell', () => {
  it('formatiert Daten und lässt leere Felder weg', () => {
    const model = build('order', process(), all)
    expect(model.fields).toEqual([{ label: 'Datum', value: '10.09.2026' }])
  })

  it('zeigt Kundenbestellnummer und -datum', () => {
    const model = build('offer', process(), all)
    expect(model.customerOrderNumber).toBe('PO-4711')
    expect(model.customerOrderDate).toBe('01.09.2026')
  })

  it('verträgt fehlende Kundenbestellung', () => {
    const model = build('offer', process({ customerPurchaseOrder: null }), all)
    expect(model.customerOrderNumber).toBeNull()
    expect(model.customerOrderDate).toBeNull()
    expect(model.documents.filter((d) => d.group === 'Kundenbestellung')).toHaveLength(0)
  })

  it('verträgt Bestellung ohne Nummer/Datum', () => {
    const model = build('offer', process({ customerPurchaseOrder: { id: 'k', orderNumber: '  ', orderDate: null, documents: [] } }), all)
    expect(model.customerOrderNumber).toBeNull()
    expect(model.customerOrderDate).toBeNull()
  })

  it('verlinkt Bezüge nur mit Leserecht und lässt das aktuelle Dokument weg', () => {
    const model = build('order', process(), all)
    expect(model.references.map((r) => [r.label, r.href])).toEqual([
      ['Angebotsbezug', '/offers/o1'], ['Leistungsnachweis', '/services/s1'], ['Rechnung', '/invoices/i1'],
    ])
    expect(model.customerHref).toBe('/customers/c1')
    expect(model.project?.href).toBe('/projects/p1')
  })

  it('erweitert ohne Leserechte keine Sichtbarkeit', () => {
    const model = build('order', process(), none)
    expect(model.references).toEqual([])
    expect(model.project).toBeNull()
    expect(model.documents).toEqual([])
    expect(model.customerHref).toBeNull()
  })

  it('behält den Auftragsbezug im Leistungsnachweis ohne Link', () => {
    const model = build('serviceReport', process(), { ...none, readServiceReport: true })
    expect(model.references).toEqual([{ label: 'Auftrag', number: 'AU-1', href: null }])
  })

  it('verlinkt Dokumente nur mit Dokument-Leserecht über die bestehende Download-Route', () => {
    const model = build('offer', process(), { ...none, readDocument: true })
    expect(model.documents.map((d) => d.href)).toEqual([
      '/api/documents/d1/download?disposition=inline',
      '/api/documents/d2/download?disposition=inline',
    ])
  })
})
