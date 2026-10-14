// REQ-029 P5-6 B-2 (E-1, E-5): zentraler Kalendertag-Helper calendarDaysUntil / isCalendarDatePast / classifyDueDistance.
// Vertrag: 0 = Berliner Geschäftstag == Zieldatum, >0 Zukunft, <0 überschritten; nur Kalendertage; Zielwerte = UTC-Kalendertag.
import { afterEach, describe, expect, it } from 'vitest'
import { calendarDaysUntil, isCalendarDatePast, classifyDueDistance } from '@/lib/utils/berlin-date'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'] as const
const originalTz = process.env.TZ
afterEach(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })

const D = (iso: string) => new Date(iso)

describe('calendarDaysUntil – Vertrag (E-1)', () => {
  it('0 am Zieltag, auch spät abends und kurz nach Mitternacht Berlin', () => {
    const target = D('2026-10-20T00:00:00Z')
    expect(calendarDaysUntil(target, D('2026-10-19T22:00:00Z'))).toBe(0)   // Berlin 20.10. 00:00 (CEST)
    expect(calendarDaysUntil(target, D('2026-10-20T09:00:00Z'))).toBe(0)
    expect(calendarDaysUntil(target, D('2026-10-20T21:59:59Z'))).toBe(0)   // Berlin 20.10. 23:59:59
  })
  it('Berliner Tageswechsel: 22:00:00Z (Sommerzeit) ist bereits der Folgetag, 21:59:59Z noch nicht', () => {
    const target = D('2026-10-20T00:00:00Z')
    expect(calendarDaysUntil(target, D('2026-10-20T21:59:59Z'))).toBe(0)
    expect(calendarDaysUntil(target, D('2026-10-20T22:00:00Z'))).toBe(-1)  // Berlin 21.10. 00:00
  })
  it('Winterzeit: 23:00:00Z ist der Berliner Folgetag', () => {
    const target = D('2026-12-10T00:00:00Z')
    expect(calendarDaysUntil(target, D('2026-12-10T22:59:59Z'))).toBe(0)
    expect(calendarDaysUntil(target, D('2026-12-10T23:00:00Z'))).toBe(-1)
  })
  it('positiv in der Zukunft, negativ in der Vergangenheit, ganze Tage', () => {
    const now = D('2026-10-20T10:00:00Z')
    expect(calendarDaysUntil(D('2026-10-21T00:00:00Z'), now)).toBe(1)
    expect(calendarDaysUntil(D('2026-10-27T00:00:00Z'), now)).toBe(7)
    expect(calendarDaysUntil(D('2026-10-19T00:00:00Z'), now)).toBe(-1)
    expect(calendarDaysUntil(D('2026-10-18T00:00:00Z'), now)).toBe(-2)
  })
  it('Zeitumstellung (Ende der Sommerzeit 25.10.2026) verfälscht die Tageszahl nicht', () => {
    expect(calendarDaysUntil(D('2026-10-26T00:00:00Z'), D('2026-10-24T12:00:00Z'))).toBe(2)
    expect(calendarDaysUntil(D('2026-10-25T00:00:00Z'), D('2026-10-25T10:00:00Z'))).toBe(0)
    expect(calendarDaysUntil(D('2026-10-24T00:00:00Z'), D('2026-10-26T10:00:00Z'))).toBe(-2)
  })
  it('Zeitumstellung (Beginn der Sommerzeit 29.03.2026)', () => {
    expect(calendarDaysUntil(D('2026-03-30T00:00:00Z'), D('2026-03-28T23:30:00Z'))).toBe(1) 
    expect(calendarDaysUntil(D('2026-03-29T00:00:00Z'), D('2026-03-28T23:30:00Z'))).toBe(0)
    expect(calendarDaysUntil(D('2026-03-30T00:00:00Z'), D('2026-03-29T21:59:59Z'))).toBe(1) 
  })
  it('Jahreswechsel und Schaltjahr', () => {
    expect(calendarDaysUntil(D('2027-01-01T00:00:00Z'), D('2026-12-31T12:00:00Z'))).toBe(1)
    expect(calendarDaysUntil(D('2026-12-31T00:00:00Z'), D('2026-12-31T23:30:00Z'))).toBe(-1) // Berlin 01.01.2027 00:30
    expect(calendarDaysUntil(D('2028-03-01T00:00:00Z'), D('2028-02-28T12:00:00Z'))).toBe(2)   // 29.02.2028 existiert
    expect(calendarDaysUntil(D('2027-03-01T00:00:00Z'), D('2027-02-28T12:00:00Z'))).toBe(1)
  })
  it('ungültige Eingaben werfen RangeError statt NaN zu liefern', () => {
    expect(() => calendarDaysUntil(new Date('x'), D('2026-10-20T00:00:00Z'))).toThrow(RangeError)
    expect(() => calendarDaysUntil(D('2026-10-20T00:00:00Z'), new Date('x'))).toThrow(RangeError)
  })
})

describe('calendarDaysUntil – Altwerte mit Uhrzeit (E-5)', () => {
  it('Zielwert mit Uhrzeit wird über UTC-Komponenten auf den gespeicherten Kalendertag normalisiert', () => {
    const now = D('2026-10-20T10:00:00Z')
    expect(calendarDaysUntil(D('2026-10-20T17:42:31Z'), now)).toBe(0)   // NICHT Berlin 21.10.
    expect(calendarDaysUntil(D('2026-10-20T23:59:59.999Z'), now)).toBe(0)
    expect(calendarDaysUntil(D('2026-10-20T00:00:00.001Z'), now)).toBe(0)
    expect(calendarDaysUntil(D('2026-10-21T00:00:00.000Z'), now)).toBe(1)
  })
  it('Ergebnis hängt nicht von der Uhrzeit des Zielwerts ab', () => {
    const now = D('2026-10-20T10:00:00Z')
    const results = ['00:00:00', '06:30:00', '12:00:00', '17:42:31', '22:00:00', '23:59:59'].map((t) => calendarDaysUntil(D(`2026-10-23T${t}Z`), now))
    expect(new Set(results)).toEqual(new Set([3]))
  })
})

describe('calendarDaysUntil – unabhängig von process.env.TZ', () => {
  it('liefert in allen Zonen identische Ergebnisse (Laufzeit-Umschaltung)', () => {
    const probes: Array<[string, string]> = [
      ['2026-10-20T00:00:00Z', '2026-10-19T22:00:00Z'],
      ['2026-10-20T00:00:00Z', '2026-10-20T21:59:59Z'],
      ['2026-10-20T00:00:00Z', '2026-10-20T22:00:00Z'],
      ['2026-10-27T00:00:00Z', '2026-10-20T00:30:00Z'],
      ['2026-10-26T00:00:00Z', '2026-10-24T21:59:00Z'],
    ]
    const expected = probes.map(([t, n]) => { process.env.TZ = 'UTC'; return calendarDaysUntil(D(t), D(n)) })
    for (const zone of ZONES) {
      process.env.TZ = zone
      expect(probes.map(([t, n]) => calendarDaysUntil(D(t), D(n)))).toEqual(expected)
    }
    expect(expected).toEqual([0, 0, -1, 7, 2])
  })
})

describe('isCalendarDatePast', () => {
  it('Zieltag selbst ist NICHT vergangen (D-3), erst der folgende Berliner Kalendertag', () => {
    const target = D('2026-10-20T00:00:00Z')
    expect(isCalendarDatePast(target, D('2026-10-20T00:00:01Z'))).toBe(false)
    expect(isCalendarDatePast(target, D('2026-10-20T21:59:59Z'))).toBe(false)
    expect(isCalendarDatePast(target, D('2026-10-20T22:00:00Z'))).toBe(true)
    expect(isCalendarDatePast(target, D('2026-10-21T10:00:00Z'))).toBe(true)
    expect(isCalendarDatePast(target, D('2026-10-19T10:00:00Z'))).toBe(false)
  })
})

describe('classifyDueDistance (E-2: bestehende 3-Tage-Semantik)', () => {
  it('<0 überfällig, 0 heute fällig, 1 und 2 bald fällig, ab 3 später', () => {
    expect(classifyDueDistance(-5)).toBe('OVERDUE')
    expect(classifyDueDistance(-1)).toBe('OVERDUE')
    expect(classifyDueDistance(0)).toBe('DUE_TODAY')
    expect(classifyDueDistance(1)).toBe('DUE_SOON')
    expect(classifyDueDistance(2)).toBe('DUE_SOON')
    expect(classifyDueDistance(3)).toBe('LATER')
    expect(classifyDueDistance(30)).toBe('LATER')
  })
})
