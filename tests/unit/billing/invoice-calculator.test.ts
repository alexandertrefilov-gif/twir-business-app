import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import {
  calculateInvoice,
  calculateLineNet,
  InvoiceCalculationError,
  type CalcLineInput,
} from '@/lib/billing'
import { MoneyDecimal, parseDecimal, roundCents, toCentString } from '@/lib/billing/money'

const line = (key: string, quantity: string, unitPrice: string, taxRate = '19', extra: Partial<CalcLineInput> = {}): CalcLineInput => ({
  key, quantity, unitPrice, taxRate, taxCategory: 'S', ...extra,
})

describe('ROUND_HALF_UP (weg von Null bei exakter Hälfte)', () => {
  it.each([
    ['0.005', '0.01'], ['0.015', '0.02'], ['0.025', '0.03'], ['1.005', '1.01'], ['2.675', '2.68'],
    ['-0.005', '-0.01'], ['-0.015', '-0.02'], ['-1.005', '-1.01'], ['-2.675', '-2.68'],
    ['0.004', '0.00'], ['-0.004', '0.00'], ['0.0049999', '0.00'], ['-0.0049999', '0.00'],
  ])('roundCents(%s) = %s', (input, expected) => {
    expect(toCentString(roundCents(new MoneyDecimal(input)))).toBe(expected)
  })

  it('isolierter Decimal-Konstruktor: HALF_UP, Präzision 40', () => {
    expect(MoneyDecimal.rounding).toBe(Decimal.ROUND_HALF_UP)
    expect(MoneyDecimal.precision).toBe(40)
  })

  it('Positions-Netto: Halb-Cent positiv und negativ', () => {
    expect(calculateLineNet(line('a', '1', '0.005'))).toBe('0.01')
    expect(calculateLineNet(line('b', '-1', '0.005'))).toBe('-0.01')
    expect(calculateLineNet(line('c', '1.5', '0.01'))).toBe('0.02')
    expect(calculateLineNet(line('d', '-1.5', '0.01'))).toBe('-0.02')
  })
})

describe('Positions-Netto: Menge, Einzelpreis, Rabatt, genau eine Rundung', () => {
  it('ohne Rabatt', () => {
    expect(calculateLineNet(line('a', '10', '0.33'))).toBe('3.30')
    expect(calculateLineNet(line('b', '2.5', '19.99'))).toBe('49.98')
    expect(calculateLineNet(line('c', '0.333', '3.00'))).toBe('1.00')
  })

  it.each([
    ['1', '1.15', '30', '0.81'],
    ['3', '0.35', '10', '0.95'],
    ['1', '0.95', '10', '0.86'],
    ['1', '10.05', '15', '8.54'],
    ['7', '0.99', '5', '6.58'],
    ['2', '1.15', '30', '1.61'],
    ['1', '2.50', '10', '2.25'],
    ['3', '33.33', '12.5', '87.49'],
    ['1', '100.00', '100', '0.00'],
    ['1', '100.00', '0', '100.00'],
  ])('%s × %s € mit %s %% Rabatt = %s €', (quantity, unitPrice, discountRate, expected) => {
    expect(calculateLineNet(line('x', quantity, unitPrice, '19', { discountRate }))).toBe(expected)
  })

  it('Rabatt wirkt auf die ungerundete Basis (0,333 × 1,00 € @ 50 % = 0,1665 → 0,17)', () => {
    expect(calculateLineNet(line('x', '0.333', '1.00', '19', { discountRate: '50' }))).toBe('0.17')
  })

  it('Preisbasis: Preis gilt je 100 Einheiten', () => {
    expect(calculateLineNet(line('x', '250', '12.40', '19', { priceBase: '100' }))).toBe('31.00')
    expect(calculateLineNet(line('y', '1', '1.00', '19', { priceBase: '3' }))).toBe('0.33')
  })

  it('Zuschläge und Abschläge fließen vor der einen Rundung ein', () => {
    expect(calculateLineNet(line('x', '1', '1.15', '19', { discountRate: '30', surcharges: ['2.00'], allowances: ['0.50'] }))).toBe('2.31')
  })

  it('abgeleiteter Rabattbetrag: round(Basis) + Zuschläge − Abschläge − Rabatt = Netto', () => {
    const r = calculateInvoice([line('x', '1', '1.15', '19', { discountRate: '30' })])
    expect(r.lines[0]).toMatchObject({ baseAmountRounded: '1.15', discountAmountDerived: '0.34', lineNet: '0.81' })
  })
})

describe('Umsatzsteuer je Kategorie und Steuersatz (einmal gerundet)', () => {
  it('DEC-015 Fall 1: eine Position 10 × 0,33 € @ 19 % = 3,30 + 0,63 = 3,93', () => {
    const r = calculateInvoice([line('1', '10', '0.33')])
    expect(r.vat).toEqual([{ category: 'S', rate: '19.00', taxableAmount: '3.30', taxAmount: '0.63' }])
    expect(r.totals.grandTotal).toBe('3.93')
  })

  it('DEC-015 Fall 2: 3 Positionen × 0,50 € @ 19 % = 1,50 + 0,29 = 1,79', () => {
    const r = calculateInvoice([line('1', '1', '0.50'), line('2', '1', '0.50'), line('3', '1', '0.50')])
    expect(r.totals).toMatchObject({ lineNetSum: '1.50', taxBasisTotal: '1.50', taxTotal: '0.29', grandTotal: '1.79', payable: '1.79' })
  })

  it('DEC-015 Fall 3: 5 × 0,50 € @ 19 % = 2,50 + 0,48 = 2,98', () => {
    const r = calculateInvoice(Array.from({ length: 5 }, (_, i) => line(String(i), '1', '0.50')))
    expect(r.totals).toMatchObject({ taxBasisTotal: '2.50', taxTotal: '0.48', grandTotal: '2.98' })
  })

  it('DEC-015 Fall 4: 10 Positionen × 0,33 € @ 19 % = 3,30 + 0,63 = 3,93', () => {
    const r = calculateInvoice(Array.from({ length: 10 }, (_, i) => line(String(i), '1', '0.33')))
    expect(r.totals).toMatchObject({ taxBasisTotal: '3.30', taxTotal: '0.63', grandTotal: '3.93' })
  })

  it('Mischsätze 7 % / 19 %: Steuer je Satz einmal, sortiert nach Satz', () => {
    const r = calculateInvoice([
      line('a', '1', '10.01', '19'), line('b', '1', '20.02', '7'), line('c', '1', '0.01', '19'), line('d', '1', '0.07', '7'),
    ])
    expect(r.vat).toEqual([
      { category: 'S', rate: '7.00',  taxableAmount: '20.09', taxAmount: '1.41' },
      { category: 'S', rate: '19.00', taxableAmount: '10.02', taxAmount: '1.90' },
    ])
    expect(r.totals).toMatchObject({ taxBasisTotal: '30.11', taxTotal: '3.31', grandTotal: '33.42' })
  })

  it('Satz 0 % wird berechnet (Ablehnung ist Sache des Preflight)', () => {
    const r = calculateInvoice([line('a', '1', '10.00', '0')])
    expect(r.vat).toEqual([{ category: 'S', rate: '0.00', taxableAmount: '10.00', taxAmount: '0.00' }])
  })

  it('gleicher Satz in unterschiedlicher Schreibweise wird gruppiert', () => {
    const r = calculateInvoice([line('a', '1', '1.00', '19'), line('b', '1', '1.00', '19.0'), line('c', '1', '1.00', '19.00')])
    expect(r.vat).toHaveLength(1)
    expect(r.vat[0].taxableAmount).toBe('3.00')
  })

  it('Halbcent-Steuer: 0,50 € @ 19 % = 0,095 → 0,10; negativ → −0,10', () => {
    expect(calculateInvoice([line('a', '1', '0.50')]).totals.taxTotal).toBe('0.10')
    expect(calculateInvoice([line('a', '-1', '0.50')]).totals.taxTotal).toBe('-0.10')
  })
})

describe('Summengleichheit und Identitäten (BR-CO-10/13/14/15/16)', () => {
  it('leeres Dokument ergibt Nullen', () => {
    const r = calculateInvoice([])
    expect(r.vat).toEqual([])
    expect(r.totals).toEqual({ lineNetSum: '0.00', taxBasisTotal: '0.00', taxTotal: '0.00', grandTotal: '0.00', prepaid: '0.00', rounding: '0.00', payable: '0.00' })
  })

  it('Positionen = Steueraufschlüsselung = Kopf; BT-112 = BT-109 + BT-110; BT-115 = BT-112 − BT-113 + BT-114', () => {
    const r = calculateInvoice([
      line('a', '3', '0.35', '19', { discountRate: '10' }), line('b', '7', '0.99', '7', { discountRate: '5' }),
      line('c', '12.345', '9.99', '19'), line('d', '1', '0.01', '7'),
    ])
    const sum = (values: string[]) => values.reduce((acc, v) => acc.plus(v), new Decimal(0))
    expect(sum(r.lines.map((l) => l.lineNet)).toFixed(2)).toBe(r.totals.lineNetSum)
    expect(sum(r.vat.map((v) => v.taxableAmount)).toFixed(2)).toBe(r.totals.taxBasisTotal)
    expect(r.totals.taxBasisTotal).toBe(r.totals.lineNetSum)
    expect(sum(r.vat.map((v) => v.taxAmount)).toFixed(2)).toBe(r.totals.taxTotal)
    expect(new Decimal(r.totals.taxBasisTotal).plus(r.totals.taxTotal).toFixed(2)).toBe(r.totals.grandTotal)
    expect(r.totals.payable).toBe(r.totals.grandTotal)
    expect(r.totals.prepaid).toBe('0.00')
    expect(r.totals.rounding).toBe('0.00')
    expect(r.calcVersion).toBe('twir-calc-1')
  })

  it('Positions-Umsatzsteuer/-Brutto sind kein Teil des Ergebnisses', () => {
    const r = calculateInvoice([line('a', '1', '1.00')])
    expect(Object.keys(r.lines[0]).sort()).toEqual(['baseAmountRounded', 'discountAmountDerived', 'key', 'lineNet', 'taxCategory', 'taxRate'])
  })
})

describe('Exaktheit und Großbeträge', () => {
  it('Beträge über 2^53 Cent bleiben exakt', () => {
    const r = calculateInvoice([line('a', '999999.999', '99999999.99', '19'), line('b', '1', '99999999.99', '19')])
    const wert1e5 = BigInt('999999999') * BigInt('9999999999')
    const cents1 = (BigInt('2') * wert1e5 + BigInt('1000')) / BigInt('2000')
    const total = cents1 + BigInt('9999999999')
    expect(new Decimal(r.totals.lineNetSum).times(100).toFixed(0)).toBe(total.toString())
    expect(total > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true)
  })

  it('Storno-Symmetrie: negierte Mengen ergeben negierte Ergebnisse', () => {
    const pos = calculateInvoice([line('a', '3', '0.35', '19', { discountRate: '10' }), line('b', '5', '0.50')])
    const neg = calculateInvoice([line('a', '-3', '0.35', '19', { discountRate: '10' }), line('b', '-5', '0.50')])
    const negate = (v: string) => (v === '0.00' ? '0.00' : v.startsWith('-') ? v.slice(1) : `-${v}`)
    expect(neg.totals.lineNetSum).toBe(negate(pos.totals.lineNetSum))
    expect(neg.totals.taxTotal).toBe(negate(pos.totals.taxTotal))
    expect(neg.totals.grandTotal).toBe(negate(pos.totals.grandTotal))
  })

  it('Ergebnis "-0.00" wird als "0.00" ausgegeben', () => {
    expect(calculateLineNet(line('a', '-1', '0.004'))).toBe('0.00')
  })
})

describe('Eingabevalidierung', () => {
  it('lehnt JavaScript-Zahlen ab (Float-Schutz)', () => {
    expect(() => calculateInvoice([{ key: 'a', quantity: 1 as unknown as string, unitPrice: '1.00', taxRate: '19', taxCategory: 'S' }]))
      .toThrowError(InvoiceCalculationError)
  })

  it.each(['', ' ', 'abc', '1e3', '1,5', 'NaN', 'Infinity', '--1', '1.'])('lehnt "%s" ab', (bad) => {
    expect(() => calculateLineNet(line('a', bad, '1.00'))).toThrowError(/Menge/)
  })

  it('lehnt zu viele Nachkommastellen ab, erlaubt aber Nullen am Ende', () => {
    expect(() => calculateLineNet(line('a', '1.0001', '1.00'))).toThrowError(/Nachkommastellen/)
    expect(calculateLineNet(line('a', '1.000', '1.00'))).toBe('1.00')
    expect(calculateLineNet(line('a', '1.0000', '1.00'))).toBe('1.00')
    expect(() => calculateLineNet(line('a', '1', '1.00', '19', { discountRate: '10.001' }))).toThrowError(/Rabatt/)
  })

  it('prüft Wertebereiche, Kategorie und doppelte Schlüssel', () => {
    expect(() => calculateLineNet(line('a', '1', '1.00', '19', { discountRate: '100.01' }))).toThrowError(/Rabatt/)
    expect(() => calculateLineNet(line('a', '1', '1.00', '19', { discountRate: '-1' }))).toThrowError(/Rabatt/)
    expect(() => calculateLineNet(line('a', '1', '1.00', '100.01'))).toThrowError(/Steuersatz/)
    expect(() => calculateLineNet(line('a', '1', '1.00', '-1'))).toThrowError(/Steuersatz/)
    expect(() => calculateLineNet(line('a', '1', '1.00', '19', { priceBase: '0' }))).toThrowError(/Preisbasis/)
    expect(() => calculateLineNet({ key: 'a', quantity: '1', unitPrice: '1', taxRate: '19', taxCategory: 'E' as unknown as 'S' })).toThrowError(/Steuerkategorie/)
    expect(() => calculateInvoice([line('a', '1', '1.00'), line('a', '1', '2.00')])).toThrowError(/doppelt/)
  })

  it('akzeptiert Decimal-Objekte (decimal.js / Prisma.Decimal-kompatibel)', () => {
    expect(calculateLineNet({ key: 'a', quantity: new Decimal('10'), unitPrice: new Decimal('0.33'), taxRate: new Decimal('19'), taxCategory: 'S' })).toBe('3.30')
    expect(parseDecimal(new Decimal('0.001'), 'x', 3).toFixed()).toBe('0.001')
  })

  it('Fehler tragen Code und Positionsschlüssel', () => {
    let caught: unknown
    try { calculateLineNet(line('pos-7', 'x', '1.00')) } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(InvoiceCalculationError)
    expect((caught as InvoiceCalculationError).code).toBe('INVALID_NUMBER')
    expect((caught as InvoiceCalculationError).lineKey).toBe('pos-7')
  })
})
