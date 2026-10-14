// REQ-029 P5-6 B-2 / C2c + C2e (und Absicherung C1, C2a, C2b, C2d): Seiten mit schwer renderbaren Abhängigkeiten
// (Schrankakte, Projektseite) werden über Quelltext-Wächter an den getesteten Helper gebunden; das Verhalten selbst
// ist in berlin-calendar-days-until.test.ts bewiesen. Kommentare werden vor der Prüfung entfernt.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calendarDaysUntil, isCalendarDatePast } from '@/lib/utils/berlin-date'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

const CABINET_PAGE = 'app/(collaboration)/collaboration/cabinets/[id]/page.tsx'
const PROJECT_PAGE = 'app/(collaboration)/collaboration/projects/[id]/page.tsx'
const INVOICES_PAGE = 'app/(dashboard)/invoices/page.tsx'
const OFFER_TABLE = 'components/offers/OfferTable.tsx'
const CABINET_WF = 'lib/collaboration/cabinet-workflow.ts'
const PROJECT_WF = 'lib/collaboration/project-workflow.ts'

describe('C2c – Schrankakte: Maßnahmenzeile rot erst am Berliner Folgetag', () => {
  const src = stripComments(read(CABINET_PAGE))
  it('nutzt isCalendarDatePast statt Vergleich mit new Date()', () => {
    expect(src).toMatch(/import \{[^}]*isCalendarDatePast[^}]*\} from '@\/lib\/utils\/berlin-date'/)
    expect(src).toContain('isCalendarDatePast(task.dueDate, new Date())')
    expect(src).not.toMatch(/dueDate\s*<\s*new Date\(\)/)
  })
  it('Verhalten der Zeilenregel: Fälligkeitstag nicht rot, Folgetag rot', () => {
    const due = new Date('2026-10-20T00:00:00Z')
    expect(isCalendarDatePast(due, new Date('2026-10-20T21:59:59Z'))).toBe(false)
    expect(isCalendarDatePast(due, new Date('2026-10-20T22:00:00Z'))).toBe(true)
  })
})

describe('C2e – Projektseite: verbleibende Zeit in ganzen Berliner Kalendertagen (E-4)', () => {
  const src = stripComments(read(PROJECT_PAGE))
  it('nutzt calendarDaysUntil, kein Math.ceil über Zeitdifferenzen', () => {
    expect(src).toMatch(/import \{[^}]*calendarDaysUntil[^}]*\} from '@\/lib\/utils\/berlin-date'/)
    expect(src).toContain('calendarDaysUntil(ausgewaehltePhase.plannedEnd, new Date())')
    expect(src).not.toContain('Math.ceil')
    expect(src).not.toMatch(/plannedEnd\.getTime\(\)/)
  })
  it('E-4-Tabelle: morgen +1, heute 0, gestern −1, vorgestern −2 (jede Uhrzeit des Berliner Tages)', () => {
    const now = (iso: string) => new Date(iso)
    for (const t of ['2026-10-19T22:00:00Z', '2026-10-20T03:00:00Z', '2026-10-20T14:00:00Z', '2026-10-20T21:59:59Z']) {
      expect(calendarDaysUntil(new Date('2026-10-21T00:00:00Z'), now(t)), t).toBe(1)
      expect(calendarDaysUntil(new Date('2026-10-20T00:00:00Z'), now(t)), t).toBe(0)
      expect(calendarDaysUntil(new Date('2026-10-19T00:00:00Z'), now(t)), t).toBe(-1)
      expect(calendarDaysUntil(new Date('2026-10-18T00:00:00Z'), now(t)), t).toBe(-2)
    }
  })
  it('bestehende Texte bleiben: „Heute fällig“, „N Tag(e) überfällig“, „noch N Tag(e)“', () => {
    const raw = read(PROJECT_PAGE)
    expect(raw).toContain("'Heute fällig'")
    expect(raw).toContain('überfällig`')
    expect(raw).toContain('noch ${verbleibendeZeit} Tag')
  })
})

describe('Absicherung der übrigen B-2-Aufrufstellen (keine lokalen Getter, kein Instantvergleich auf Kalendertagen)', () => {
  it('cabinet-workflow tagesUrgency: kein istGleicherKalendertag/Getter/Millisekundenrechnung mehr', () => {
    const src = stripComments(read(CABINET_WF))
    const start = src.indexOf('export function tagesUrgency')
    const body = src.slice(start, src.indexOf('export function deriveGgaProjectWorklist'))
    expect(body).toContain('calendarDaysUntil(')
    expect(body).not.toMatch(/\.getTime\(\)/)
    expect(body).not.toMatch(/Math\.ceil/)
    expect(src).not.toContain('istGleicherKalendertag')
  })
  it('calculateProjectHealth: Termine über Kalendertagregel, keine Instantvergleiche', () => {
    const src = stripComments(read(PROJECT_WF))
    const start = src.indexOf('export function calculateProjectHealth')
    const body = src.slice(start, src.indexOf('export function deriveNextAction'))
    expect(body).toContain('isCalendarDatePast(')
    expect(body).not.toMatch(/dueDate\s*<\s*now/)
    expect(body).not.toMatch(/plannedEnd\s*<\s*now/)
  })
  it('OfferTable: validUntil über isCalendarDatePast, kein new Date()-Vergleich', () => {
    const src = stripComments(read(OFFER_TABLE))
    expect(src).toContain('isCalendarDatePast(o.validUntil')
    expect(src).not.toMatch(/validUntil\)\s*<\s*new Date\(\)/)
  })
  it('Rechnungsliste: calendarDaysUntil/classifyDueDistance statt setHours und 86400000-Rechnung', () => {
    const src = stripComments(read(INVOICES_PAGE))
    expect(src).toContain('calendarDaysUntil(')
    expect(src).not.toContain('setHours')
    expect(src).not.toContain('86400000')
  })
})
