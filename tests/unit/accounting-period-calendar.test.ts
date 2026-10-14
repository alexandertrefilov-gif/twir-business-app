// REQ-029 P5-6 B-1 / B1: Buchhaltungsperioden sind Kalendergrenzen in Europe/Berlin, dargestellt als UTC-Mitternacht
// (gleiche Darstellung wie gespeicherte Kalendertage invoiceDate/paymentDate) – unabhängig von process.env.TZ.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveAccountingPeriod } from '@/lib/accounting/period'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const inPeriod = (period: ReturnType<typeof resolveAccountingPeriod>, iso: string) => {
  const d = day(iso)
  return d >= period.from && d < period.toExclusive
}

describe('B1 Monat', () => {
  const p = resolveAccountingPeriod({ period: 'month' }, new Date('2026-10-12T12:00:00Z'))
  it('Grenzen sind UTC-Mitternacht der Berliner Kalendertage', () => {
    expect(p.from.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(p.toExclusive.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(p.fromInput).toBe('2026-10-01')
    expect(p.toInput).toBe('2026-10-31')
    expect(p.label).toBe('01.10.2026 – 31.10.2026')
  })
  it('ordnet gespeicherte Kalendertage an den Rändern richtig zu', () => {
    expect(inPeriod(p, '2026-09-30')).toBe(false)
    expect(inPeriod(p, '2026-10-01')).toBe(true)
    expect(inPeriod(p, '2026-10-31')).toBe(true)
    expect(inPeriod(p, '2026-11-01')).toBe(false)
  })
})

describe('B1 Quartal und Jahr', () => {
  it.each([
    ['2026-02-10T12:00:00Z', '2026-01-01', '2026-03-31'],
    ['2026-05-15T12:00:00Z', '2026-04-01', '2026-06-30'],
    ['2026-08-15T12:00:00Z', '2026-07-01', '2026-09-30'],
    ['2026-11-15T12:00:00Z', '2026-10-01', '2026-12-31'],
  ])('Quartal %s → %s .. %s', (now, from, to) => {
    const p = resolveAccountingPeriod({ period: 'quarter' }, new Date(now))
    expect([p.fromInput, p.toInput]).toEqual([from, to])
    expect(p.from.toISOString()).toBe(`${from}T00:00:00.000Z`)
    expect(p.toExclusive.getTime() - day(to).getTime()).toBe(86_400_000)
  })
  it('Jahr 2026: Jahresränder', () => {
    const p = resolveAccountingPeriod({ period: 'year' }, new Date('2026-06-15T12:00:00Z'))
    expect(inPeriod(p, '2025-12-31')).toBe(false)
    expect(inPeriod(p, '2026-01-01')).toBe(true)
    expect(inPeriod(p, '2026-12-31')).toBe(true)
    expect(inPeriod(p, '2027-01-01')).toBe(false)
  })
})

describe('B1 Monatsenden und Schaltjahr', () => {
  it.each([
    ['2028-02-15T12:00:00Z', '2028-02-29', '2028-03-01'],
    ['2027-02-15T12:00:00Z', '2027-02-28', '2027-03-01'],
    ['2026-04-15T12:00:00Z', '2026-04-30', '2026-05-01'],
    ['2026-12-15T12:00:00Z', '2026-12-31', '2027-01-01'],
    ['2027-03-15T12:00:00Z', '2027-03-31', '2027-04-01'],
  ])('Monat von %s endet am %s (exklusiv %s)', (now, last, exclusive) => {
    const p = resolveAccountingPeriod({ period: 'month' }, new Date(now))
    expect(p.toInput).toBe(last)
    expect(p.toExclusive.toISOString()).toBe(`${exclusive}T00:00:00.000Z`)
  })
})

describe('B1 „heute" ist der Berliner Kalendertag (Berlin-Mitternacht, Jahres- und Quartalswechsel)', () => {
  it.each([
    ['month', '2026-09-30T21:59:59Z', '2026-09-01', '2026-09-30'],
    ['month', '2026-09-30T22:00:00Z', '2026-10-01', '2026-10-31'],
    ['month', '2026-09-30T22:30:00Z', '2026-10-01', '2026-10-31'],
    ['quarter', '2026-09-30T22:30:00Z', '2026-10-01', '2026-12-31'],
    ['quarter', '2026-12-31T23:30:00Z', '2027-01-01', '2027-03-31'],
    ['year', '2026-12-31T23:30:00Z', '2027-01-01', '2027-12-31'],
    ['year', '2026-12-31T22:59:59Z', '2026-01-01', '2026-12-31'],
    ['month', '2027-01-01T04:30:00Z', '2027-01-01', '2027-01-31'],
  ])('%s @ %s → %s .. %s', (preset, now, from, to) => {
    const p = resolveAccountingPeriod({ period: preset }, new Date(now))
    expect([p.fromInput, p.toInput]).toEqual([from, to])
  })
})

describe('B1 benutzerdefinierter Zeitraum', () => {
  it('übernimmt gültige Kalendertage 1:1 (inklusive Schalttag)', () => {
    const p = resolveAccountingPeriod({ period: 'custom', from: '2028-02-29', to: '2028-03-01' }, new Date('2028-03-05T12:00:00Z'))
    expect(p.from.toISOString()).toBe('2028-02-29T00:00:00.000Z')
    expect(p.toExclusive.toISOString()).toBe('2028-03-02T00:00:00.000Z')
    expect([p.fromInput, p.toInput]).toEqual(['2028-02-29', '2028-03-01'])
    expect(p.label).toBe('29.02.2028 – 01.03.2028')
  })
  it('vertauscht from/to, wenn to < from', () => {
    const p = resolveAccountingPeriod({ period: 'custom', from: '2026-10-20', to: '2026-10-05' }, new Date('2026-10-30T12:00:00Z'))
    expect([p.fromInput, p.toInput]).toEqual(['2026-10-05', '2026-10-20'])
  })
  it('ungültiges Datum (29.02.2027) fällt auf Monatsanfang/heute zurück', () => {
    const p = resolveAccountingPeriod({ period: 'custom', from: '2027-02-29', to: '2027-03-01' }, new Date('2027-03-05T12:00:00Z'))
    expect([p.fromInput, p.toInput]).toEqual(['2027-03-01', '2027-03-01'])
  })
  it('Format ungleich YYYY-MM-DD wird verworfen', () => {
    const p = resolveAccountingPeriod({ period: 'custom', from: '1.10.2026', to: '2026-10-05' }, new Date('2026-10-12T12:00:00Z'))
    expect(p.fromInput).toBe('2026-10-01')
  })
})

describe('B1 unabhängig von process.env.TZ (Laufzeit-Wechsel)', () => {
  const original = process.env.TZ
  afterEach(() => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original })
  it.each(['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Auckland', 'Asia/Tokyo'])('TZ=%s: identische Perioden und Zuordnung', (zone) => {
    process.env.TZ = zone
    const month = resolveAccountingPeriod({ period: 'month' }, new Date('2026-10-12T12:00:00Z'))
    expect(month.from.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(month.toExclusive.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(inPeriod(month, '2026-10-01')).toBe(true)
    expect(inPeriod(month, '2026-11-01')).toBe(false)
    const year = resolveAccountingPeriod({ period: 'year' }, new Date('2026-06-15T12:00:00Z'))
    expect(inPeriod(year, '2026-01-01')).toBe(true)
    expect(inPeriod(year, '2027-01-01')).toBe(false)
    const edge = resolveAccountingPeriod({ period: 'month' }, new Date('2026-09-30T22:30:00Z'))
    expect(edge.fromInput).toBe('2026-10-01')
    expect(month.label).toBe('01.10.2026 – 31.10.2026')
  })
})

describe('B1 statischer Schutz', () => {
  it('period.ts enthält keine lokalen Datums-Getter/-Konstruktoren und keine toLocale*-Ausgabe', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/accounting/period.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(src).not.toMatch(/\.getFullYear\(|\.getMonth\(|\.getDate\(|\.setDate\(|\.setHours\(|toLocale/)
    expect(src).not.toMatch(/new Date\(\s*[a-zA-Z.]*[Yy]ear|new Date\(\s*year\s*,/)
  })
})
