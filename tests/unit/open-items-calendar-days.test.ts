// REQ-029 P5-6 B-1 / B2: Offene Posten verwenden dieselbe Überfälligkeitssemantik wie der Überfälligkeitslauf (P5-2):
// überfällig ab dem Berliner Kalendertag NACH der Fälligkeit. Die Tage werden als Differenz ganzer UTC-Kalendertage gezählt
// (keine Millisekundenarithmetik lokaler Mitternachten → kein Sommerzeit-Fehler).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

import { deriveOpenItems, isOpenItemDue } from '@/lib/services/accounting.service'

function row(id: string, due: string | null): never {
  return {
    id, invoiceNumber: `RE-${id}`, invoiceDate: new Date('2026-01-01T00:00:00Z'), customerName: 'K', status: 'SENT', type: 'STANDARD',
    dueDate: due === null ? null : new Date(due.includes('T') ? due : `${due}T00:00:00.000Z`),
    totalNet: 100, totalTax: 19, itemTaxAmount: 19, totalGross: 119, paymentTotal: 0, openAmount: 119,
    reconciliationMismatch: false, storedPaidAmount: 0,
  } as never
}
const days = (due: string, now: string) => {
  const [item] = deriveOpenItems([row('a', due)], new Date(now))
  return { daysOverdue: item.daysOverdue, overdue: item.overdue }
}

describe('B2 Fälligkeitstag und Folgetag (Berliner Kalendertag)', () => {
  it.each([
    ['2026-10-12', '2026-10-11T10:00:00Z', 0, false, 'Vortag'],
    ['2026-10-12', '2026-10-11T22:30:00Z', 0, false, 'Berlin 12.10. 00:30 = Fälligkeitstag'],
    ['2026-10-12', '2026-10-12T10:00:00Z', 0, false, 'Fälligkeitstag mittags'],
    ['2026-10-12', '2026-10-12T21:59:59Z', 0, false, 'Berlin 12.10. 23:59:59'],
    ['2026-10-12', '2026-10-12T22:00:00Z', 1, true, 'Berlin 13.10. 00:00 = Folgetag'],
    ['2026-10-12', '2026-10-12T22:30:00Z', 1, true, 'Berlin 13.10. 00:30'],
    ['2026-10-12', '2026-10-13T10:00:00Z', 1, true, 'Folgetag mittags'],
    ['2026-10-12', '2026-10-20T10:00:00Z', 8, true, 'acht Tage später'],
  ])('fällig %s, jetzt %s → %i Tage, überfällig=%s (%s)', (due, now, expected, overdue) => {
    expect(days(due, now)).toEqual({ daysOverdue: expected, overdue })
  })
})

describe('B2 Sommerzeitwechsel, Jahreswechsel, Schaltjahr', () => {
  it.each([
    ['2027-03-27', '2027-03-29T10:00:00Z', 2, 'DST-Beginn 28.03.2027 liegt dazwischen'],
    ['2027-03-28', '2027-03-29T10:00:00Z', 1, 'Fälligkeit am Umstellungstag'],
    ['2027-03-27', '2027-03-28T10:00:00Z', 1, 'jetzt am Umstellungstag'],
    ['2026-10-24', '2026-10-26T10:00:00Z', 2, 'DST-Ende 25.10.2026 liegt dazwischen'],
    ['2026-10-25', '2026-10-26T10:00:00Z', 1, 'Fälligkeit am Umstellungstag (Herbst)'],
    ['2026-12-31', '2026-12-31T23:30:00Z', 1, 'Berlin 01.01.2027 00:30'],
    ['2026-12-31', '2026-12-31T22:30:00Z', 0, 'Berlin 31.12. 23:30'],
    ['2028-02-28', '2028-03-01T10:00:00Z', 2, 'Schaltjahr: 28.02. → 01.03. = 2 Tage'],
    ['2027-02-28', '2027-03-01T10:00:00Z', 1, 'kein Schaltjahr: 28.02. → 01.03. = 1 Tag'],
  ])('fällig %s, jetzt %s → %i Tage (%s)', (due, now, expected) => {
    expect(days(due, now).daysOverdue).toBe(expected)
  })

  it('jede Tagesdifferenz ist eine ganze Zahl (kein Rest aus Millisekundenarithmetik)', () => {
    for (let d = 0; d < 400; d++) {
      const now = new Date(Date.UTC(2027, 0, 1, 10) + d * 86_400_000)
      const due = new Date(Date.UTC(2026, 11, 31))
      const [item] = deriveOpenItems([{ ...(row('a', null) as object), dueDate: due } as never], now)
      expect(Number.isInteger(item.daysOverdue)).toBe(true)
      expect(item.daysOverdue).toBe(d + 1)
    }
  })
})

describe('B2 kanonische Kalendertage: Voraussetzung explizit', () => {
  it('ein nicht-mitternächtlicher Altwert wird auf seinen UTC-Kalendertag normiert (Tag, nicht Uhrzeit, zählt)', () => {
    expect(days('2026-10-12T15:00:00Z', '2026-10-12T20:00:00Z')).toEqual({ daysOverdue: 0, overdue: false })
    expect(days('2026-10-12T15:00:00Z', '2026-10-13T10:00:00Z')).toEqual({ daysOverdue: 1, overdue: true })
    expect(days('2026-10-12T23:59:59Z', '2026-10-13T10:00:00Z')).toEqual({ daysOverdue: 1, overdue: true })
  })
  it('ohne Fälligkeitsdatum: nie überfällig', () => {
    const [item] = deriveOpenItems([row('a', null)], new Date('2026-10-13T10:00:00Z'))
    expect([item.daysOverdue, item.overdue]).toEqual([0, false])
  })
  it('sortiert überfälligste zuerst, danach nach Fälligkeit', () => {
    const items = deriveOpenItems([row('b', '2026-10-10'), row('a', '2026-10-01'), row('c', '2026-10-30')], new Date('2026-10-12T10:00:00Z'))
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('B2 isOpenItemDue (Filter „Fällig")', () => {
  it.each([
    ['2026-10-12', '2026-10-11T21:30:00Z', false, 'Berlin 11.10. 23:30'],
    ['2026-10-12', '2026-10-11T22:30:00Z', true, 'Berlin 12.10. 00:30 = Fälligkeitstag'],
    ['2026-10-12', '2026-10-12T10:00:00Z', true, 'Fälligkeitstag'],
    ['2026-10-12', '2026-10-13T10:00:00Z', true, 'Folgetag'],
    ['2026-10-12T15:00:00Z', '2026-10-12T05:00:00Z', true, 'Altwert mit Uhrzeit, gleicher Tag'],
  ])('fällig %s, jetzt %s → %s (%s)', (due, now, expected) => {
    expect(isOpenItemDue(new Date(due.includes('T') ? due : `${due}T00:00:00.000Z`), new Date(now))).toBe(expected)
  })
  it('ohne Fälligkeit nie fällig', () => {
    expect(isOpenItemDue(null, new Date('2026-10-12T10:00:00Z'))).toBe(false)
  })
})

describe('B2 unabhängig von process.env.TZ (Laufzeit-Wechsel)', () => {
  const original = process.env.TZ
  afterEach(() => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original })
  it.each(['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Auckland', 'Asia/Tokyo'])('TZ=%s', (zone) => {
    process.env.TZ = zone
    expect(days('2026-10-12', '2026-10-12T10:00:00Z')).toEqual({ daysOverdue: 0, overdue: false })
    expect(days('2026-10-12', '2026-10-12T22:30:00Z')).toEqual({ daysOverdue: 1, overdue: true })
    expect(days('2027-03-27', '2027-03-29T10:00:00Z').daysOverdue).toBe(2)
    expect(days('2026-10-24', '2026-10-26T10:00:00Z').daysOverdue).toBe(2)
    expect(isOpenItemDue(new Date('2026-10-12T00:00:00.000Z'), new Date('2026-10-11T22:30:00Z'))).toBe(true)
  })
})

describe('B2 statischer Schutz', () => {
  it('deriveOpenItems nutzt keine lokalen Getter; die Seite filtert „Fällig" über isOpenItemDue statt dueDate <= now', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const svc = strip(readFileSync(resolve(process.cwd(), 'lib/services/accounting.service.ts'), 'utf8'))
    const start = svc.indexOf('export function deriveOpenItems')
    const end = svc.indexOf('export async function getAccountingOverview')
    expect(start).toBeGreaterThan(-1)
    expect(svc.slice(start, end)).not.toMatch(/\.getFullYear\(|\.getMonth\(|\.getDate\(|new Date\(\s*now\./)
    const page = strip(readFileSync(resolve(process.cwd(), 'app/(dashboard)/accounting/open-items/page.tsx'), 'utf8'))
    expect(page).not.toMatch(/dueDate\s*<=\s*now/)
    expect(page).toMatch(/isOpenItemDue/)
  })
})
