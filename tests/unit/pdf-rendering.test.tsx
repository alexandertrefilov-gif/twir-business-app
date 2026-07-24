import { describe, expect, it } from 'vitest'
import {
  renderOfferPdf,
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

function expectPdf(buffer: Buffer) {
  expect(Buffer.isBuffer(buffer)).toBe(true)
  expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  expect(buffer.length).toBeGreaterThan(500)
}

describe('PDF-Renderer', () => {
  it('rendert ein Angebot als Node.js-Buffer', async () => {
    const data = {
      offerNumber: 'AN-2026-0001',
      offerDate: '01.01.2026',
      company: { companyName: 'TWIR GmbH' },
      customer: { name: 'Testkunde GmbH' },
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
