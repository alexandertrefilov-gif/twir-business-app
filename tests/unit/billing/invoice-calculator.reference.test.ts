// Unabhängiges Referenzmodell mit BigInt-Ganzzahlen (kein decimal.js in der Berechnung).
import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { calculateInvoice, type CalcLineInput } from '@/lib/billing'

function refRoundDiv(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < BigInt('0')
  const abs = negative ? -numerator : numerator
  const rounded = (BigInt('2') * abs + denominator) / (BigInt('2') * denominator)
  return negative ? -rounded : rounded
}
// Wert×1e5 = Menge×1e3 · Preis×1e2 ; Rabatt: ×(10000 − r)/10000 → Wert×1e9 ; ÷1e7 → Cent
function refLineNetCents(qMilli: bigint, priceCents: bigint, discHundredths: bigint): bigint {
  return refRoundDiv(qMilli * priceCents * (BigInt('10000') - discHundredths), BigInt('10') ** BigInt('7'))
}
function refTaxCents(taxableCents: bigint, rateHundredths: bigint): bigint {
  return refRoundDiv(taxableCents * rateHundredths, BigInt('10000'))
}
function fmt(value: bigint, decimals: number): string {
  const s = value.toString().padStart(decimals + 1, '0')
  return `${s.slice(0, s.length - decimals)}.${s.slice(s.length - decimals)}`
}
function makeRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}
const cents = (value: string) => new Decimal(value).times(100).toFixed(0)

describe('Property-/Referenztest (deterministischer Zufall, Seed 20261008)', () => {
  it('3000 Zufallsdokumente stimmen mit dem BigInt-Referenzmodell überein; reihenfolgeunabhängig; idempotent', () => {
    const rnd = makeRng(20261008)
    const pick = (max: number) => Math.floor(rnd() * max)
    const rates = ['7', '19', '5.5', '16']

    for (let doc = 0; doc < 3000; doc++) {
      const count = 1 + pick(8)
      const inputs: CalcLineInput[] = []
      const refs: { qMilli: bigint; priceCents: bigint; disc: bigint; rate: bigint }[] = []
      for (let i = 0; i < count; i++) {
        const qMilli = BigInt(1 + pick(5_000_000))
        const priceCents = BigInt(pick(2_000_000))
        const disc = BigInt(pick(2) === 0 ? 0 : pick(10001))
        const rateStr = rates[pick(rates.length)]
        inputs.push({
          key: `k${i}`, quantity: fmt(qMilli, 3), unitPrice: fmt(priceCents, 2),
          discountRate: fmt(disc, 2), taxRate: rateStr, taxCategory: 'S',
        })
        refs.push({ qMilli, priceCents, disc, rate: BigInt(cents(rateStr)) })
      }

      const result = calculateInvoice(inputs)

      const byRate = new Map<string, { rate: bigint; taxable: bigint }>()
      let netSum = BigInt('0')
      refs.forEach((ref, index) => {
        const net = refLineNetCents(ref.qMilli, ref.priceCents, ref.disc)
        expect(cents(result.lines[index].lineNet)).toBe(net.toString())
        netSum += net
        const group = byRate.get(ref.rate.toString()) ?? { rate: ref.rate, taxable: BigInt('0') }
        group.taxable += net
        byRate.set(ref.rate.toString(), group)
      })
      let taxSum = BigInt('0')
      for (const group of byRate.values()) taxSum += refTaxCents(group.taxable, group.rate)

      expect(cents(result.totals.lineNetSum)).toBe(netSum.toString())
      expect(cents(result.totals.taxTotal)).toBe(taxSum.toString())
      expect(cents(result.totals.grandTotal)).toBe((netSum + taxSum).toString())

      const other = calculateInvoice([...inputs].reverse())
      expect(other.totals).toEqual(result.totals)
      expect(other.vat).toEqual(result.vat)
      expect(calculateInvoice(inputs)).toEqual(result)
    }
  })
})
