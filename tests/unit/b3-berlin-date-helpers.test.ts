// REQ-029 P5-6 B-3: zentrale Kalendertag-/Instant-Helfer in lib/utils/berlin-date.ts.
import { afterEach, describe, expect, it } from 'vitest'
import {
  addCalendarDaysIso, berlinTodayIso, berlinTodayPlusDaysIso, berlinYear, calendarYear, formatBerlinBusinessDayLong,
  formatBerlinBusinessMonthName, formatBerlinDate, formatBerlinDateShortYear, formatBerlinDateTime, formatBerlinDateTimeLong,
  formatBerlinDateTimeSecondsShortYear, formatBerlinDateTimeShortYear, formatBerlinDateTimeWithSeconds, formatCalendarDate, formatCalendarDateCompact, formatCalendarDateLong,
} from '@/lib/utils/berlin-date'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'] as const
const originalTz = process.env.TZ
afterEach(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })

/** [gespeichert, kurz, lang, kompakt] */
const CALENDAR: Array<[string, string, string, string]> = [
  ['2026-10-13T00:00:00Z', '13.10.2026', '13. Oktober 2026', '13.10.2026'],
  ['2026-12-31T00:00:00Z', '31.12.2026', '31. Dezember 2026', '31.12.2026'],
  ['2027-01-01T00:00:00Z', '01.01.2027', '01. Januar 2027', '1.1.2027'],
  ['2028-02-29T00:00:00Z', '29.02.2028', '29. Februar 2028', '29.2.2028'],
  ['2026-03-29T00:00:00Z', '29.03.2026', '29. März 2026', '29.3.2026'],
  ['2026-10-25T00:00:00Z', '25.10.2026', '25. Oktober 2026', '25.10.2026'],
  ['2026-10-20T17:42:00Z', '20.10.2026', '20. Oktober 2026', '20.10.2026'],
  ['2026-12-31T23:59:59.999Z', '31.12.2026', '31. Dezember 2026', '31.12.2026'],
  ['2027-01-01T00:00:00.001Z', '01.01.2027', '01. Januar 2027', '1.1.2027'],
]

describe.each(ZONES)('Kalendertag-Formatter in Zone %s', (zone) => {
  it.each(CALENDAR)('%s', (stored, short, long, compact) => {
    process.env.TZ = zone
    const d = new Date(stored)
    expect(formatCalendarDate(d)).toBe(short)
    expect(formatCalendarDateLong(d)).toBe(long)
    expect(formatCalendarDateCompact(d)).toBe(compact)
    expect(formatCalendarDate(stored)).toBe(short) // ISO-String (serialisierte Props)
    expect(calendarYear(d)).toBe(Number(short.slice(-4)))
  })
})

/** [Zeitpunkt, Berlin TT.MM.JJJJ HH:mm:ss, Berliner Jahr] */
const INSTANTS: Array<[string, string, number]> = [
  ['2026-10-12T22:00:00Z', '13.10.2026 00:00:00', 2026], // Berlin-Mitternacht CEST
  ['2026-10-12T21:59:59Z', '12.10.2026 23:59:59', 2026],
  ['2026-12-31T22:59:59Z', '31.12.2026 23:59:59', 2026],
  ['2026-12-31T23:00:00Z', '01.01.2027 00:00:00', 2027],  // Berlin-Mitternacht CET, Jahreswechsel
  ['2026-03-29T00:59:59Z', '29.03.2026 01:59:59', 2026],  // vor DST-Beginn (CET)
  ['2026-03-29T01:00:00Z', '29.03.2026 03:00:00', 2026],  // DST-Beginn: 02:00 existiert nicht
  ['2026-10-25T00:59:59Z', '25.10.2026 02:59:59', 2026],  // CEST
  ['2026-10-25T01:00:00Z', '25.10.2026 02:00:00', 2026],  // DST-Ende: CET
]

describe.each(ZONES)('Instant-Formatter (Berlin) in Zone %s', (zone) => {
  it.each(INSTANTS)('%s', (instant, full, year) => {
    process.env.TZ = zone
    const d = new Date(instant)
    const [date, time] = full.split(' ')
    expect(formatBerlinDate(d)).toBe(date)
    expect(formatBerlinDateTime(d)).toBe(`${date} ${time.slice(0, 5)}`)
    expect(formatBerlinDateShortYear(d)).toBe(`${date.slice(0, 6)}${date.slice(8)}`)
    expect(formatBerlinDateTimeShortYear(d)).toBe(`${date.slice(0, 6)}${date.slice(8)} ${time.slice(0, 5)}`)
    expect(formatBerlinDateTimeSecondsShortYear(d)).toBe(`${date.slice(0, 6)}${date.slice(8)} ${time}`)
    expect(formatBerlinDateTimeLong(d)).toMatch(new RegExp(`^${date.slice(0, 2)}\\. \\p{L}+ ${date.slice(6)} ${time}$`, 'u'))
    expect(formatBerlinDateTimeWithSeconds(d)).toBe(`${date}, ${time}`)
    expect(berlinYear(d)).toBe(year)
  })

  it('Kalendertag- und Instant-Formatter sind verschiedene Funktionen mit verschiedenem Ergebnis nahe Berliner Mitternacht', () => {
    process.env.TZ = zone
    const d = new Date('2026-10-12T22:30:00Z') // UTC 12.10. 22:30 = Berlin 13.10. 00:30
    expect(formatCalendarDate).not.toBe(formatBerlinDate)
    expect(formatCalendarDate(d)).toBe('12.10.2026')  // Kalendertag-Feld: UTC-Komponenten
    expect(formatBerlinDate(d)).toBe('13.10.2026')    // echter Zeitpunkt: Berliner Tag
  })
})

describe('„Heute“ und Fristen', () => {
  it.each(ZONES)('berlinTodayIso unabhängig von der Prozess-Zone (%s)', (zone) => {
    process.env.TZ = zone
    expect(berlinTodayIso(new Date('2026-10-12T22:00:00Z'))).toBe('2026-10-13')
    expect(berlinTodayIso(new Date('2026-10-12T21:59:59.999Z'))).toBe('2026-10-12')
    expect(berlinTodayIso(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01')
    expect(berlinTodayIso(new Date('2026-12-31T22:59:59.999Z'))).toBe('2026-12-31')
  })
  it('addCalendarDaysIso: Monat, Jahr, Schaltjahr, DST, negativ, 0', () => {
    expect(addCalendarDaysIso('2026-10-13', 0)).toBe('2026-10-13')
    expect(addCalendarDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(addCalendarDaysIso('2028-02-15', 14)).toBe('2028-02-29')
    expect(addCalendarDaysIso('2028-02-28', 2)).toBe('2028-03-01')
    expect(addCalendarDaysIso('2027-02-28', 1)).toBe('2027-03-01')
    expect(addCalendarDaysIso('2026-03-20', 14)).toBe('2026-04-03')
    expect(addCalendarDaysIso('2026-10-24', 2)).toBe('2026-10-26')
    expect(addCalendarDaysIso('2027-01-01', -1)).toBe('2026-12-31')
  })
  it('addCalendarDaysIso weist ungültige Eingaben zurück', () => {
    for (const bad of ['', '2026-13-01', '2026-02-30', '13.10.2026', '2026-1-1', 'abc']) {
      expect(() => addCalendarDaysIso(bad, 1)).toThrow(RangeError)
    }
  })
  it('berlinTodayPlusDaysIso = Berliner Heute + n', () => {
    expect(berlinTodayPlusDaysIso(14, new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-15')
    expect(berlinTodayPlusDaysIso(30, new Date('2026-12-31T22:30:00Z'))).toBe('2027-01-30')
  })
  it('Kopfzeilen-Helfer', () => {
    expect(formatBerlinBusinessDayLong(new Date('2026-10-12T22:30:00Z'))).toBe('Dienstag, 13. Oktober 2026')
    expect(formatBerlinBusinessDayLong(new Date('2026-10-13T21:30:00Z'))).toBe('Dienstag, 13. Oktober 2026')
    expect(formatBerlinBusinessMonthName(new Date('2026-12-31T23:30:00Z'))).toBe('Januar')
    expect(formatBerlinBusinessMonthName(new Date('2026-12-31T22:30:00Z'))).toBe('Dezember')
  })
})

describe('Ungültige Eingaben werden nicht still als „Invalid Date“ gerendert', () => {
  it('wirft RangeError', () => {
    const bad = new Date('x')
    for (const fn of [formatCalendarDate, formatCalendarDateLong, formatCalendarDateCompact, formatBerlinDate, formatBerlinDateTime, calendarYear, berlinYear]) {
      expect(() => (fn as (v: Date) => unknown)(bad)).toThrow(RangeError)
    }
  })
})
