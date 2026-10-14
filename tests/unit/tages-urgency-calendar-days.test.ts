// REQ-029 P5-6 B-2 / C1: tagesUrgency auf Berliner Kalendertagen (D-3: der Fälligkeitstag selbst ist nicht überfällig).
import { afterEach, describe, expect, it } from 'vitest'
import { tagesUrgency } from '@/lib/collaboration/cabinet-workflow'

const D = (iso: string) => new Date(iso)
const originalTz = process.env.TZ
afterEach(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })

describe('tagesUrgency – Fälligkeitstag und Folgetag (D-3)', () => {
  const due = D('2026-10-20T00:00:00Z')

  it('am Fälligkeitstag selbst: urgency 3, nicht überfällig – zu jeder Berliner Uhrzeit', () => {
    for (const now of ['2026-10-19T22:00:00Z', '2026-10-20T00:00:01Z', '2026-10-20T09:00:00Z', '2026-10-20T18:00:00Z', '2026-10-20T21:59:59Z']) {
      expect(tagesUrgency(due, D(now)), now).toEqual({ urgency: 3, ueberfaellig: false, baldFaellig: false })
    }
  })
  it('am folgenden Berliner Kalendertag: überfällig (urgency 1)', () => {
    for (const now of ['2026-10-20T22:00:00Z', '2026-10-21T08:00:00Z', '2026-10-25T10:00:00Z']) {
      expect(tagesUrgency(due, D(now)), now).toEqual({ urgency: 1, ueberfaellig: true, baldFaellig: false })
    }
  })
  it('am Vortag: urgency 4 und bald fällig', () => {
    expect(tagesUrgency(due, D('2026-10-19T10:00:00Z'))).toEqual({ urgency: 4, ueberfaellig: false, baldFaellig: true })
    expect(tagesUrgency(due, D('2026-10-19T21:59:59Z'))).toEqual({ urgency: 4, ueberfaellig: false, baldFaellig: true })
  })
  it('Altwert mit Uhrzeit (E-5): gilt als sein UTC-Kalendertag, nicht als Berliner Folgetag', () => {
    const legacy = D('2026-10-20T17:42:31Z')
    expect(tagesUrgency(legacy, D('2026-10-20T18:00:00Z'))).toEqual({ urgency: 3, ueberfaellig: false, baldFaellig: false })
    expect(tagesUrgency(legacy, D('2026-10-20T21:59:59Z'))).toEqual({ urgency: 3, ueberfaellig: false, baldFaellig: false })
    expect(tagesUrgency(legacy, D('2026-10-20T22:00:00Z')).ueberfaellig).toBe(true)
  })
  it('Winterzeit: Tageswechsel um 23:00:00Z', () => {
    const winterDue = D('2026-12-10T00:00:00Z')
    expect(tagesUrgency(winterDue, D('2026-12-10T22:59:59Z')).urgency).toBe(3)
    expect(tagesUrgency(winterDue, D('2026-12-10T23:00:00Z')).urgency).toBe(1)
  })
})

describe('tagesUrgency – 7-Tage-Fenster (bewiesene Grenze: 7 vs. 8 Tage vorher)', () => {
  // Ohne feste 19./20.10.-Beispiele: Fälligkeit und Ankerzeitpunkte werden über mehrere Monate/Zeitumstellungen variiert.
  const dues = ['2026-03-01', '2026-03-29', '2026-03-31', '2026-06-15', '2026-10-25', '2026-10-26', '2026-12-31', '2027-01-05', '2028-02-29', '2028-03-02']
  const dayMs = 86_400_000
  const berlinNoonBefore = (due: string, days: number) => new Date(Date.parse(`${due}T00:00:00Z`) - days * dayMs + 12 * 3_600_000) // 12:00Z des Tages (Berlin 13:00/14:00 – gleicher Kalendertag)

  for (const due of dues) {
    it(`Fälligkeit ${due}: 7 Tage vorher bald fällig, 8 Tage vorher nicht`, () => {
      const dueDate = D(`${due}T00:00:00Z`)
      expect(tagesUrgency(dueDate, berlinNoonBefore(due, 7))).toEqual({ urgency: 4, ueberfaellig: false, baldFaellig: true })
      expect(tagesUrgency(dueDate, berlinNoonBefore(due, 8))).toEqual({ urgency: 4, ueberfaellig: false, baldFaellig: false })
    })
  }
  it('Grenze gilt auch kurz nach Berliner Mitternacht und kurz davor (kein Millisekunden-Effekt)', () => {
    const dueDate = D('2026-10-27T00:00:00Z')
    // Berlin 20.10. 00:00:00 (Sommerzeit) = 19.10. 22:00:00Z → noch 7 Kalendertage
    expect(tagesUrgency(dueDate, D('2026-10-19T22:00:00Z')).baldFaellig).toBe(true)
    // Berlin 19.10. 23:59:59 = 19.10. 21:59:59Z → 8 Kalendertage
    expect(tagesUrgency(dueDate, D('2026-10-19T21:59:59Z')).baldFaellig).toBe(false)
    // Berlin 20.10. 23:59:59 → immer noch 7
    expect(tagesUrgency(dueDate, D('2026-10-20T21:59:59Z')).baldFaellig).toBe(true)
    // Berlin 21.10. 00:00:00 → 6
    expect(tagesUrgency(dueDate, D('2026-10-20T22:00:00Z')).baldFaellig).toBe(true)
  })
  it('Zeitumstellung 25.10.2026 (25-Stunden-Tag) verschiebt die Grenze nicht', () => {
    const dueDate = D('2026-11-01T00:00:00Z')
    expect(tagesUrgency(dueDate, D('2026-10-25T12:00:00Z')).baldFaellig).toBe(true)  // 7 Tage
    expect(tagesUrgency(dueDate, D('2026-10-24T12:00:00Z')).baldFaellig).toBe(false) // 8 Tage
  })
  it('Zeitumstellung 29.03.2026 (23-Stunden-Tag) verschiebt die Grenze nicht', () => {
    const dueDate = D('2026-04-05T00:00:00Z')
    expect(tagesUrgency(dueDate, D('2026-03-29T12:00:00Z')).baldFaellig).toBe(true)  // 7 Tage
    expect(tagesUrgency(dueDate, D('2026-03-28T12:00:00Z')).baldFaellig).toBe(false) // 8 Tage
  })
})

describe('tagesUrgency – unabhängig von process.env.TZ', () => {
  it('identische Ergebnisse in allen Zonen (Laufzeit-Umschaltung)', () => {
    const probes: Array<[string, string]> = [
      ['2026-10-20T00:00:00Z', '2026-10-20T09:00:00Z'],
      ['2026-10-20T00:00:00Z', '2026-10-19T22:00:00Z'],
      ['2026-10-20T00:00:00Z', '2026-10-20T22:00:00Z'],
      ['2026-10-27T00:00:00Z', '2026-10-19T21:59:59Z'],
      ['2026-10-27T00:00:00Z', '2026-10-20T00:30:00Z'],
      ['2026-10-20T17:42:31Z', '2026-10-20T18:00:00Z'],
    ]
    process.env.TZ = 'UTC'
    const expected = probes.map(([d, n]) => tagesUrgency(D(d), D(n)))
    for (const zone of ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland']) {
      process.env.TZ = zone
      expect(probes.map(([d, n]) => tagesUrgency(D(d), D(n))), zone).toEqual(expected)
    }
    expect(expected.map((e) => e.urgency)).toEqual([3, 3, 1, 4, 4, 3])
  })
})
