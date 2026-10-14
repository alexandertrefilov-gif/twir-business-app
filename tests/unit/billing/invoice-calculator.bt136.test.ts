import { describe, expect, it } from 'vitest'
import { calculateInvoice, type CalcLineInput } from '@/lib/billing'
import { MoneyDecimal, roundCents } from '@/lib/billing/money'

/**
 * P5-4 Schritt 1 – Charakterisierung BT-136 (Positionsabschlag/Rabattbetrag).
 *
 * Festgelegte Semantik (Owner-Entscheidung, DEC P5-4):
 *  - BT-131 (lineNet) ist maßgeblich und unverändert: genau eine Rundung.
 *  - BT-136 ist der aus BT-131 ABGELEITETE tatsächliche Rabattbetrag
 *    (`discountAmountDerived`), NICHT unabhängig round(Basis × Rabatt-%).
 *  - BT-137 = baseAmountRounded.
 *  - Invariante: baseAmountRounded + Zuschläge − Abschläge − BT-136 = BT-131.
 *  - Abweichungen zu round(Basis × BT-138) um bis zu 1 Cent sind erwartet und
 *    hier dokumentiert. Ob das für das gewählte E-Rechnungsprofil
 *    (EN 16931 / Business Rules) zulässig ist, ist VOR P7 (CII/KoSIT) zu prüfen
 *    und wird hier ausdrücklich NICHT als konform festgeschrieben.
 */

const line = (quantity: string, unitPrice: string, discountRate: string, extra: Partial<CalcLineInput> = {}): CalcLineInput => ({
  key: 'a', quantity, unitPrice, taxRate: '19', taxCategory: 'S', discountRate, ...extra,
})

/** Unabhängige Gegenrechnung – ausdrücklich NICHT die Quelle von BT-136. */
const independentPercentDiscount = (q: string, p: string, d: string): string =>
  roundCents(new MoneyDecimal(q).times(p).times(d).dividedBy(100)).toFixed(2)

type Case = {
  name: string; q: string; p: string; d: string
  base: string; net: string; derived: string; independent: string; deviates: boolean
}

// Werte aus dem P5-4-Audit, am echten Calculator erhoben.
const CASES: Case[] = [
  { name: '3 × 3,335 @ 10 %',      q: '3',    p: '3.335',  d: '10',    base: '10.01', net: '9.00',  derived: '1.01', independent: '1.00', deviates: true  },
  { name: '1 × 0,05 @ 50 %',       q: '1',    p: '0.05',   d: '50',    base: '0.05',  net: '0.03',  derived: '0.02', independent: '0.03', deviates: true  },
  { name: '1 × 100,005 @ 0,01 %',  q: '1',    p: '100.005', d: '0.01', base: '100.01', net: '99.99', derived: '0.02', independent: '0.01', deviates: true  },
  { name: '9 × 1,115 @ 12,5 %',    q: '9',    p: '1.115',  d: '12.5',  base: '10.04', net: '8.78',  derived: '1.26', independent: '1.25', deviates: true  },
  { name: '3 × 19,99 @ 15 %',      q: '3',    p: '19.99',  d: '15',    base: '59.97', net: '50.97', derived: '9.00', independent: '9.00', deviates: false },
  { name: '7 × 0,0715 @ 33,33 %',  q: '7',    p: '0.0715', d: '33.33', base: '0.50',  net: '0.33',  derived: '0.17', independent: '0.17', deviates: false },
]

describe('BT-136: Charakterisierung des abgeleiteten Rabattbetrags', () => {
  describe.each(CASES)('$name', (c) => {
    const l = calculateInvoice([line(c.q, c.p, c.d)]).lines[0]

    it('erwartete Werte (BT-137, BT-131, BT-136)', () => {
      expect(l.baseAmountRounded).toBe(c.base)
      expect(l.lineNet).toBe(c.net)
      expect(l.discountAmountDerived).toBe(c.derived)
    })

    it('Invariante: gerundete Basis + Zuschläge − Abschläge − BT-136 = BT-131', () => {
      const lhs = new MoneyDecimal(l.baseAmountRounded).minus(l.discountAmountDerived)
      expect(lhs.toFixed(2)).toBe(l.lineNet)
    })

    it('BT-136 ist NICHT unabhängig round(Basis × Prozent); Abweichung dokumentiert', () => {
      expect(independentPercentDiscount(c.q, c.p, c.d)).toBe(c.independent)
      expect(l.discountAmountDerived === c.independent).toBe(!c.deviates)
      const diff = new MoneyDecimal(l.discountAmountDerived).minus(c.independent).abs()
      expect(diff.lte('0.01')).toBe(true) // höchstens 1 Cent – keine Konformitätsaussage
    })
  })

  it('der Eingabe-Rabatt ändert BT-131 nicht rückwirkend: BT-131 = round(Basis − Basis×%) einmal gerundet', () => {
    for (const c of CASES) {
      const base = new MoneyDecimal(c.q).times(c.p)
      const expected = roundCents(base.minus(base.times(c.d).dividedBy(100))).toFixed(2)
      expect(calculateInvoice([line(c.q, c.p, c.d)]).lines[0].lineNet).toBe(expected)
    }
  })

  it('Zuschläge/Abschläge: Invariante gilt mit beiden (1 × 1,15 @ 30 %, +2,00, −0,50)', () => {
    const l = calculateInvoice([line('1', '1.15', '30', { surcharges: ['2.00'], allowances: ['0.50'] })]).lines[0]
    expect(l).toMatchObject({ baseAmountRounded: '1.15', lineNet: '2.31', discountAmountDerived: '0.34' })
    const lhs = new MoneyDecimal(l.baseAmountRounded).plus('2.00').minus('0.50').minus(l.discountAmountDerived)
    expect(lhs.toFixed(2)).toBe(l.lineNet)
  })

  it('ohne Rabatt ist BT-136 = 0,00 und BT-131 = gerundete Basis', () => {
    const l = calculateInvoice([line('3', '3.335', '0')]).lines[0]
    expect(l.discountAmountDerived).toBe('0.00')
    expect(l.lineNet).toBe(l.baseAmountRounded)
  })

  it('Preisbasis: Invariante gilt auch bei Preis je N Einheiten (250 × 12,40 / 100 @ 7 %)', () => {
    const l = calculateInvoice([line('250', '12.40', '7', { priceBase: '100' })]).lines[0]
    expect(new MoneyDecimal(l.baseAmountRounded).minus(l.discountAmountDerived).toFixed(2)).toBe(l.lineNet)
  })

  it('Eigenschaftstest: Invariante und |BT-136 − round(Basis×%)| ≤ 0,01 über 3000 deterministische Fälle', () => {
    let seed = 20261012
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n }
    let deviations = 0
    for (let i = 0; i < 3000; i++) {
      const q = `${1 + rnd(2000)}.${String(rnd(1000)).padStart(3, '0')}`
      const p = `${rnd(500)}.${String(rnd(10000)).padStart(4, '0')}`
      const d = `${rnd(100)}.${String(rnd(100)).padStart(2, '0')}`
      const l = calculateInvoice([line(q, p, d)]).lines[0]
      expect(new MoneyDecimal(l.baseAmountRounded).minus(l.discountAmountDerived).toFixed(2)).toBe(l.lineNet)
      const diff = new MoneyDecimal(l.discountAmountDerived).minus(independentPercentDiscount(q, p, d)).abs()
      expect(diff.lte('0.01')).toBe(true)
      if (!diff.isZero()) deviations++
    }
    expect(deviations).toBeGreaterThan(0) // die Abweichung existiert real und ist dokumentiert
  })
})
