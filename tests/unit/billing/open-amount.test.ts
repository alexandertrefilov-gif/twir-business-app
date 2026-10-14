import { describe, expect, it } from 'vitest'
import { calculateInvoiceForPersistence } from '@/lib/services/invoice-calculation.service'
import { MoneyDecimal } from '@/lib/billing/money'
import { groupTaxFromStoredNet, isPositiveMoney, resolveOpenAmount } from '@/lib/billing/open-amount'
import { remainingMoney } from '@/lib/billing/payment-math'

/**
 * REQ-029 P5-4 Schritt 3 – F3/F7 (aktueller offener Betrag) und F4 (Steuergruppen).
 * Quelle des Rests: Σ aktiver Zahlungszeilen; Cache `paidAmount` nur Konsistenzwert.
 */
describe('resolveOpenAmount (F3/F7)', () => {
  it('Teilzahlung: Rest = Brutto − Σ aktive Zahlungen', () => {
    const r = resolveOpenAmount('119.00', '40.01', ['40.01'])
    expect(r).toMatchObject({ totalGross: '119.00', paid: '40.01', remaining: '78.99', source: 'active-payments', cacheDrift: false })
  })

  it('mehrere Teilzahlungen werden exakt summiert (0,10 + 0,20 = 0,30; kein Gleitkommarest)', () => {
    const r = resolveOpenAmount('1.00', '0.30', ['0.10', '0.20'])
    expect(r.paid).toBe('0.30')
    expect(r.remaining).toBe('0.70')
    expect(r.cacheDrift).toBe(false)
  })

  it('vollständig bezahlt: Rest 0,00, kein positiver Rest', () => {
    const r = resolveOpenAmount('119.00', '119.00', ['100.00', '19.00'])
    expect(r.remaining).toBe('0.00')
    expect(isPositiveMoney(r.remaining)).toBe(false)
  })

  it('Überzahlung/Storno: Rest negativ, nicht positiv', () => {
    expect(resolveOpenAmount('10.00', '12.50', ['12.50']).remaining).toBe('-2.50')
    expect(isPositiveMoney('-2.50')).toBe(false)
    expect(resolveOpenAmount('-119.00', '0', []).remaining).toBe('-119.00')
  })

  it('keine Zahlungen: Summe 0,00, Rest = Brutto', () => {
    const r = resolveOpenAmount('250.00', '0.00', [])
    expect(r).toMatchObject({ paid: '0.00', remaining: '250.00', source: 'active-payments', cacheDrift: false })
  })

  it('Cache-Drift: Σ Zahlungen gewinnt, Abweichung ist ausgewiesen (nicht verdeckt)', () => {
    const r = resolveOpenAmount('100.00', '30.00', ['20.00'])
    expect(r).toMatchObject({ paid: '20.00', remaining: '80.00', source: 'active-payments', cacheDrift: true, cachePaid: '30.00' })
  })

  it('gelöschte Zahlung im Cache (Cache zu hoch) wird als Drift erkannt, Rest folgt den aktiven Zeilen', () => {
    const r = resolveOpenAmount('100.00', '100.00', [])
    expect(r.remaining).toBe('100.00')
    expect(r.cacheDrift).toBe(true)
  })

  it('ohne geladene Zahlungszeilen: Cache als ausgewiesener Rückfall, kein Drift-Urteil', () => {
    const r = resolveOpenAmount('100.00', '30.00', null)
    expect(r).toMatchObject({ paid: '30.00', remaining: '70.00', source: 'cache', cacheDrift: false })
  })

  it('akzeptiert Decimal-ähnliche Objekte (Prisma.Decimal) und Strings', () => {
    const dec = (v: string) => ({ toFixed: () => v })
    expect(resolveOpenAmount(dec('119.00'), dec('19.00'), [dec('19.00')]).remaining).toBe('100.00')
  })

  it('Eigenschaft: 20 000 Zufallsfälle stimmen mit remainingMoney (addPayment-Funktion) überein', () => {
    let seed = 54
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n }
    const cents = (c: number) => new MoneyDecimal(c).dividedBy(100).toFixed(2)
    for (let i = 0; i < 20000; i++) {
      const gross = rnd(100_000_000)
      const parts: string[] = []
      let paidCents = 0
      for (let k = rnd(5); k > 0; k--) { const p = rnd(Math.floor(gross / 4) + 1); parts.push(cents(p)); paidCents += p }
      const r = resolveOpenAmount(cents(gross), cents(paidCents), parts)
      expect(r.paid).toBe(cents(paidCents))
      expect(r.remaining).toBe(remainingMoney(cents(gross), cents(paidCents)).toFixed(2))
      expect(r.cacheDrift).toBe(false)
    }
  })
})

describe('groupTaxFromStoredNet (F4)', () => {
  const lines = Array.from({ length: 10 }, () => ({ quantity: '1', unitPrice: '0.33', taxRate: '19' }))

  it('Regressionsfall 10 × 0,33 € @ 19 %: Gruppensteuer 0,63 (nicht 10 × 0,06 = 0,60)', () => {
    const calc = calculateInvoiceForPersistence(lines)
    expect(calc.totalTax).toBe('0.63')
    // Genau das summierte die Rechnungsseite bisher: einzeln gerundete Positionssteuern.
    expect(calc.lines.map((l) => l.taxAmount).reduce((s, v) => new MoneyDecimal(s).plus(v).toFixed(2), '0.00')).toBe('0.60')

    const groups = groupTaxFromStoredNet(calc.lines.map((l, i) => ({ taxRate: lines[i].taxRate, netAmount: l.netAmount })))
    expect(groups).toEqual([{ rate: '19', net: '3.30', tax: '0.63' }])
    expect(groups[0].tax).toBe(calc.totalTax)
  })

  it('mehrere Sätze: absteigend sortiert, je Satz einmal gerundet, Summe = totalTax', () => {
    const doc = [
      { quantity: '10', unitPrice: '0.33', taxRate: '7' },
      { quantity: '1', unitPrice: '100.00', taxRate: '19' },
      { quantity: '3', unitPrice: '0.33', taxRate: '7' },
      { quantity: '5', unitPrice: '1.07', taxRate: '19' },
    ]
    const calc = calculateInvoiceForPersistence(doc)
    const groups = groupTaxFromStoredNet(calc.lines.map((l, i) => ({ taxRate: doc[i].taxRate, netAmount: l.netAmount })))
    expect(groups.map((g) => g.rate)).toEqual(['19', '7'])
    expect(groups.reduce((s, g) => s.plus(g.tax), new MoneyDecimal(0)).toFixed(2)).toBe(calc.totalTax)
  })

  it('Steuersatz-Schreibweisen "19", "19.00", "7.5" bilden korrekte Gruppen ohne überflüssige Nullen', () => {
    const groups = groupTaxFromStoredNet([
      { taxRate: '19', netAmount: '10.00' },
      { taxRate: '19.00', netAmount: '5.00' },
      { taxRate: '7.50', netAmount: '100.00' },
    ])
    expect(groups).toEqual([
      { rate: '19', net: '15.00', tax: '2.85' },
      { rate: '7.5', net: '100.00', tax: '7.50' },
    ])
  })

  it('Gruppen ohne Steuerbetrag (0 %) werden nicht ausgegeben; negative Beträge (Storno) bleiben sichtbar', () => {
    expect(groupTaxFromStoredNet([{ taxRate: '0', netAmount: '50.00' }])).toEqual([])
    expect(groupTaxFromStoredNet([{ taxRate: '19', netAmount: '-100.00' }])).toEqual([{ rate: '19', net: '-100.00', tax: '-19.00' }])
  })

  it('ROUND_HALF_UP je Gruppe (Hälfte weg von Null)', () => {
    expect(groupTaxFromStoredNet([{ taxRate: '19', netAmount: '0.03' }])).toEqual([{ rate: '19', net: '0.03', tax: '0.01' }])
    expect(groupTaxFromStoredNet([{ taxRate: '50', netAmount: '0.01' }])[0].tax).toBe('0.01')
    expect(groupTaxFromStoredNet([{ taxRate: '50', netAmount: '-0.01' }])[0].tax).toBe('-0.01')
  })

  it('Eigenschaft: Für 3000 gültige, vom Calculator erzeugte Rechnungen gilt Σ Gruppensteuer = totalTax und Netto + Steuer = Brutto', () => {
    let seed = 20261012
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n }
    const rates = ['19', '7', '0', '5.5', '16']
    let differs = 0
    for (let i = 0; i < 3000; i++) {
      const doc = Array.from({ length: 1 + rnd(12) }, () => ({
        quantity:     `${1 + rnd(50)}.${String(rnd(1000)).padStart(3, '0')}`,
        unitPrice:    `${rnd(300)}.${String(rnd(100)).padStart(2, '0')}`,
        taxRate:      rates[rnd(rates.length)],
        discountRate: rnd(4) === 0 ? `${rnd(60)}.${String(rnd(100)).padStart(2, '0')}` : '0',
      }))
      const calc = calculateInvoiceForPersistence(doc)
      const groups = groupTaxFromStoredNet(calc.lines.map((l, k) => ({ taxRate: doc[k].taxRate, netAmount: l.netAmount })))
      const sumTax = groups.reduce((s, g) => s.plus(g.tax), new MoneyDecimal(0))
      expect(sumTax.toFixed(2)).toBe(calc.totalTax)
      expect(new MoneyDecimal(calc.totalNet).plus(calc.totalTax).toFixed(2)).toBe(calc.totalGross)
      // Dokumentation: Die alte Seitenlogik (Σ Positionssteuern) wich real ab.
      const legacy = calc.lines.reduce((s, l) => s.plus(l.taxAmount), new MoneyDecimal(0))
      if (legacy.toFixed(2) !== calc.totalTax) differs++
    }
    expect(differs).toBeGreaterThan(0)
  })
})
