import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import {
  QUANTITY_SPEC, UNIT_PRICE_SPEC, decimalInputSchema, legacyNumberToDecimalString, validateDecimalField,
} from '@/lib/billing/decimal-input'
import { formatDecimalDe } from '@/lib/billing/format'

describe('validateDecimalField – Einzelpreis (max. 2 Nachkommastellen, keine Rundung)', () => {
  it.each([
    ['0', '0'], ['0.00', '0'], ['12', '12'], ['12.5', '12.5'], ['12.50', '12.5'], ['12.34', '12.34'],
    ['99999999', '99999999'], ['99999999.99'.slice(0, 8), '99999999'], ['  7.10 ', '7.1'], ['0.01', '0.01'],
  ])('akzeptiert "%s" → "%s"', (input, expected) => {
    expect(validateDecimalField(input, UNIT_PRICE_SPEC)).toEqual({ ok: true, value: expected })
  })

  it.each(['10.005', '10.001', '10.0001', '0.001', '1.999', '12.345'])('lehnt %s (≥ 3 Nachkommastellen) mit verständlicher Meldung ab', (input) => {
    const result = validateDecimalField(input, UNIT_PRICE_SPEC)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('Einzelpreis')
      expect(result.message).toContain('höchstens 2 Nachkommastellen')
      expect(result.message).toContain('nicht automatisch gerundet')
    }
  })

  it('erlaubt Nullen am Ende jenseits der zweiten Stelle (kein Wertverlust)', () => {
    expect(validateDecimalField('12.500', UNIT_PRICE_SPEC)).toEqual({ ok: true, value: '12.5' })
    expect(validateDecimalField('12.5000', UNIT_PRICE_SPEC)).toEqual({ ok: true, value: '12.5' })
  })

  it.each(['', '  ', 'abc', '1,5', '1e3', 'NaN', 'Infinity', '--1', '1.', '.5'])('lehnt "%s" ab', (input) => {
    expect(validateDecimalField(input, UNIT_PRICE_SPEC).ok).toBe(false)
  })

  it('prüft Bereich: negativ und über 99.999.999 abgelehnt', () => {
    expect(validateDecimalField('-0.01', UNIT_PRICE_SPEC)).toMatchObject({ ok: false })
    expect(validateDecimalField('100000000', UNIT_PRICE_SPEC)).toMatchObject({ ok: false })
    expect(validateDecimalField('99999999.99', UNIT_PRICE_SPEC)).toMatchObject({ ok: false }) // > 99.999.999
  })

  it('JS-Zahlen: exakte Klartext-Überführung, Float-Reste werden abgelehnt', () => {
    expect(validateDecimalField(19.99, UNIT_PRICE_SPEC)).toEqual({ ok: true, value: '19.99' })
    expect(validateDecimalField(0.1 + 0.2, UNIT_PRICE_SPEC)).toMatchObject({ ok: false })
    expect(validateDecimalField(Number.NaN, UNIT_PRICE_SPEC)).toMatchObject({ ok: false })
    expect(validateDecimalField(Number.POSITIVE_INFINITY, UNIT_PRICE_SPEC)).toMatchObject({ ok: false })
    expect(legacyNumberToDecimalString(1.005)).toBe('1.005')
  })
})

describe('validateDecimalField – Menge (max. 3 Nachkommastellen, > 0)', () => {
  it('akzeptiert 3 Nachkommastellen, lehnt 4 ab, verlangt > 0', () => {
    expect(validateDecimalField('1.500', QUANTITY_SPEC)).toEqual({ ok: true, value: '1.5' })
    expect(validateDecimalField('0.001', QUANTITY_SPEC)).toEqual({ ok: true, value: '0.001' })
    expect(validateDecimalField('1.5555', QUANTITY_SPEC)).toMatchObject({ ok: false })
    expect(validateDecimalField('0', QUANTITY_SPEC)).toMatchObject({ ok: false })
    expect(validateDecimalField('-1', QUANTITY_SPEC)).toMatchObject({ ok: false })
    expect(validateDecimalField('999999', QUANTITY_SPEC)).toEqual({ ok: true, value: '999999' })
    expect(validateDecimalField('999999.001', QUANTITY_SPEC)).toMatchObject({ ok: false })
  })
})

describe('Zod-Schema: Positions-Index in der Fehlermeldung', () => {
  it('stellt "Position n:" voran, wenn der Pfad einen Index enthält', async () => {
    const { z } = await import('zod')
    const schema = z.object({ items: z.array(z.object({ unitPrice: decimalInputSchema(UNIT_PRICE_SPEC) })) })
    const result = schema.safeParse({ items: [{ unitPrice: '1.00' }, { unitPrice: '2.005' }] })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toMatch(/^Position 2: Einzelpreis/)
  })
})

describe('Verlustfreie Rückführung String → Zahl → Decimal(12,2) (kein stilles Runden in Prisma)', () => {
  function makeRng(seed: number) {
    let state = seed >>> 0
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000 }
  }
  it('20000 zufällige Preise mit ≤ 2 Nachkommastellen bleiben exakt (Number → Decimal(…).toFixed(2))', () => {
    const rnd = makeRng(8102026)
    for (let i = 0; i < 20000; i++) {
      const cents = BigInt(Math.floor(rnd() * 9_999_999_900))
      const text = `${cents / BigInt('100')}.${(cents % BigInt('100')).toString().padStart(2, '0')}`
      const result = validateDecimalField(text, UNIT_PRICE_SPEC)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      // Brücke wie in den Schemas: Zahl für bestehende Services; Prisma wandelt Zahlen über decimal.js
      const asNumber = Number(result.value)
      expect(new Decimal(asNumber).toFixed(2)).toBe(text)
    }
  })

  it('Mengen mit ≤ 3 Nachkommastellen bleiben exakt (Decimal(10,3))', () => {
    const rnd = makeRng(3102026)
    for (let i = 0; i < 20000; i++) {
      const milli = BigInt(Math.floor(rnd() * 999_999_000) + 1)
      const text = `${milli / BigInt('1000')}.${(milli % BigInt('1000')).toString().padStart(3, '0')}`
      const result = validateDecimalField(text, QUANTITY_SPEC)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(new Decimal(Number(result.value)).toFixed(3)).toBe(text)
    }
  })
})

describe('formatDecimalDe', () => {
  it.each([
    ['0', '0,00'], ['1234.5', '1.234,50'], ['-1234567.891', '-1.234.567,89'], ['-0.004', '0,00'], ['0.005', '0,01'],
  ])('%s → %s', (input, expected) => {
    expect(formatDecimalDe(input)).toBe(expected)
  })
})
