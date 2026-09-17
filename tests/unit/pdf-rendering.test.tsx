import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  editorFontSizeToPdfPoints,
  getPdfTableColumnWidths,
  getOfferRecipientLines,
  offerNumberForDocument,
  renderOfferPdf,
  getOfferLogoDimensions,
  tableBudgetForLogoHeight,
  OFFER_CONTENT_WIDTH_POINTS,
  OFFER_FOOTER_BOTTOM,
  OFFER_FOOTER_MIN_HEIGHT,
  OFFER_PAGE_BOTTOM_PADDING,
  OFFER_DOCUMENT_NUMBER_STYLE,
  OFFER_HEADER_TEXT_STYLE,
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
  it('hält Rich-Text-Überschriften beim Angebot beim nachfolgenden Inhalt', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/offer.template.tsx'), 'utf8')
    expect(source).toContain('style={S.richSectionTitle} minPresenceAhead={28}')
    expect(source).toContain('minPresenceAhead={28}')
  })
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

  it('formatiert Angebotsbezeichnung und -nummer wie die übrigen Kopfdaten, aber fett', () => {
    expect(OFFER_HEADER_TEXT_STYLE).toEqual({
      fontFamily: 'Helvetica',
      fontSize: 11,
      lineHeight: 1.18,
    })
    expect(OFFER_DOCUMENT_NUMBER_STYLE).toMatchObject({
      fontFamily: 'Helvetica-Bold',
      fontSize: OFFER_HEADER_TEXT_STYLE.fontSize,
      lineHeight: OFFER_HEADER_TEXT_STYLE.lineHeight,
      color: '#1e3a5f',
    })
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

  it('ignoriert historische feste Zeilenhöhen zugunsten der inhaltsbasierten PDF-Höhe', () => {
    const content = [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'Kurzer Inhalt' }],
    }]
    const automatic = estimatePdfTableRowHeight({
      type: 'tableRow',
      content: [{ type: 'tableCell', content }],
    }, [100])
    const legacy = estimatePdfTableRowHeight({
      type: 'tableRow',
      content: [{ type: 'tableCell', attrs: { rowHeight: 160 }, content }],
    }, [100])

    expect(legacy).toBe(automatic)
    const template = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/offer.template.tsx'), 'utf8')
    expect(template).not.toContain('cell.attrs?.rowHeight')
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
    expect(editorFontSizeToPdfPoints('18pt')).toBe(18)
    expect(editorFontSizeToPdfPoints('beliebig')).toBeUndefined()
  })

  it('setzt 100/150/200/300 proportional und 400 weiterhin größer um', () => {
    const widths = [100, 150, 200, 300, 400]
      .map((scale) => getOfferLogoDimensions(scale, 1200, 600).width)
    const squareWidths = [100, 150, 200, 300, 400]
      .map((scale) => getOfferLogoDimensions(scale, 600, 600).width)

    expect(widths).toEqual([70, 105, 140, 210, 280])
    expect(squareWidths).toEqual([35, 52.5, 70, 105, 140])
  })

  it('behält das Seitenverhältnis bei und passt den Header-Budget sicher an', () => {
    const wide = getOfferLogoDimensions(400, 1200, 600)
    const portrait = getOfferLogoDimensions(400, 600, 1200)

    expect(wide.width / wide.height).toBeCloseTo(2)
    expect(portrait.width / portrait.height).toBeCloseTo(0.5)
    expect(wide.width).toBeLessThanOrEqual(300)
    expect(wide.height).toBeLessThanOrEqual(140)
    expect(portrait.height).toBeLessThanOrEqual(140)
    expect(tableBudgetForLogoHeight(wide.height)).toBeLessThan(400)
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

  it('rendert ein 400-Prozent-Logo ohne festen Höhencontainer im Angebot', async () => {
    const logoDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const offer = {
      offerNumber: 'AN-2026-0400',
      offerDate: '01.01.2026',
      logoDataUri,
      logoScale: 400,
      logoSourceWidth: 1,
      logoSourceHeight: 1,
      company: { companyName: 'TWIR GmbH' },
      customer: { name: 'Testkunde GmbH' },
      items: [],
      totalNet: 0,
      totalTax: 0,
      totalGross: 0,
      taxGroups: {},
    } satisfies OfferPdfData

    expectPdf(await renderOfferPdf(offer))
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
