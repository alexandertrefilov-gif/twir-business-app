import { describe, expect, it } from 'vitest'
import {
  editorFontSizeToPdfPoints,
  getPdfTableColumnWidths,
  getOfferRecipientLines,
  offerNumberForDocument,
  renderOfferPdf,
  getOfferLogoDimensions,
  OFFER_CONTENT_WIDTH_POINTS,
  OFFER_FOOTER_BOTTOM,
  OFFER_FOOTER_MIN_HEIGHT,
  OFFER_PAGE_BOTTOM_PADDING,
  estimatePdfTableRowHeight,
  paginatePdfTable,
  type OfferPdfData,
} from '@/lib/pdf-templates/offer.template'
import {
  renderDunningPdf,
  type DunningPdfData,
} from '@/lib/pdf-templates/dunning.template'
import {
  renderServiceReportPdf,
  type ServiceReportPdfData,
} from '@/lib/pdf-templates/service-report.template'
import { encodeOfferText, type RichTextNode } from '@/lib/offers/rich-text'

function expectPdf(buffer: Buffer) {
  expect(Buffer.isBuffer(buffer)).toBe(true)
  expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  expect(buffer.length).toBeGreaterThan(500)
}

describe('PDF-Renderer', () => {
  it('wiederholt einen privaten Kundennamen nicht zusätzlich zum Ansprechpartner', () => {
    expect(getOfferRecipientLines({
      name: 'Harry Bitzer',
      contactSalutation: 'Herr',
      contactFirstName: 'Harry',
      contactLastName: 'Bitzer',
      contactDepartment: 'MO/PSE',
      street: 'Emil-Kessler-Str.',
      houseNumber: '4',
      postalCode: '73733',
      city: 'Esslingen',
    })).toEqual([
      'Herr Harry Bitzer',
      'MO/PSE',
      'Emil-Kessler-Str. 4',
      '73733 Esslingen',
    ])
  })

  it('behält bei Firmenkunden Firma und Ansprechpartner bei', () => {
    expect(getOfferRecipientLines({
      name: 'Mercedes-Benz AG',
      contactSalutation: 'Herr',
      contactFirstName: 'Harry',
      contactLastName: 'Bitzer',
    })).toEqual(['Mercedes-Benz AG', 'Herr Harry Bitzer'])
  })

  it('verwendet die vollständige A4-Inhaltsbreite für Rich-Text-Tabellen', () => {
    expect(OFFER_CONTENT_WIDTH_POINTS).toBeCloseTo(505.28)
  })

  it('entfernt das AN-Präfix nur aus der sichtbaren PDF-Nummer', () => {
    expect(offerNumberForDocument('AN 260701')).toBe('260701')
    expect(offerNumberForDocument('AN-2026-0001')).toBe('2026-0001')
    expect(offerNumberForDocument('260701')).toBe('260701')
  })

  it('verwendet für alle Tabellenzeilen ein gemeinsames Spaltenraster', () => {
    expect(getPdfTableColumnWidths({
      type: 'table',
      content: [{
        type: 'tableRow',
        content: [
          { type: 'tableCell', attrs: { colspan: 1, colwidth: [120] } },
          { type: 'tableCell', attrs: { colspan: 2, colwidth: [180, 90] } },
        ],
      }, {
        type: 'tableRow',
        content: [
          { type: 'tableCell', attrs: { colspan: 1 } },
          { type: 'tableCell', attrs: { colspan: 1 } },
          { type: 'tableCell', attrs: { colspan: 1 } },
        ],
      }],
    })).toEqual([32.31, 38.46, 29.23])
  })

  it('teilt lange Tabellen in stabile Seiten mit wiederholtem Tabellenkopf', () => {
    const header: RichTextNode = {
      type: 'tableRow',
      content: [
        { type: 'tableHeader', attrs: { colspan: 3, colwidth: [100, 300, 140] } },
        { type: 'tableHeader', attrs: { colspan: 1, colwidth: [120] } },
      ],
    }
    const body: RichTextNode[] = Array.from({ length: 30 }, (_, index) => ({
      type: 'tableRow',
      content: [
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: `P${index + 1}` }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Produktionsreifeprüfungsanforderungen und Endabnahmedokumentation' }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Systemintegration' }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1.250,00 EUR' }] }] },
      ],
    }))
    const pages = paginatePdfTable({ type: 'table', content: [header, ...body] })

    expect(pages.length).toBeGreaterThanOrEqual(3)
    expect(pages.every((page) => page.headerRows.length === 1)).toBe(true)
    expect(pages.every((page) => page.headerRows[0] === header)).toBe(true)
    expect(pages.flatMap((page) => page.bodyRows)).toEqual(body)
    expect(pages.every((page) => page.bodyRows.length > 0)).toBe(true)
  })

  it('berücksichtigt lange Zellen, colspan und den Footer-Sicherheitsabstand', () => {
    const longRow: RichTextNode = {
      type: 'tableRow',
      content: [{
        type: 'tableCell',
        attrs: { colspan: 3 },
        content: [{ type: 'paragraph', content: [{
          type: 'text',
          text: 'Produktionsreifeprüfungsanforderungen '.repeat(20),
        }] }],
      }, {
        type: 'tableCell',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '9.999,00 EUR' }] }],
      }],
    }
    const height = estimatePdfTableRowHeight(longRow, [15, 45, 20, 20])

    expect(height).toBeGreaterThan(100)
    expect(OFFER_PAGE_BOTTOM_PADDING).toBeGreaterThanOrEqual(
      OFFER_FOOTER_BOTTOM + OFFER_FOOTER_MIN_HEIGHT + 12,
    )
  })

  it('übernimmt Editor-Schriftgrößen maßstabsgerecht in das PDF', () => {
    expect(editorFontSizeToPdfPoints('10px')).toBe(10)
    expect(editorFontSizeToPdfPoints('12px')).toBe(10)
    expect(editorFontSizeToPdfPoints('14px')).toBe(11)
    expect(editorFontSizeToPdfPoints('16px')).toBe(12)
    expect(editorFontSizeToPdfPoints('18px')).toBe(14)
    expect(editorFontSizeToPdfPoints('24px')).toBe(18)
    expect(editorFontSizeToPdfPoints('11pt')).toBe(11)
    expect(editorFontSizeToPdfPoints('14pt')).toBe(14)
    expect(editorFontSizeToPdfPoints('10px', 11)).toBe(11)
    expect(editorFontSizeToPdfPoints('16px', 12)).toBe(12)
    expect(editorFontSizeToPdfPoints('14pt', 11)).toBe(14)
    expect(editorFontSizeToPdfPoints('beliebig')).toBeUndefined()
  })

  it('skaliert das Firmenlogo proportional bis zur A4-Grenze', () => {
    expect(getOfferLogoDimensions(200)).toEqual({ width: 220, height: 110 })
    expect(getOfferLogoDimensions(600)).toEqual({ width: 220, height: 110 })
  })

  it('rendert ein Angebot als Node.js-Buffer', async () => {
    const data = {
      offerNumber: 'AN-2026-0001',
      offerDate: '01.01.2026',
      company: { companyName: 'TWIR GmbH' },
      customer: { name: 'Testkunde GmbH' },
      introText: encodeOfferText({
        version: 1,
        sections: [{
          id: 'intro-1',
          title: 'Leistungsumfang',
          content: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: 'Formatierter Angebotstext', marks: [{ type: 'bold' }] }],
            }, {
              type: 'paragraph',
            }, {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Überschrift mit Abstand' }],
            }],
          },
        }],
      }),
      items: [{
        position: 1,
        description: 'Testleistung',
        quantity: 1,
        unit: 'Stk.',
        unitPrice: 100,
        taxRate: 19,
        netAmount: 100,
        taxAmount: 19,
        grossAmount: 119,
      }],
      totalNet: 100,
      totalTax: 19,
      totalGross: 119,
      taxGroups: { '19': 19 },
    } satisfies OfferPdfData

    expectPdf(await renderOfferPdf(data))
  })

  it('rendert eine Mahnung als Node.js-Buffer', async () => {
    const data = {
      noticeNumber: 'MAHN-2026-0001',
      noticeDate: '20.01.2026',
      dueDate: '27.01.2026',
      level: 1,
      levelLabel: 'Zahlungserinnerung',
      company: { companyName: 'TWIR GmbH' },
      customer: { name: 'Testkunde GmbH' },
      invoice: {
        invoiceNumber: 'RE-2026-0001',
        invoiceDate: '01.01.2026',
        totalGross: 119,
        paidAmount: 0,
        dueDate: '15.01.2026',
      },
      feeTotal: 119,
    } satisfies DunningPdfData

    expectPdf(await renderDunningPdf(data))
  })

  it('rendert einen Leistungsnachweis als Node.js-Buffer', async () => {
    const data = {
      reportNumber: 'LN-2026-0001',
      reportDate: '01.01.2026',
      company: { companyName: 'TWIR GmbH' },
      order: { orderNumber: 'AU-2026-0001' },
      customer: { name: 'Testkunde GmbH' },
      preparedBy: 'Test Benutzer',
      items: [{
        position: 1,
        type: 'hours',
        description: 'Montage',
        quantity: 1,
        unit: 'Std.',
        unitPrice: 100,
        netAmount: 100,
      }],
      totalNet: 100,
      byType: { hours: 100, material: 0, flat: 0 },
    } satisfies ServiceReportPdfData

    expectPdf(await renderServiceReportPdf(data))
  })
})
