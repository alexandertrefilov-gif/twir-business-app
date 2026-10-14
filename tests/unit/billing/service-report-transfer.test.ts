import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { prepareInvoiceItemsFromServiceReport, type ServiceReportItemLike } from '@/lib/billing/service-report-transfer'

const item = (over: Partial<Record<keyof ServiceReportItemLike, string>> & { id?: string } = {}): ServiceReportItemLike => ({
  id: over.id ?? 'item-1',
  description: over.description ?? 'Montage',
  quantity: new Decimal(over.quantity ?? '1'),
  unit: over.unit ?? 'Std.',
  unitPrice: new Decimal(over.unitPrice ?? '10'),
  discountRate: new Decimal(over.discountRate ?? '0'),
  taxRate: new Decimal(over.taxRate ?? '19'),
  netAmount: new Decimal(over.netAmount ?? '10'),
})

describe('Übernahme Leistungsnachweis → Rechnungsentwurf', () => {
  it('übernimmt Einzelpreis, Menge, Einheit und Steuersatz direkt als Dezimal-Strings', () => {
    const result = prepareInvoiceItemsFromServiceReport([item({ quantity: '2.5', unitPrice: '19.99', netAmount: '49.98', taxRate: '7', unit: 'kg' })])
    expect(result.blocked).toBeNull()
    expect(result.items).toEqual([{ _key: 'item-1', description: 'Montage', quantity: '2.5', unit: 'kg', unitPrice: '19.99', discountRate: '0.00', taxRate: '7' }])
  })

  it('rechnet den Einzelpreis NICHT aus dem Netto zurück (kein 0.3333…-Preis)', () => {
    // Nachweis-Netto 1,00 bei Menge 3 × 0,35 wäre rückgerechnet 0.3333…; der Originalpreis bleibt 0,35
    const result = prepareInvoiceItemsFromServiceReport([item({ quantity: '3', unitPrice: '0.35', netAmount: '1.00' })])
    expect(result.items[0].unitPrice).toBe('0.35')
    expect(result.items[0].unitPrice).not.toMatch(/\d{3,}$/)
  })

  it('Preis mit Nullen am Ende bleibt exakt; Preis verliert keine Stellen', () => {
    const result = prepareInvoiceItemsFromServiceReport([item({ unitPrice: '1234567.89', quantity: '0.001', netAmount: '1234.57' })])
    expect(result.items[0].unitPrice).toBe('1234567.89')
    expect(result.items[0].quantity).toBe('0.001')
  })

  it('P4-B: übernimmt Positionsrabatte unverändert (nichts wird blockiert oder stillschweigend entfernt)', () => {
    const result = prepareInvoiceItemsFromServiceReport([
      item({ id: 'a' }), item({ id: 'b', discountRate: '10', netAmount: '9' }), item({ id: 'c', discountRate: '2.5', netAmount: '9.75' }),
    ])
    expect(result.blocked).toBeNull()
    expect(result.items.map((i) => i.discountRate)).toEqual(['0.00', '10.00', '2.50'])
    expect(result.deviations).toEqual([])
  })

  it('P4-B: Netto-Vergleich berücksichtigt den Rabatt (Nachweis 0,81 bei 1,15 € − 30 %)', () => {
    const same = prepareInvoiceItemsFromServiceReport([item({ unitPrice: '1.15', discountRate: '30', netAmount: '0.81' })])
    expect(same.deviations).toEqual([])
    const other = prepareInvoiceItemsFromServiceReport([item({ unitPrice: '1.15', discountRate: '30', netAmount: '0.80' })])
    expect(other.deviations[0]).toMatchObject({ previousNet: '0.80', recalculatedNet: '0.81', difference: '0.01' })
  })

  it('Rabatt 0 (auch 0.00) bleibt 0.00', () => {
    const result = prepareInvoiceItemsFromServiceReport([item({ discountRate: '0.00' })])
    expect(result.blocked).toBeNull()
    expect(result.items[0].discountRate).toBe('0.00')
  })

  it('R-1: meldet die tatsächliche Cent-Differenz (alt 49,97 → neu 49,98)', () => {
    const result = prepareInvoiceItemsFromServiceReport([item({ quantity: '2.5', unitPrice: '19.99', netAmount: '49.97' })])
    expect(result.blocked).toBeNull()
    expect(result.items).toHaveLength(1) // blockiert nicht
    expect(result.deviations).toEqual([
      { position: 1, description: 'Montage', previousNet: '49.97', recalculatedNet: '49.98', difference: '0.01' },
    ])
  })

  it('R-1: negative Differenz und keine Meldung bei Gleichheit', () => {
    const lower = prepareInvoiceItemsFromServiceReport([item({ quantity: '2.5', unitPrice: '19.99', netAmount: '49.99' })])
    expect(lower.deviations[0]).toMatchObject({ previousNet: '49.99', recalculatedNet: '49.98', difference: '-0.01' })
    expect(prepareInvoiceItemsFromServiceReport([item({ quantity: '2.5', unitPrice: '19.99', netAmount: '49.98' })]).deviations).toEqual([])
  })

  it('bestehende Nachweise bleiben lesbar: leere Liste und Decimal-Objekte', () => {
    expect(prepareInvoiceItemsFromServiceReport([])).toEqual({ blocked: null, items: [], deviations: [] })
  })
})
