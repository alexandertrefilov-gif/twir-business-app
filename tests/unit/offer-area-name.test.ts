import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { OfferCreateSchema } from '@/lib/validators/offer.schema'

const validOffer = {
  customerId: '11111111-1111-4111-8111-111111111111',
  offerDate: new Date('2026-09-10T00:00:00.000Z'),
  areaName: '  GGA Lagerplanung  ',
  title: 'Koordination / Fachbauleitung GGA-Schränke',
  introText: 'Projekt:\nKi_02_003 – Umstellung von Geb. 2 nach Geb. 7 Versuchsgießerei ISH',
  items: [{ position: 1, description: 'Bauleitung', quantity: 1, unit: 'Stk.', unitPrice: 2400, taxRate: 19 }],
}

describe('Bereich / Oberprojekt im Angebot', () => {
  it('validiert Bereich, Betreff und Projekttext als getrennte Werte', () => {
    const parsed = OfferCreateSchema.parse(validOffer)
    expect(parsed.areaName).toBe('GGA Lagerplanung')
    expect(parsed.title).toBe('Koordination / Fachbauleitung GGA-Schränke')
    expect(parsed.introText).toContain('Ki_02_003')
  })

  it('hält das neue Feld optional für bestehende Angebote', () => {
    const parsed = OfferCreateSchema.parse({ ...validOffer, areaName: undefined })
    expect(parsed.areaName).toBeUndefined()
  })

  it('zeigt das Feld separat im Formular und reicht es durch beide Server Actions', () => {
    const root = process.cwd()
    const form = fs.readFileSync(path.join(root, 'components/offers/OfferForm.tsx'), 'utf8')
    const actions = fs.readFileSync(path.join(root, 'app/(dashboard)/offers/actions.ts'), 'utf8')
    expect(form).toContain('htmlFor="areaName">Bereich / Oberprojekt</label>')
    expect(form).toContain('name="areaName"')
    expect(actions.match(/formData\.get\('areaName'\)/g)).toHaveLength(2)
  })

  it('verwendet das Feld nicht als zusätzlichen PDF- oder DOCX-Inhalt', () => {
    const pdfData = fs.readFileSync(path.join(process.cwd(), 'lib/services/offer-pdf.service.ts'), 'utf8')
    expect(pdfData).not.toContain('areaName: offer.areaName')
  })
})
