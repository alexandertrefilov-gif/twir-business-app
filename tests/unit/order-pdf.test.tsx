import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  EMPLOYEE_ORDER_PDF_OPTIONS,
  FULL_ORDER_PDF_OPTIONS,
  isPriceFreeOrderPdf,
  parseOrderPdfOptions,
} from '@/lib/validators/order-pdf.schema'
import {
  getOrderPdfColumns,
  renderOrderPdf,
  type OrderPdfData,
} from '@/lib/pdf-templates/order.template'
import { OFFER_RICH_PARAGRAPH_STYLE } from '@/lib/pdf-templates/offer.template'
import { encodeOfferText, type OfferTextDocument } from '@/lib/offers/rich-text'

const data: OrderPdfData = {
  orderNumber: 'AU-2026-0001',
  orderDate: '19.08.2026',
  title: 'Montageauftrag',
  options: EMPLOYEE_ORDER_PDF_OPTIONS,
  company: { companyName: 'TWIR GmbH', street: 'Werkstraße', houseNumber: '1', postalCode: '70173', city: 'Stuttgart' },
  customer: { name: 'Beispiel AG', street: 'Kundenweg', houseNumber: '2', postalCode: '73733', city: 'Esslingen' },
  items: [{ position: 1, description: 'Produktionsreifeprüfungsanforderungen', quantity: 3, unit: 'Std.' }],
}

describe('Auftrags-PDF', () => {
  it('verwendet für Beschreibungen direkt den kompakten Angebotsrenderer', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/order.template.tsx'), 'utf8')
    expect(source).toContain('<OfferRichTextPdf value={content.before} />')
    expect(source).toContain('<OfferRichTextPdf value={content.after} />')
    expect(source).toContain('content.positionsEnabled && data.options.showItems')
    expect(OFFER_RICH_PARAGRAPH_STYLE).toMatchObject({
      fontSize: 11,
      lineHeight: 1.18,
      marginBottom: 5,
    })
  })

  it('entfernt im Mitarbeiter-Preset alle Preis-, Steuer- und Summenspalten', () => {
    expect(isPriceFreeOrderPdf(EMPLOYEE_ORDER_PDF_OPTIONS)).toBe(true)
    expect(getOrderPdfColumns(EMPLOYEE_ORDER_PDF_OPTIONS).map((column) => column.key))
      .toEqual(['position', 'description', 'quantity', 'unit'])
  })

  it('stellt im vollständigen Preset sämtliche kaufmännischen Spalten dar', () => {
    expect(isPriceFreeOrderPdf(FULL_ORDER_PDF_OPTIONS)).toBe(false)
    expect(getOrderPdfColumns(FULL_ORDER_PDF_OPTIONS).map((column) => column.key))
      .toEqual(['position', 'description', 'quantity', 'unit', 'unitPrice', 'taxRate', 'netAmount'])
  })

  it('validiert manuelle Optionen serverseitig', () => {
    const params = new URLSearchParams({ showUnitPrices: 'true', showTax: '1', showCustomer: 'false' })
    const parsed = parseOrderPdfOptions(params)
    expect(parsed.showUnitPrices).toBe(true)
    expect(parsed.showTax).toBe(true)
    expect(parsed.showCustomer).toBe(false)
    expect(parsed.showSummaries).toBe(false)
  })

  it('rendert Mitarbeiter- und Vollversion als PDF', async () => {
    for (const options of [EMPLOYEE_ORDER_PDF_OPTIONS, FULL_ORDER_PDF_OPTIONS]) {
      const buffer = await renderOrderPdf({ ...data, options })
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
      expect(buffer.length).toBeGreaterThan(500)
    }
  })

  it('hält Tabellenkopf und erste Zeile zusammen und lässt Summen nicht umbrechen', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/order.template.tsx'), 'utf8')
    expect(source).toContain('<View wrap={false} minPresenceAhead={ORDER_TABLE_START_MIN_HEIGHT}>')
    expect(source).toContain('<OrderTableHeader columns={columns} />')
    expect(source).toContain('<OrderTableRow item={data.items[0]} columns={columns} />')
    expect(source).toContain('<View style={S.totals} wrap={false}>')
    expect(source).not.toContain('style={S.tableHeader} fixed')
  })

  it('rendert langen Rich Text und mehrere Tabellen ohne Renderfehler über mehrere Seiten', async () => {
    const richText: OfferTextDocument = {
      version: 1,
      sections: [{
        id: 'pagination',
        title: 'A. Projektlaufzeit',
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Arbeitspaket A' }] },
            ...Array.from({ length: 18 }, (_, index) => ({
              type: 'paragraph',
              content: [{ type: 'text', text: `A${index + 1} ${'Langer Leistungsumfang '.repeat(10)}` }],
            })),
            ...Array.from({ length: 2 }, (_, tableIndex) => ({
              type: 'table',
              content: [
                { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Tabelle ${tableIndex + 1}` }] }] }] },
                { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tabelleninhalt' }] }] }] },
              ],
            })),
          ],
        },
      }],
    }
    const buffer = await renderOrderPdf({
      ...data,
      description: encodeOfferText(richText),
      items: Array.from({ length: 24 }, (_, index) => ({
        position: index + 1,
        description: `Position ${index + 1} ${'mit langem Beschreibungstext '.repeat(4)}`,
        quantity: 1,
        unit: 'Std.',
      })),
    })
    const pageCount = buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0
    expect(pageCount).toBeGreaterThanOrEqual(3)
  })
})
