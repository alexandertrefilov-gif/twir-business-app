import { describe, expect, it } from 'vitest'
import { SettingsUpdateSchema } from '@/lib/validators/settings.schema'
import {
  renderOfferPdf,
  type OfferPdfData,
} from '@/lib/pdf-templates/offer.template'

describe('Art der Tätigkeit in Firmeneinstellungen und Angebots-PDF', () => {
  it('validiert eine optionale Tätigkeitsbeschreibung', () => {
    const result = SettingsUpdateSchema.safeParse({
      companyName: 'TWIR GmbH',
      businessActivity: 'Fachbauleitung, Fremdfirmenkoordination',
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.businessActivity).toBe(
      'Fachbauleitung, Fremdfirmenkoordination',
    )
  })

  it('begrenzt die Tätigkeitsbeschreibung auf 300 Zeichen', () => {
    expect(SettingsUpdateSchema.safeParse({
      companyName: 'TWIR GmbH',
      businessActivity: 'A'.repeat(301),
    }).success).toBe(false)
  })

  it('rendert ein Angebot mit Tätigkeitsbeschreibung im Firmenblock', async () => {
    const data = {
      offerNumber: 'AN 260701',
      offerDate: '28.07.2026',
      company: {
        companyName: 'TWIR GmbH',
        businessActivity: 'Fachbauleitung, Fremdfirmenkoordination',
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
})
