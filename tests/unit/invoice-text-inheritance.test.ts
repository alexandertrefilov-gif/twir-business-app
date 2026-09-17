import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { copyDocumentTextModules, decodeOfferText, encodeOfferText } from '@/lib/offers/rich-text'
import { InvoiceDraftSchema } from '@/lib/validators/invoice.schema'

const sourceText = encodeOfferText({
  version: 1,
  sections: [
    { id: 'first', title: 'Leistungsumfang', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Montage und Prüfung' }] }] } },
    { id: 'second', title: 'Dokumentation', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prüfbericht erstellen' }] }] } },
  ],
  positionsAfterSectionId: 'first',
  positionsEnabled: true,
})

describe('Textvererbung Leistungsnachweis → Rechnung', () => {
  it('kopiert Textmodule in gleicher Reihenfolge ohne leistungsbezogene Positionsmetadaten', () => {
    const copied = copyDocumentTextModules(sourceText)
    const document = decodeOfferText(copied)
    expect(document.sections.map(section => section.title)).toEqual(['Leistungsumfang', 'Dokumentation'])
    expect(document.positionsAfterSectionId).toBeUndefined()
    expect(document.positionsEnabled).toBeUndefined()
  })

  it('erzeugt einen unabhängigen Rechnungsstand, der separat gekürzt werden kann', () => {
    const copied = copyDocumentTextModules(sourceText)!
    const invoiceDocument = decodeOfferText(copied)
    invoiceDocument.sections.splice(1, 1)
    expect(decodeOfferText(sourceText).sections).toHaveLength(2)
    expect(invoiceDocument.sections).toHaveLength(1)
  })

  it('akzeptiert strukturierte Rechnungs-Textmodule über die bestehende Entwurfsvalidierung', () => {
    const result = InvoiceDraftSchema.safeParse({
      customerId: '11111111-1111-4111-8111-111111111111',
      invoiceRecipientSource: 'CUSTOMER',
      invoiceDate: '2026-09-01',
      introText: copyDocumentTextModules(sourceText),
      items: [{ position: 1, description: 'Montage', quantity: 1, unit: 'Std.', unitPrice: 100, taxRate: 19 }],
    })
    expect(result.success).toBe(true)
  })

  it('verwendet beim Erstellen die Beschreibung des Leistungsnachweises als Rechnungs-Snapshot', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/(dashboard)/invoices/new/page.tsx'), 'utf8')
    expect(page).toContain('description: true')
    expect(page).toContain('copyDocumentTextModules(serviceReport?.description)')
    expect(page).toContain("orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }], take: 1")
    expect(page).toContain('selectedOrder?.serviceReports[0] ?? null')
    expect(page).not.toContain('serviceReports.length === 1')
  })
})
