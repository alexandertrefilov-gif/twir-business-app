import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsUpdateSchema } from '@/lib/validators/settings.schema'
import { renderOfferPdf, type OfferPdfData } from '@/lib/pdf-templates/offer.template'
import {
  renderServiceReportPdf,
  type ServiceReportPdfData,
} from '@/lib/pdf-templates/service-report.template'
import { buildCompanySnapshot } from '@/lib/services/invoice.service'
import { PageHeader } from '@/components/shared/PageHeader'

describe('Lieferantennummer in Einstellungen und Angebotskopf', () => {
  it('validiert eine optionale Lieferantennummer', () => {
    const result = SettingsUpdateSchema.safeParse({
      companyName: 'TWIR GmbH',
      supplierNumber: '18045419',
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.supplierNumber).toBe('18045419')
  })

  it('rendert ein Angebot mit Lieferantennummer', async () => {
    const data = {
      offerNumber: 'AN 260701',
      offerDate: '28.07.2026',
      company: {
        companyName: 'TWIR GmbH',
        supplierNumber: '18045419',
      },
      customer: { name: 'Musterfirma GmbH' },
      items: [{
        position: 1,
        description: 'Projektleistung',
        quantity: 1,
        unit: 'Psch.',
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

    const pdf = await renderOfferPdf(data)
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })

  it('zeigt die Lieferantennummer im rechten Dokumentkopf', () => {
    const html = renderToStaticMarkup(
      PageHeader({
        title: 'Auftrag AU 260701',
        supplierNumber: '18045419',
        documentType: 'Auftrag',
      }),
    )

    expect(html).toContain('LN-Nr.:')
    expect(html).toContain('18045419')
    expect(html).toContain('Auftrag')
  })

  it('übernimmt die Lieferantennummer in den Rechnungs-Firmensnapshot', () => {
    const snapshot = buildCompanySnapshot({
      companyName: 'TWIR GmbH',
      legalForm: 'GmbH',
      vatId: 'DE310110922',
      taxNumber: '71360/04959',
      street: 'Wächtergasse',
      houseNumber: '10',
      postalCode: '71706',
      city: 'Markgröningen',
      country: 'DE',
      bankName: 'VR-Bank',
      iban: 'DE75604628080679683003',
      bic: 'GENODES1AMT',
      email: 'info@tb-twir.de',
      phone: '015168456056',
      supplierNumber: '18045419',
    })

    expect(snapshot.supplierNumber).toBe('18045419')
  })

  it('rendert einen Leistungsnachweis mit Lieferantennummer', async () => {
    const data = {
      reportNumber: 'LN 260701',
      reportDate: '29.07.2026',
      company: {
        companyName: 'TWIR GmbH',
        supplierNumber: '18045419',
      },
      order: { orderNumber: 'AU 260701' },
      customer: { name: 'Musterfirma GmbH' },
      preparedBy: 'Mitarbeiter',
      items: [{
        position: 1,
        type: 'hours',
        description: 'Projektleistung',
        quantity: 1,
        unit: 'Std.',
        unitPrice: 100,
        netAmount: 100,
      }],
      totalNet: 100,
      byType: { hours: 100, material: 0, flat: 0 },
    } satisfies ServiceReportPdfData

    const pdf = await renderServiceReportPdf(data)
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })
})
