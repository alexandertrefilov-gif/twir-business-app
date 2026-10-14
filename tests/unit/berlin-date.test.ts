// REQ-029 P5-2 Phase 1: Berliner Kalendertag, unabhängig von process.env.TZ und Server-Zeitzone.
import { describe, expect, it } from 'vitest'
import { berlinCalendarDate, berlinDayStartUtc, formatUtcCalendarDate } from '@/lib/utils/berlin-date'

// [UTC-Zeitpunkt, erwarteter Berliner Kalendertag, Hinweis]
const CASES: Array<[string, string, string]> = [
  ['2026-10-15T21:59:59.999Z', '2026-10-15', 'Sommerzeit (UTC+2): 23:59:59.999 Berlin'],
  ['2026-10-15T22:00:00.000Z', '2026-10-16', 'Sommerzeit: 00:00:00 Berlin des Folgetags'],
  ['2026-01-15T22:59:59.999Z', '2026-01-15', 'Winterzeit (UTC+1): 23:59:59.999 Berlin'],
  ['2026-01-15T23:00:00.000Z', '2026-01-16', 'Winterzeit: 00:00:00 Berlin des Folgetags'],
  ['2026-03-28T22:59:59.999Z', '2026-03-28', 'Tag vor der Umstellung auf Sommerzeit (Winterzeit)'],
  ['2026-03-28T23:00:00.000Z', '2026-03-29', 'Umstellungstag beginnt (00:00 Berlin, noch Winterzeit)'],
  ['2026-03-29T21:59:59.999Z', '2026-03-29', 'Umstellungstag endet in Sommerzeit (23:59:59.999)'],
  ['2026-03-29T22:00:00.000Z', '2026-03-30', 'Tag nach der Umstellung auf Sommerzeit'],
  ['2026-10-24T21:59:59.999Z', '2026-10-24', 'Tag vor der Umstellung auf Winterzeit (Sommerzeit)'],
  ['2026-10-24T22:00:00.000Z', '2026-10-25', 'Umstellungstag beginnt (00:00 Berlin, noch Sommerzeit)'],
  ['2026-10-25T22:59:59.999Z', '2026-10-25', 'Umstellungstag endet in Winterzeit (23:59:59.999)'],
  ['2026-10-25T23:00:00.000Z', '2026-10-26', 'Tag nach der Umstellung auf Winterzeit'],
  ['2026-12-31T22:59:59.999Z', '2026-12-31', 'Jahresende Berlin'],
  ['2026-12-31T23:00:00.000Z', '2027-01-01', 'Jahreswechsel Berlin'],
  ['2028-02-28T22:59:59.999Z', '2028-02-28', 'Schaltjahr: 28.02. 23:59:59.999'],
  ['2028-02-28T23:00:00.000Z', '2028-02-29', 'Schaltjahr: 29.02. beginnt'],
  ['2028-02-29T23:00:00.000Z', '2028-03-01', 'Schaltjahr: 01.03.'],
  ['2026-10-15T10:00:00.000Z', '2026-10-15', 'Mittag'],
]

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata']

describe('berlinCalendarDate', () => {
  it.each(CASES)('%s → %s (%s)', (instant, expected) => {
    expect(berlinCalendarDate(new Date(instant))).toBe(expected)
  })

  it('liefert in jeder Prozess-Zeitzone dasselbe Ergebnis (TZ ist keine fachliche Voraussetzung)', () => {
    const original = process.env.TZ
    try {
      for (const zone of ZONES) {
        process.env.TZ = zone
        for (const [instant, expected] of CASES) {
          expect(berlinCalendarDate(new Date(instant)), `${zone} ${instant}`).toBe(expected)
          expect(berlinDayStartUtc(new Date(instant)).toISOString(), `${zone} ${instant}`).toBe(`${expected}T00:00:00.000Z`)
        }
      }
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })

  it('weist ungültige Zeitpunkte ab', () => {
    expect(() => berlinCalendarDate(new Date('kein-datum'))).toThrow(RangeError)
    expect(() => berlinDayStartUtc(new Date(NaN))).toThrow(RangeError)
  })
})

describe('berlinDayStartUtc', () => {
  it('gibt UTC-Mitternacht des Berliner Kalendertags zurück (gleiche Darstellung wie gespeicherte Fälligkeiten)', () => {
    const start = berlinDayStartUtc(new Date('2026-10-15T21:30:00.000Z'))
    expect(start).toBeInstanceOf(Date)
    expect(start.toISOString()).toBe('2026-10-15T00:00:00.000Z')
  })

  it('Fälligkeitsregel: am Fälligkeitstag nicht überfällig, ab 00:00 Berlin des Folgetags überfällig', () => {
    const dueDate = new Date('2026-10-15') // wie z.coerce.date('2026-10-15'): UTC-Mitternacht
    const overdue = (now: string) => dueDate < berlinDayStartUtc(new Date(now))
    expect(overdue('2026-10-14T22:00:00.000Z')).toBe(false) // 00:00 Berlin am Fälligkeitstag
    expect(overdue('2026-10-15T21:59:59.999Z')).toBe(false) // 23:59:59.999 Berlin am Fälligkeitstag
    expect(overdue('2026-10-15T22:00:00.000Z')).toBe(true)  // 00:00 Berlin am Folgetag
    expect(overdue('2026-10-16T10:00:00.000Z')).toBe(true)
  })

  it('Fälligkeitsregel gilt auch in der Winterzeit', () => {
    const dueDate = new Date('2026-01-15')
    const overdue = (now: string) => dueDate < berlinDayStartUtc(new Date(now))
    expect(overdue('2026-01-15T22:59:59.999Z')).toBe(false)
    expect(overdue('2026-01-15T23:00:00.000Z')).toBe(true)
  })
})

describe('formatUtcCalendarDate', () => {
  it('liest den Kalendertag eines gespeicherten Datums aus den UTC-Komponenten', () => {
    expect(formatUtcCalendarDate(new Date('2026-10-01T00:00:00.000Z'))).toBe('2026-10-01')
    expect(formatUtcCalendarDate(new Date('2026-10-01'))).toBe('2026-10-01')
    expect(formatUtcCalendarDate(new Date('2026-10-01T23:59:59.999Z'))).toBe('2026-10-01')
    expect(formatUtcCalendarDate(new Date('2028-02-29T00:00:00.000Z'))).toBe('2028-02-29')
  })

  it('ist unabhängig von der Prozess-Zeitzone (kein Tagesversatz bei westlichen Zonen)', () => {
    const original = process.env.TZ
    try {
      for (const zone of ZONES) {
        process.env.TZ = zone
        expect(formatUtcCalendarDate(new Date('2026-10-01T00:00:00.000Z')), zone).toBe('2026-10-01')
      }
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })

  it('weist ungültige Daten ab', () => {
    expect(() => formatUtcCalendarDate(new Date('x'))).toThrow(RangeError)
  })
})
