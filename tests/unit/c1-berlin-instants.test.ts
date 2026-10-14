// P5-6 C-1: Berliner Tages-/Monatsgrenzen als echte Zeitpunkte und Zeitraumfilter-Helper.
import { afterEach, describe, expect, it } from 'vitest'
import {
  addCalendarDaysIso, berlinCalendarDate, berlinDayStartInstant, berlinMonthStartInstant, berlinNextDayStartInstant,
} from '@/lib/utils/berlin-date'
import { calendarDayRange, instantRangeForBerlinDays } from '@/lib/utils/date-range-filter'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'] as const
const originalTz = process.env.TZ
afterEach(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })
const iso = (d: Date | undefined) => d?.toISOString()

describe.each(ZONES)('berlinDayStartInstant — process TZ %s', (zone) => {
  it('Sommer- und Winterzeit, Umstellungstage', () => {
    process.env.TZ = zone
    expect(iso(berlinDayStartInstant('2026-01-15'))).toBe('2026-01-14T23:00:00.000Z')
    expect(iso(berlinDayStartInstant('2026-07-15'))).toBe('2026-07-14T22:00:00.000Z')
    expect(iso(berlinDayStartInstant('2026-03-29'))).toBe('2026-03-28T23:00:00.000Z')
    expect(iso(berlinDayStartInstant('2026-03-30'))).toBe('2026-03-29T22:00:00.000Z')
    expect(iso(berlinDayStartInstant('2026-10-25'))).toBe('2026-10-24T22:00:00.000Z')
    expect(iso(berlinDayStartInstant('2026-10-26'))).toBe('2026-10-25T23:00:00.000Z')
    expect(iso(berlinNextDayStartInstant('2026-12-31'))).toBe('2026-12-31T23:00:00.000Z')
  })

  it('Rundlauf 2024–2030: Tagesbeginn liegt exakt auf Berliner Mitternacht (Tag davor endet 1 ms früher)', () => {
    process.env.TZ = zone
    let day = '2024-01-01'
    while (day <= '2030-12-31') {
      const start = berlinDayStartInstant(day)
      expect(berlinCalendarDate(start)).toBe(day)
      expect(berlinCalendarDate(new Date(start.getTime() - 1))).toBe(addCalendarDaysIso(day, -1))
      day = addCalendarDaysIso(day, 1)
    }
  })

  it('Monatsbeginn', () => {
    process.env.TZ = zone
    expect(iso(berlinMonthStartInstant(new Date('2026-10-13T10:00:00Z')))).toBe('2026-09-30T22:00:00.000Z')
    expect(iso(berlinMonthStartInstant(new Date('2026-10-31T23:30:00Z')))).toBe('2026-10-31T23:00:00.000Z')
    expect(iso(berlinMonthStartInstant(new Date('2026-12-31T23:30:00Z')))).toBe('2026-12-31T23:00:00.000Z')
    expect(iso(berlinMonthStartInstant(new Date('2026-03-31T22:30:00Z')))).toBe('2026-03-31T22:00:00.000Z')
  })
})

describe('Eingabevalidierung', () => {
  it.each(['2026-02-30', '2026-13-01', '26-01-01', '', '2026-1-1', 'abc'])('lehnt %j ab', (value) => {
    expect(() => berlinDayStartInstant(value)).toThrow(RangeError)
  })
  it('Zeitraumfilter lehnen ungültige Eingabedaten laut (kein stilles Ignorieren)', () => {
    expect(() => instantRangeForBerlinDays(new Date('abc'))).toThrow(RangeError)
    expect(() => calendarDayRange(undefined, new Date('abc'))).toThrow(RangeError)
  })
})

describe('Zeitraumfilter-Helper', () => {
  it('ohne Grenzen keine Bedingung', () => {
    expect(instantRangeForBerlinDays()).toBeUndefined()
    expect(calendarDayRange()).toBeUndefined()
  })
  it('Instants: beide Grenzen im selben Objekt', () => {
    const r = instantRangeForBerlinDays(new Date('2026-10-01'), new Date('2026-10-13'))
    expect(iso(r?.gte)).toBe('2026-09-30T22:00:00.000Z')
    expect(iso(r?.lt)).toBe('2026-10-13T22:00:00.000Z')
  })
  it('Kalendertage: Bis-Tag einschließlich, Obergrenze exklusiv am Folgetag', () => {
    const r = calendarDayRange(new Date('2026-10-01'), new Date('2026-10-13'))
    expect(iso(r?.gte)).toBe('2026-10-01T00:00:00.000Z')
    expect(iso(r?.lt)).toBe('2026-10-14T00:00:00.000Z')
  })
})
