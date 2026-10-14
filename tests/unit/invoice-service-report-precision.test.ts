// REQ-029 P2: Preispräzision, Leistungsnachweis → Rechnung, Schutz bestehender Prozesse.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { InvoiceDraftSchema } from '@/lib/validators/invoice.schema'
import {
  ServiceReportCreateSchema,
  ServiceReportItemSchema,
  calcReportItemAmounts,
  calcReportItemNet,
  calcReportTotal,
  calcReportTotals,
  previewReportLine,
  previewReportTotals,
} from '@/lib/validators/service-report.schema'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const customerId = '00000000-0000-4000-8000-000000000001'
const invoiceWith = (item: Record<string, unknown>) => ({
  customerId, invoiceDate: '2026-10-08',
  items: [{ position: 1, description: 'Leistung', unit: 'Std.', taxRate: 19, quantity: '1', unitPrice: '10.00', ...item }],
})
const reportItem = (over: Record<string, unknown> = {}) => ({
  position: 1, type: 'hours', description: 'Leistung', quantity: '1', unit: 'Std.', unitPrice: '10.00', discountRate: 0, taxRate: 19, ...over,
})

describe('Rechnung: Preise als Dezimal-String, serverseitig geprüft', () => {
  it('übernimmt zwei Nachkommastellen exakt', () => {
    const parsed = InvoiceDraftSchema.parse(invoiceWith({ quantity: '2.5', unitPrice: '19.99' }))
    expect(parsed.items[0].unitPrice).toBe(19.99)
    expect(parsed.items[0].quantity).toBe(2.5)
  })

  it.each(['10.005', '10.001', '10.0001', '0.999'])('lehnt Einzelpreis %s (3–4 Nachkommastellen) ab – keine automatische Rundung', (unitPrice) => {
    const result = InvoiceDraftSchema.safeParse(invoiceWith({ unitPrice }))
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues[0].message
      expect(message).toContain('Position 1')
      expect(message).toContain('höchstens 2 Nachkommastellen')
      expect(result.error.flatten().fieldErrors.items?.[0]).toBe(message)
    }
  })

  it('lehnt auch JS-Zahlen mit mehr als zwei Nachkommastellen ab (ältere Aufrufer)', () => {
    expect(InvoiceDraftSchema.safeParse(invoiceWith({ unitPrice: 10.005 })).success).toBe(false)
    expect(InvoiceDraftSchema.safeParse(invoiceWith({ unitPrice: 0.1 + 0.2 })).success).toBe(false)
  })

  it('lehnt Menge mit mehr als drei Nachkommastellen ab; akzeptiert drei', () => {
    expect(InvoiceDraftSchema.safeParse(invoiceWith({ quantity: '1.5555' })).success).toBe(false)
    expect(InvoiceDraftSchema.safeParse(invoiceWith({ quantity: '1.555' })).success).toBe(true)
  })

  it('bestehende Zahlen-Payloads bleiben gültig (Bestandsschutz der Aufrufer/Tests)', () => {
    const parsed = InvoiceDraftSchema.parse({
      customerId, invoiceDate: new Date(),
      items: [{ position: 1, description: 'Montage', quantity: 1, unit: 'Std.', unitPrice: 100, taxRate: 19 }],
    })
    expect(parsed.items[0]).toMatchObject({ quantity: 1, unitPrice: 100, taxRate: 19, unit: 'Std.' })
  })

  it('Werte aus der Bearbeitungsseite (Decimal.toNumber().toString()) bleiben gültig', () => {
    expect(InvoiceDraftSchema.safeParse(invoiceWith({ quantity: '12.5', unitPrice: '1234.5' })).success).toBe(true)
    expect(InvoiceDraftSchema.safeParse(invoiceWith({ quantity: '0.001', unitPrice: '0' })).success).toBe(true)
  })

  it('bisher zulässige Einheit und Steuerangabe bleiben unverändert', () => {
    const parsed = InvoiceDraftSchema.parse(invoiceWith({ unit: 'm²', taxRate: 7 }))
    expect(parsed.items[0]).toMatchObject({ unit: 'm²', taxRate: 7 })
  })
})

describe('Leistungsnachweis: gleiche Präzisionsregeln', () => {
  it('akzeptiert 2 Nachkommastellen, lehnt 3 und 4 ab', () => {
    expect(ServiceReportItemSchema.safeParse(reportItem({ unitPrice: '12.34' })).success).toBe(true)
    expect(ServiceReportItemSchema.safeParse(reportItem({ unitPrice: '12.345' })).success).toBe(false)
    expect(ServiceReportItemSchema.safeParse(reportItem({ unitPrice: '12.3456' })).success).toBe(false)
    expect(ServiceReportItemSchema.safeParse(reportItem({ unitPrice: 12.345 })).success).toBe(false)
  })

  it('Rabattsatz: höchstens 2 Nachkommastellen, 0–100, Default 0', () => {
    expect(ServiceReportItemSchema.safeParse(reportItem({ discountRate: '10.001' })).success).toBe(false)
    expect(ServiceReportItemSchema.safeParse(reportItem({ discountRate: 101 })).success).toBe(false)
    expect(ServiceReportItemSchema.safeParse(reportItem({ discountRate: -1 })).success).toBe(false)
    const { discountRate: _omit, ...withoutDiscount } = reportItem()
    expect(ServiceReportItemSchema.parse(withoutDiscount).discountRate).toBe(0)
    expect(ServiceReportItemSchema.parse(reportItem({ discountRate: '12.5' })).discountRate).toBe(12.5)
  })

  it('bestehende Zahlen-Payloads (Nachweis ohne Rabatt/Steuersatz) bleiben lesbar und unverändert', () => {
    const parsed = ServiceReportItemSchema.parse({ position: 1, type: 'hours', description: 'Leistung', quantity: 2.5, unit: 'Std.', unitPrice: 100, discountRate: 10, taxRate: 19 })
    expect(parsed).toMatchObject({ quantity: 2.5, unitPrice: 100, discountRate: 10, taxRate: 19, unit: 'Std.' })
    const create = ServiceReportCreateSchema.safeParse({ orderId: customerId, reportDate: '2026-10-08', items: [reportItem()] })
    expect(create.success).toBe(true)
  })

  it('Nachweis-Netto entsteht über den kanonischen Calculator (eine Rundung), Altwerte ohne Rabatt unverändert', () => {
    expect(calcReportItemNet({ quantity: 1, unitPrice: 1.15, discountRate: 30 })).toBe(0.81)  // Altlogik: 0.80
    expect(calcReportItemNet({ quantity: 3, unitPrice: 0.35, discountRate: 10 })).toBe(0.95)  // Altlogik: 0.94
    expect(calcReportItemNet({ quantity: 2.5, unitPrice: 100, discountRate: 10 })).toBe(225)
    expect(calcReportItemNet({ quantity: 10, unitPrice: 0.33 })).toBe(3.3)
    expect(calcReportTotal([ServiceReportItemSchema.parse(reportItem({ quantity: '10', unitPrice: '0.33' }))])).toBe(3.3)
  })

  it('Anzeige-Hilfen behalten ihre Form (Bestandsvertrag der Tests)', () => {
    expect(calcReportItemAmounts({ quantity: 2.5, unitPrice: 100, discountRate: 10, taxRate: 19 })).toEqual({ subtotal: 250, discountAmount: 25, netAmount: 225, taxAmount: 42.75, grossAmount: 267.75 })
    const items = [
      ServiceReportItemSchema.parse(reportItem({ quantity: '2.5', unitPrice: '100', discountRate: 10 })),
      ServiceReportItemSchema.parse(reportItem({ quantity: '2', unitPrice: '50', discountRate: 0, taxRate: 7 })),
    ]
    expect(calcReportTotals(items)).toEqual({ subtotal: 350, totalDiscount: 25, totalNet: 325, totalTax: 49.75, totalGross: 374.75 })
  })

  it('Formular-Vorschau rechnet aus Texten (ohne Floats) und meldet ungültige Positionen', () => {
    expect(previewReportLine({ position: 1, type: 'hours', description: 'x', quantity: '1', unit: 'Std.', unitPrice: '1.15', discountRate: '30', taxRate: 19 })).toBe('0.81')
    expect(previewReportLine({ position: 1, type: 'hours', description: 'x', quantity: '1', unit: 'Std.', unitPrice: '1.155', discountRate: '0', taxRate: 19 })).toBeNull()
    const totals = previewReportTotals([
      { position: 1, type: 'hours', description: 'a', quantity: '2', unit: 'Std.', unitPrice: '10', discountRate: '0', taxRate: 19 },
      { position: 2, type: 'hours', description: 'b', quantity: '1.2345', unit: 'Std.', unitPrice: '10', discountRate: '0', taxRate: 19 },
    ])
    expect(totals).toMatchObject({ totalNet: '20.00', totalTax: '3.80', totalGross: '23.80', invalidPositions: [2] })
  })
})

describe('Quelltext-Garantien', () => {
  it('Rechnungsseite: kein Rückrechnen des Einzelpreises aus dem Netto', () => {
    const page = read('app/(dashboard)/invoices/new/page.tsx')
    expect(page).not.toContain('dividedBy')
    expect(page).toContain('prepareInvoiceItemsFromServiceReport')
    expect(page).toContain('unitPrice: true, discountRate: true')
    expect(page).toContain('transfer.blocked.reason')
    expect(page).toContain('reportDeviations')
  })

  it('InvoiceForm und Positions-Editor: keine parseFloat-/Math.round-Geldrechnung', () => {
    for (const file of ['components/invoices/InvoiceForm.tsx', 'components/service-reports/ServiceReportPositionsEditor.tsx']) {
      const code = read(file).replace(/\/\/.*$/gm, '')
      expect(code, file).not.toMatch(/parseFloat|Number\.parseFloat|Math\.round/)
    }
    const form = read('components/invoices/InvoiceForm.tsx')
    expect(form).toContain("quantity:r.quantity.trim()")
    expect(form).toContain("unitPrice:r.unitPrice.trim()||'0'")
    expect(form).toContain('Abweichung zum Leistungsnachweis')
  })

  it('IP-1: InvoiceForm zeigt nur Positions-Netto, keine vorläufige Steuer-/Brutto-Vorschau', () => {
    const form = read('components/invoices/InvoiceForm.tsx')
    expect(form).toContain('Positions-Netto')
    expect(form).toContain('verbindliche Steuerberechnung')
    expect(form).not.toContain('grandTotal')
    expect(form).not.toContain('taxBasisTotal')
    expect(form).not.toContain('label="Bruttobetrag"')
    expect(form).not.toMatch(/zzgl\./)
  })

  it('Angebote und Aufträge rechnen seit REQ-029 F2-B über die zentrale Billing-Quelle; PDF/Anzeige und Rechnungs-Action bleiben ohne Berechnung', () => {
    // F2-B (Owner-Entscheidung 14.10.2026): Angebot, Auftrag und Rechnung nutzen dieselbe Decimal-Rechenquelle.
    // Die Persistenz-Services gehen über den Adapter document-calculation.service; Angebots-PDF und Rechnungs-Server-Action
    // rechnen weiterhin nicht selbst (gespeicherte Beträge). Seit P4-B/P4-D nutzen Rechnungs- und Zahlungs-Service die Billing-Bausteine.
    expect(read('lib/validators/offer.schema.ts')).toContain('@/lib/billing/')
    expect(read('lib/services/offer.service.ts')).toContain('@/lib/services/document-calculation.service')
    expect(read('lib/services/order.service.ts')).toContain('@/lib/services/document-calculation.service')
    for (const file of [
      'lib/services/offer-pdf.service.ts',
      'app/(dashboard)/invoices/actions.ts',
    ]) {
      expect(read(file), file).not.toContain('lib/billing')
    }
    expect(read('lib/services/invoice.service.ts')).toContain('@/lib/billing/')
    expect(read('lib/services/payment.service.ts')).toContain('@/lib/billing/payment-math')
  })
})
