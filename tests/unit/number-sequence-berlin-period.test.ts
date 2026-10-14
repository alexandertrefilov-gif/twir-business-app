// REQ-029 P5-6 B-1 / A1: Nummernkreis-Periode nach dem Kalendertag in Europe/Berlin zum Zeitpunkt der Vergabe.
// Maßgeblich ist weder UTC noch process.env.TZ (Owner-Entscheidung D-2).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({ prisma: { numberSequence: { findMany: m.findMany } } }))

import { formatOfferNumber, getSequenceStatus, nextNumber } from '@/lib/services/number-sequence.service'
import { NumberSequenceType } from '@/types/enums'

interface Issued { periodKey: number; number: string }

/** Führt nextNumber gegen eine Fake-Transaktion aus (leere Tabelle → Bootstrap-Zeile) und liefert Periodenschlüssel + Nummer. */
async function issue(type: NumberSequenceType, at: string, existingLast = 0): Promise<Issued> {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(at))
  let periodKey = -1
  const tx = {
    $queryRaw: async () => [],
    companySetting: { findFirst: async () => null },
    numberSequence: {
      create: async ({ data }: { data: { year: number; prefix: string } }) => {
        periodKey = data.year
        return { id: 's', lastNumber: existingLast, prefix: data.prefix, format: '{prefix}{year}-{number:04}' }
      },
      update: async () => ({}),
    },
  }
  try {
    const number = await nextNumber(type, tx as never)
    return { periodKey, number }
  } finally {
    vi.useRealTimers()
  }
}

beforeEach(() => { m.findMany.mockReset(); m.findMany.mockResolvedValue([]) })
afterEach(() => { vi.useRealTimers() })

describe('A1 Rechnung/Auftrag/Leistung: Jahr = Berliner Kalenderjahr der Vergabe', () => {
  it.each([
    // [Zeitpunkt (UTC), erwartetes Berliner Jahr, Beschreibung]
    ['2026-12-31T22:30:00Z', 2026, 'Berlin 31.12. 23:30'],
    ['2026-12-31T23:00:00Z', 2027, 'Berlin 01.01. 00:00 (exakt Jahreswechsel, CET)'],
    ['2026-12-31T23:30:00Z', 2027, 'Berlin 01.01. 00:30 – UTC-Kalender wäre noch 2026'],
    ['2027-01-01T04:30:00Z', 2027, 'Berlin 05:30; New York noch 31.12. 23:30'],
    ['2027-01-01T05:30:00Z', 2027, 'Berlin 06:30; New York 00:30 am 01.01.'],
    ['2027-12-31T22:59:59Z', 2027, 'Berlin 31.12. 23:59:59'],
    ['2028-02-29T23:30:00Z', 2028, 'Schalttag, Berlin 01.03.'],
  ])('%s → Jahr %i (%s)', async (at, year) => {
    const r = await issue(NumberSequenceType.INVOICE, at)
    expect(r.periodKey).toBe(year)
    expect(r.number).toBe(`RE${year}-0001`)
  })

  it('numeriert innerhalb der Berliner Periode fortlaufend weiter', async () => {
    const r = await issue(NumberSequenceType.INVOICE, '2027-03-10T10:00:00Z', 41)
    expect(r.number).toBe('RE2027-0042')
  })
})

describe('A1 Angebot: Periode YYYYMM und Nummer = Berliner Kalendermonat der Vergabe', () => {
  it.each([
    ['2026-09-30T21:59:59Z', 202609, 'AN 260901', 'Berlin 30.09. 23:59:59 (CEST)'],
    ['2026-09-30T22:00:00Z', 202610, 'AN 261001', 'Berlin 01.10. 00:00 (CEST)'],
    ['2026-09-30T22:30:00Z', 202610, 'AN 261001', 'Berlin 01.10. 00:30'],
    ['2026-10-01T04:30:00Z', 202610, 'AN 261001', 'New York noch 01.10. 00:30'],
    ['2026-10-31T22:59:59Z', 202610, 'AN 261001', 'Berlin 31.10. 23:59:59 (CET nach DST-Ende)'],
    ['2026-10-31T23:00:00Z', 202611, 'AN 261101', 'Berlin 01.11. 00:00 (CET)'],
    ['2026-12-31T23:30:00Z', 202701, 'AN 270101', 'Jahreswechsel Berlin'],
    ['2028-02-29T22:30:00Z', 202802, 'AN 280201', 'Berlin 29.02. 23:30 (noch Februar)'],
    ['2028-02-29T23:30:00Z', 202803, 'AN 280301', 'Berlin 01.03. 00:30 (Schalttag davor)'],
  ])('%s → Periode %i, Nummer %s (%s)', async (at, period, number) => {
    const r = await issue(NumberSequenceType.OFFER, at)
    expect(r.periodKey).toBe(period)
    expect(r.number).toBe(number)
  })

  it('Periodenschlüssel und Nummernbestandteil stammen aus demselben Berliner Monat (keine Mischung)', async () => {
    for (const at of ['2026-09-30T22:30:00Z', '2026-12-31T23:30:00Z', '2026-06-30T21:59:00Z', '2026-06-30T22:00:00Z']) {
      const r = await issue(NumberSequenceType.OFFER, at)
      const yymm = r.number.replace(/^AN /, '').slice(0, 4)
      expect(String(r.periodKey).slice(2)).toBe(yymm)
    }
  })
})

describe('A1 formatOfferNumber (Zeitpunkt → Berliner Monat)', () => {
  it.each([
    ['2026-09-30T22:30:00Z', 'AN 261001'],
    ['2026-09-30T21:30:00Z', 'AN 260901'],
    ['2026-12-31T23:30:00Z', 'AN 270101'],
    ['2027-01-01T04:30:00Z', 'AN 270101'],
  ])('%s → %s', (at, expected) => {
    expect(formatOfferNumber(new Date(at), 'AN', 1)).toBe(expected)
  })
})

describe('A1 getSequenceStatus (Anzeige der aktuellen Zähler) nutzt dieselbe Berliner Periode', () => {
  it.each([
    ['2026-12-31T23:30:00Z', 2027, 202701],
    ['2026-12-31T22:30:00Z', 2026, 202612],
    ['2026-09-30T22:30:00Z', 2026, 202610],
  ])('%s → Jahr %i, Angebotsperiode %i', async (at, year, offerPeriod) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(at))
    await getSequenceStatus()
    vi.useRealTimers()
    const where = m.findMany.mock.calls[0][0].where
    expect(where.OR[0].year).toBe(year)
    expect(where.OR[1].year).toBe(offerPeriod)
  })
})

describe('A1 unabhängig von process.env.TZ (Laufzeit-Wechsel)', () => {
  const original = process.env.TZ
  afterEach(() => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original })

  it.each(['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Auckland', 'Asia/Tokyo'])('TZ=%s: identische Ergebnisse', async (zone) => {
    process.env.TZ = zone
    const inv = await issue(NumberSequenceType.INVOICE, '2026-12-31T23:30:00Z')
    const off = await issue(NumberSequenceType.OFFER, '2026-09-30T22:30:00Z')
    const nyEarly = await issue(NumberSequenceType.INVOICE, '2027-01-01T04:30:00Z')
    expect(inv).toEqual({ periodKey: 2027, number: 'RE2027-0001' })
    expect(off).toEqual({ periodKey: 202610, number: 'AN 261001' })
    expect(nyEarly).toEqual({ periodKey: 2027, number: 'RE2027-0001' })
  })
})

describe('A1 statischer Schutz', () => {
  it('number-sequence.service.ts enthält keine lokalen Datums-Getter', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/services/number-sequence.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(src).not.toMatch(/\.getFullYear\(|\.getMonth\(|\.getDate\(|\.setMonth\(|\.setHours\(/)
  })
})
