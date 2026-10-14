import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BusinessDocumentMeta, DocumentMetaItem } from '@/components/documents/BusinessDocumentMeta'
import { buildBusinessDocumentHeader, type HeaderPermissions } from '@/lib/workflow/document-header'
import { buildInvoiceHeaderFields, buildInvoiceRecipient } from '@/lib/workflow/invoice-header'
import type { BusinessProcessData } from '@/lib/services/business-process.service'

const all: HeaderPermissions = {
  readOffer: true, readOrder: true, readServiceReport: true, readInvoice: true,
  readDocument: true, readProject: true, readCustomer: true,
}
const none: HeaderPermissions = {
  readOffer: false, readOrder: false, readServiceReport: false, readInvoice: false,
  readDocument: false, readProject: false, readCustomer: false,
}

const baseProcess: BusinessProcessData = {
  project: { id: 'p1', number: 'PR-1', name: 'Projekt' },
  offer: { id: 'o1', number: 'AN-1', status: 'CONVERTED_TO_ORDER' },
  order: { id: 'a1', number: 'AU-1', status: 'OPEN' },
  serviceReports: [{ id: 's1', number: 'LN-1', status: 'FINALIZED' }],
  invoices: [
    { id: 'i1', number: 'RE-1', status: 'FINALIZED', type: 'STANDARD' },
    { id: 'i2', number: 'RE-2', status: 'FINALIZED', type: 'CANCELLATION' },
  ],
  customerPurchaseOrder: { id: 'k1', orderNumber: 'PO-1', orderDate: new Date('2026-09-01T12:00:00'), documents: [] },
}

function render(permissions: HeaderPermissions, snapshot: unknown, process: BusinessProcessData = baseProcess) {
  const model = buildBusinessDocumentHeader({
    current: 'invoice', currentInvoiceId: 'i1',
    customer: { id: 'c1', name: 'Kunde AG' },
    recipient: buildInvoiceRecipient(snapshot),
    process, permissions, dates: [],
    extraFields: buildInvoiceHeaderFields({ invoiceDate: new Date('2026-10-01T12:00:00') }),
  })
  return renderToStaticMarkup(
    <BusinessDocumentMeta model={model} leadingItems={<DocumentMetaItem label="Status"><span>Finalisiert</span></DocumentMetaItem>} />,
  )
}

const billing = {
  recipientSource: 'BILLING', name: 'Buchhaltung GmbH', additional: 'Abt. 2', contactName: 'Anna Test',
  email: 're@example.de', street: 'Rechnungsweg', houseNumber: '2', postalCode: '70372', city: 'Stuttgart',
  country: 'DE', vatId: 'DE123',
}

describe('WF-1B Kopfkomponente mit Rechnungsadresse', () => {
  it('zeigt Kunde und Rechnungsadresse getrennt und kennzeichnet die Quelle', () => {
    const html = render(all, billing)
    expect(html).toContain('Kunde AG')
    expect(html).toContain('href="/customers/c1"')
    expect(html).toContain('data-testid="business-document-recipient"')
    expect(html).toContain('Rechnungsadresse')
    expect(html).toContain('Hinterlegte Rechnungsadresse')
    expect(html).toContain('Buchhaltung GmbH')
    expect(html).toContain('Rechnungsweg 2')
    expect(html).toContain('70372 Stuttgart')
    expect(html).toContain('USt-IdNr.: DE123')
    // Die Rechnungsadresse steht nicht im Kunden-Block und wird nicht als Kundenadresse bezeichnet.
    const kunde = html.slice(html.indexOf('Kunde</dt>'), html.indexOf('data-testid="business-document-recipient"'))
    expect(kunde).not.toContain('Rechnungsweg')
    expect(kunde).not.toContain('Buchhaltung GmbH')
  })

  it('zeigt Status, Datumsfelder, Kundenbestellung, Bezüge, Projekt und weitere Rechnungen', () => {
    const html = render(all, billing)
    for (const text of ['Status', 'Finalisiert', 'Rechnungsdatum', '01. Oktober 2026', 'Kundenbestellnummer', 'PO-1', 'Angebotsbezug', 'AN-1', 'Auftrag', 'AU-1', 'Leistungsnachweis', 'LN-1', 'Projekt', 'PR-1', 'Weitere Rechnung', 'RE-2 · Stornorechnung']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('href="/invoices/i2"')
    expect(html).not.toContain('href="/invoices/i1"')
  })

  it('erzeugt ohne Leserechte keine Links auf Ressourcen', () => {
    const html = render(none, billing)
    expect(html).not.toMatch(/href="\/(customers|offers|orders|services|invoices|projects)\//)
    expect(html).toContain('Kunde AG')
    expect(html).not.toContain('AN-1')
    expect(html).not.toContain('PR-1')
    expect(html).not.toContain('RE-2')
  })

  it('lässt fehlende optionale Teile vollständig weg (keine leeren Zeilen, keine Platzhalter)', () => {
    const bare: BusinessProcessData = { project: null, offer: null, order: null, serviceReports: [], invoices: [{ id: 'i1', number: 'Rechnungsentwurf', status: 'DRAFT' }] }
    const html = render(all, { recipientSource: 'CUSTOMER', name: 'Nur Name' }, bare)
    expect(html).not.toMatch(/undefined|null|NaN/)
    expect(html).not.toContain('>—<')
    expect(html).not.toContain('Projekt')
    expect(html).not.toContain('Kundenbestellnummer')
    expect(html).not.toContain('Angebotsbezug')
    expect(html).not.toContain('Weitere Rechnung')
    expect(html).not.toContain('<address')
    expect(html).toContain('Kundenadresse')
  })

  it('zeigt ohne Snapshot keinen Rechnungsadress-Block', () => {
    const html = render(all, null)
    expect(html).not.toContain('Rechnungsadresse')
    expect(html).not.toContain('business-document-recipient')
  })

  it('bleibt ohne Rechnungsadresse und leadingItems für andere Seiten unverändert', () => {
    const model = buildBusinessDocumentHeader({
      current: 'order',
      customer: { id: 'c1', name: 'Kunde AG', street: 'Weg', houseNumber: '1', postalCode: '70000', city: 'Stuttgart' },
      process: baseProcess, permissions: all,
      dates: [{ label: 'Auftragsdatum', value: new Date('2026-09-10T12:00:00') }],
    })
    const html = renderToStaticMarkup(<BusinessDocumentMeta model={model} />)
    expect(html).not.toContain('Rechnungsadresse')
    expect(html).toContain('Weg 1')
    expect(html).toContain('Auftragsdatum')
    expect(html).toContain('RE-1')
  })
})
