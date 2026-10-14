// Characterization: hält das HEUTIGE Verhalten der Alt-Berechnung fest (nur lesend importiert).
// Abweichungen zum kanonischen Calculator sind bewusst und in DEC-015 begründet.
// Dieser Test ändert keinen Produktcode; er entfällt, wenn die Altlogik abgelöst wird.
import { describe, expect, it } from 'vitest'
import { calcItemAmounts, calcOfferTotals } from '@/lib/validators/offer.schema'
import { calculateInvoice, calculateLineNet } from '@/lib/billing'

const canonicalNet = (quantity: number, unitPrice: number, discountRate: number) =>
  calculateLineNet({ key: 'x', quantity: String(quantity), unitPrice: unitPrice.toFixed(2), discountRate: String(discountRate), taxRate: '19', taxCategory: 'S' })

describe('Altlogik (offer.schema calcItemAmounts) vs. kanonischer Calculator', () => {
  it.each([
    [1, 1.15, 30, 0.8, '0.81'],
    [3, 0.35, 10, 0.94, '0.95'],
    [1, 0.95, 10, 0.85, '0.86'],
  ])('Rabatt %s × %s @ %s %%: Alt %s ≠ SOLL %s', (quantity, unitPrice, discountRate, legacyNet, expected) => {
    expect(calcItemAmounts({ quantity, unitPrice, taxRate: 19, discountRate }).netAmount).toBe(legacyNet)
    expect(canonicalNet(quantity, unitPrice, discountRate)).toBe(expected)
  })

  it.each([
    [1, 10.05, 15, 8.54], [7, 0.99, 5, 6.58], [2, 1.15, 30, 1.61], [1, 2.5, 10, 2.25], [3, 33.33, 12.5, 87.49],
  ])('Rabatt %s × %s @ %s %%: Alt = SOLL = %s', (quantity, unitPrice, discountRate, net) => {
    expect(calcItemAmounts({ quantity, unitPrice, taxRate: 19, discountRate }).netAmount).toBe(net)
    expect(canonicalNet(quantity, unitPrice, discountRate)).toBe(net.toFixed(2))
  })

  it('Steuer: Altlogik summiert Zeilensteuern (0,30), Calculator rechnet einmal je Satz (0,29)', () => {
    const items = Array.from({ length: 3 }, () => ({ quantity: 1, unitPrice: 0.5, taxRate: 19 }))
    expect(calcOfferTotals(items as never).totalTax).toBe(0.3)
    const canonical = calculateInvoice(items.map((_, i) => ({ key: String(i), quantity: '1', unitPrice: '0.50', taxRate: '19', taxCategory: 'S' as const })))
    expect(canonical.totals.taxTotal).toBe('0.29')
  })

  it('Altlogik bleibt unverändert vorhanden (Angebote/Aufträge: Block 1b)', () => {
    expect(typeof calcItemAmounts).toBe('function')
    expect(typeof calcOfferTotals).toBe('function')
  })
})
