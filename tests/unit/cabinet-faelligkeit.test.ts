// REQ-029 P5-5 Phase B: Prüffälligkeit eines Schranks – ein Fälligkeitsdatum (faelligAm) als SSOT.
//   faelligAm = letztePruefungAm + pruefintervallMonate (Kalendertag, Monatsende begrenzt)
//   tageBisFaellig > 30 → BESTANDEN · 0..30 (inklusiv) → BALD_FAELLIG · Fälligkeitstag selbst: nicht überfällig · < 0 → UEBERFAELLIG
// Kalendertage: gespeichert als UTC-Mitternacht, „heute“ = Kalendertag in Europe/Berlin; keine Abhängigkeit von process.env.TZ.
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  addMonthsToCalendarDate,
  berechnePruefFaelligkeit,
  deriveCabinetStatus,
  type GgaCabinetSnapshot,
} from '@/lib/collaboration/cabinet-workflow'

function snapshot(letztePruefungAm: string | null, pruefintervallMonate: number | null): GgaCabinetSnapshot {
  return {
    bestandsaufnahmeAm: new Date('2026-01-01'),
    pruefintervallMonate,
    letztePruefungAm: letztePruefungAm ? new Date(letztePruefungAm) : null,
    tasks: [
      { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
      { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
    ],
    checklistItems: [],
    blockers: [],
    approvals: [{ id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' }],
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const status = (letzte: string | null, monate: number | null, now: string) => {
  const s = deriveCabinetStatus(snapshot(letzte, monate), new Date(now))
  return { pruef: s.pruefstatus, betrieb: s.betriebsstatus, tage: s.betriebsstatusTageBisFaellig }
}

describe('addMonthsToCalendarDate: Monatsende wird auf den letzten gültigen Tag begrenzt', () => {
  it.each([
    ['2026-08-31', 6, '2027-02-28'],   // 31.08. + 6 Monate → 28.02., nicht 03.03.
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],   // Schaltjahr
    ['2028-02-29', 12, '2029-02-28'],  // 29.02. → Nicht-Schaltjahr
    ['2024-02-29', 48, '2028-02-29'],  // 29.02. → Schaltjahr
    ['2026-12-31', 2, '2027-02-28'],   // Jahreswechsel
    ['2026-03-31', 1, '2026-04-30'],
    ['2026-05-31', 4, '2026-09-30'],
    ['2026-01-01', 12, '2027-01-01'],
    ['2026-11-15', 25, '2028-12-15'],  // mehr als 2 Jahre
    ['2026-06-30', 0, '2026-06-30'],
  ])('%s + %i Monate = %s', (start, months, expected) => {
    expect(iso(addMonthsToCalendarDate(new Date(start), months))).toBe(expected)
  })

  it('Ergebnis ist UTC-Mitternacht (Kalendertag-Darstellung wie gespeicherte Daten)', () => {
    expect(addMonthsToCalendarDate(new Date('2026-08-31'), 6).toISOString()).toBe('2027-02-28T00:00:00.000Z')
  })
})

describe('berechnePruefFaelligkeit', () => {
  it('liefert null ohne letzte Prüfung oder Intervall', () => {
    expect(berechnePruefFaelligkeit({ letztePruefungAm: null, pruefintervallMonate: 12 }, new Date())).toBeNull()
    expect(berechnePruefFaelligkeit({ letztePruefungAm: new Date('2026-01-01'), pruefintervallMonate: null }, new Date())).toBeNull()
  })

  it('„heute“ ist der Berliner Kalendertag: 23:00Z am 01.01. ist in Berlin bereits der 02.01.', () => {
    const cabinet = { letztePruefungAm: new Date('2026-01-01'), pruefintervallMonate: 12 } // faelligAm 2027-01-01
    expect(berechnePruefFaelligkeit(cabinet, new Date('2027-01-01T22:59:00Z'))?.tageBisFaellig).toBe(0)
    expect(berechnePruefFaelligkeit(cabinet, new Date('2027-01-01T23:00:00Z'))?.tageBisFaellig).toBe(-1)
  })
})

describe('Prüfstatus aus einem Fälligkeitsdatum (faelligAm 2027-01-01)', () => {
  it.each([
    ['31 Tage vorher → noch nicht bald fällig', '2026-12-01T00:00:00Z', 'BESTANDEN', 'FAELLIG_IN_TAGEN', 31],
    ['exakt 30 Tage vorher → bald fällig (inklusiv)', '2026-12-02T00:00:00Z', 'BESTANDEN', 'BALD_FAELLIG', null],
    ['20 Tage vorher → bald fällig', '2026-12-12T00:00:00Z', 'BESTANDEN', 'BALD_FAELLIG', null],
    ['1 Tag vorher → bald fällig', '2026-12-31T12:00:00Z', 'BESTANDEN', 'BALD_FAELLIG', null],
    ['am Fälligkeitstag → NICHT überfällig', '2027-01-01T00:00:00Z', 'BESTANDEN', 'BALD_FAELLIG', null],
    ['am Fälligkeitstag, spät abends Berlin → NICHT überfällig', '2027-01-01T22:59:00Z', 'BESTANDEN', 'BALD_FAELLIG', null],
    ['Tag nach Fälligkeit → überfällig', '2027-01-02T00:00:00Z', 'UEBERFAELLIG', 'UEBERFAELLIG', null],
    ['Berlin-Mitternacht nach Fälligkeitstag → überfällig', '2027-01-01T23:00:00Z', 'UEBERFAELLIG', 'UEBERFAELLIG', null],
  ])('%s', (_name, now, pruef, betrieb, tage) => {
    expect(status('2026-01-01', 12, now)).toEqual({ pruef, betrieb, tage })
  })
})

describe('Regressionen A–E aus dem P5-5-Audit (identisch in jeder Zeitzone)', () => {
  it('A) 01.01.2026 + 12 M, 20 Tage vor Fälligkeit → bald fällig (war in New York „überfällig“)', () => {
    expect(status('2026-01-01', 12, '2026-12-12T00:00:00Z')).toEqual({ pruef: 'BESTANDEN', betrieb: 'BALD_FAELLIG', tage: null })
  })
  it('B) 31.01.2026 + 12 M, jetzt 01.01.2027 (30 Tage vor 31.01.2027) → bald fällig, nicht überfällig', () => {
    expect(status('2026-01-31', 12, '2027-01-01T12:00:00Z')).toEqual({ pruef: 'BESTANDEN', betrieb: 'BALD_FAELLIG', tage: null })
  })
  it('C) 15.03.2026 + 12 M, jetzt 01.03.2027 (14 Tage vor Fälligkeit) → bald fällig, nicht überfällig', () => {
    expect(status('2026-03-15', 12, '2027-03-01T12:00:00Z')).toEqual({ pruef: 'BESTANDEN', betrieb: 'BALD_FAELLIG', tage: null })
  })
  it('D) 01.06.2026 + 6 M (Sommerzeitgrenze): exakt 30 Tage vor 01.12.2026 → bald fällig; 31 Tage → 31 (nicht 32)', () => {
    expect(status('2026-06-01', 6, '2026-11-01T00:00:00Z')).toEqual({ pruef: 'BESTANDEN', betrieb: 'BALD_FAELLIG', tage: null })
    expect(status('2026-06-01', 6, '2026-10-31T00:00:00Z')).toEqual({ pruef: 'BESTANDEN', betrieb: 'FAELLIG_IN_TAGEN', tage: 31 })
  })
  it('E) 31.08.2026 + 6 M → faelligAm 28.02.2027: 27.02. bald fällig, 28.02. nicht überfällig, 01.03. überfällig', () => {
    expect(status('2026-08-31', 6, '2027-02-27T12:00:00Z').betrieb).toBe('BALD_FAELLIG')
    expect(status('2026-08-31', 6, '2027-02-28T12:00:00Z')).toEqual({ pruef: 'BESTANDEN', betrieb: 'BALD_FAELLIG', tage: null })
    expect(status('2026-08-31', 6, '2027-03-01T12:00:00Z')).toEqual({ pruef: 'UEBERFAELLIG', betrieb: 'UEBERFAELLIG', tage: null })
  })
  it('Schaltjahr: 29.02.2028 + 12 M → 28.02.2029; 28.02. nicht überfällig, 01.03. überfällig', () => {
    expect(status('2028-02-29', 12, '2029-02-28T12:00:00Z').pruef).toBe('BESTANDEN')
    expect(status('2028-02-29', 12, '2029-03-01T12:00:00Z').pruef).toBe('UEBERFAELLIG')
  })
  it('ohne Frist bleibt es bei BETRIEBSBEREIT (unverändert)', () => {
    expect(status(null, 12, '2027-01-01T00:00:00Z')).toEqual({ pruef: 'BESTANDEN', betrieb: 'BETRIEBSBEREIT', tage: null })
    expect(status('2026-01-01', null, '2027-01-01T00:00:00Z')).toEqual({ pruef: 'BESTANDEN', betrieb: 'BETRIEBSBEREIT', tage: null })
  })
})

describe('Zeitzonen-Unabhängigkeit (Laufzeit-Wechsel von process.env.TZ)', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  const probes: Array<[string | null, number | null, string]> = [
    ['2026-01-01', 12, '2026-12-12T00:00:00Z'], ['2026-01-01', 12, '2026-12-02T00:00:00Z'], ['2026-01-01', 12, '2026-12-01T00:00:00Z'],
    ['2026-01-01', 12, '2027-01-01T00:00:00Z'], ['2026-01-01', 12, '2027-01-02T00:00:00Z'], ['2026-01-31', 12, '2027-01-01T12:00:00Z'],
    ['2026-03-15', 12, '2027-03-01T12:00:00Z'], ['2026-06-01', 6, '2026-11-01T00:00:00Z'], ['2026-06-01', 6, '2026-10-31T00:00:00Z'],
    ['2026-08-31', 6, '2027-02-28T12:00:00Z'], ['2026-08-31', 6, '2027-03-01T12:00:00Z'], ['2028-02-29', 12, '2029-03-01T12:00:00Z'],
    ['2026-01-01', 12, '2026-12-31T23:30:00Z'], ['2026-01-01', 12, '2027-01-01T23:30:00Z'],
  ]

  it('die Ergebnisse sind in UTC, Europe/Berlin, America/New_York, Pacific/Auckland identisch', () => {
    const zones = ['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Auckland']
    const results = zones.map((zone) => {
      process.env.TZ = zone
      // Vorbedingung: Die Laufzeit wechselt die Zone wirklich (lokaler Getter ändert sich).
      const localDay = new Date('2026-01-01T00:00:00Z').getDate()
      return { zone, localDay, out: probes.map(([l, m, n]) => status(l, m, n)) }
    })
    expect(results.find((r) => r.zone === 'America/New_York')?.localDay).toBe(31)
    expect(results.find((r) => r.zone === 'UTC')?.localDay).toBe(1)
    for (const r of results) expect(r.out, r.zone).toEqual(results[0].out)
  })
})

describe('statische Absicherung der Fälligkeitslogik', () => {
  it('cabinet-workflow.ts enthält keine Kalendermonat-Differenz und kein setMonth mehr', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/collaboration/cabinet-workflow.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(src).not.toMatch(/\bmonthsBetween\b/)
    expect(src).not.toMatch(/\.setMonth\s*\(/)
    expect(src).not.toMatch(/\baddMonthsToDate\b/)
  })
})
