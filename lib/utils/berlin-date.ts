// lib/utils/berlin-date.ts
// REQ-029 P5-2: Kalendertag in Europe/Berlin, unabhängig von process.env.TZ und von der Zeitzone des Servers.
//
// Datumsmodell (E7, unverändert): Datumsfelder wie `dueDate` sind Kalendertage, gespeichert als UTC-Mitternacht
// (aus `YYYY-MM-DD` per `new Date(...)`). Fachentscheidungen wie „überfällig ab dem Kalendertag nach der Fälligkeit"
// werden deshalb so getroffen:
//   1. `now` wird auf den Kalendertag in Europe/Berlin abgebildet (berlinCalendarDate),
//   2. dieser Kalendertag wird in dieselbe Darstellung gebracht wie gespeicherte Daten (berlinDayStartUtc),
//   3. verglichen wird `dueDate < berlinDayStartUtc(now)`.
// Die Berechnung nutzt ausschließlich Intl mit explizit gesetzter Zeitzone; sie liest weder lokale Datums-Getter
// noch setHours, und Sommer-/Winterzeit werden von der Zeitzonendatenbank der Laufzeit behandelt.

const BERLIN_TIME_ZONE = 'Europe/Berlin'

const berlinParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: BERLIN_TIME_ZONE,
  year:     'numeric',
  month:    '2-digit',
  day:      '2-digit',
})

function assertValidDate(value: Date, what: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new RangeError(`${what}: ungültiger Zeitpunkt`)
  }
}

function pad(value: number | string, length: number): string {
  return String(value).padStart(length, '0')
}

/** Kalendertag des Zeitpunkts in Europe/Berlin als `JJJJ-MM-TT`. */
export function berlinCalendarDate(now: Date): string {
  assertValidDate(now, 'berlinCalendarDate')
  const parts = berlinParts.formatToParts(now)
  const pick = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value
  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  if (!year || !month || !day) {
    throw new Error('Berliner Kalendertag konnte nicht bestimmt werden')
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

/**
 * Beginn des Berliner Kalendertags von `now`, dargestellt als UTC-Mitternacht dieses Datums
 * (gleiche Darstellung wie gespeicherte Kalendertage, direkt mit `dueDate` vergleichbar).
 */
export function berlinDayStartUtc(now: Date): Date {
  return new Date(`${berlinCalendarDate(now)}T00:00:00.000Z`)
}

/** Kalendertag eines gespeicherten Datums (UTC-Mitternacht) als `JJJJ-MM-TT`; unabhängig von der Server-Zeitzone. */
export function formatUtcCalendarDate(date: Date): string {
  assertValidDate(date, 'formatUtcCalendarDate')
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`
}

const MS_PER_DAY = 86_400_000

/** Ganzzahlige Tagesnummer des UTC-Kalendertags (exakt, keine Rundung; Uhrzeit wird verworfen). */
function utcDayNumber(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY
}

/**
 * REQ-029 P5-6 B-2 (E-1): Kalendertage vom Berliner Geschäftstag von `now` bis zum Kalendertag `targetDate`.
 * 0 = heute (Berlin) ist der Zieltag, > 0 = Zieltag liegt in der Zukunft, < 0 = Zieltag ist überschritten.
 * `targetDate` ist ein gespeicherter Kalendertag (UTC-Mitternacht); ein Altwert mit Uhrzeit wird über seine
 * UTC-Komponenten auf den gespeicherten Tag normalisiert (E-5) – NICHT erst nach Berlin umgerechnet.
 * Nur für als Kalendertag klassifizierte Felder verwenden, nie für echte Zeitpunkte (Instants).
 * Keine Millisekunden-/24h-Rechnung, daher unempfindlich gegen Sommer-/Winterzeit und process.env.TZ.
 */
export function calendarDaysUntil(targetDate: Date, now: Date): number {
  assertValidDate(targetDate, 'calendarDaysUntil(targetDate)')
  return utcDayNumber(targetDate) - utcDayNumber(berlinDayStartUtc(now))
}

/** Zieltag ist überschritten, d. h. der Berliner Geschäftstag liegt NACH dem Zieltag (der Zieltag selbst nicht, D-3). */
export function isCalendarDatePast(targetDate: Date, now: Date): boolean {
  return calendarDaysUntil(targetDate, now) < 0
}

export type DueDistance = 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'LATER'

/** Bestehende „bald fällig“-Schwelle (Rechnungsliste, E-2): 1 oder 2 Kalendertage; unverändert gegenüber dem Vorzustand. */
export const DUE_SOON_MAX_DAYS = 2

export function classifyDueDistance(daysUntil: number): DueDistance {
  if (daysUntil < 0) return 'OVERDUE'
  if (daysUntil === 0) return 'DUE_TODAY'
  return daysUntil <= DUE_SOON_MAX_DAYS ? 'DUE_SOON' : 'LATER'
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// REQ-029 P5-6 B-3: Kalendertag (fachliches Datum) und Zeitpunkt (Instant) strikt getrennt darstellen.
//
// KALENDERTAG-Formatter (formatCalendarDate*, calendarYear): lesen ausschließlich die UTC-Komponenten des
// gespeicherten Werts. 2026-10-13T00:00:00Z und der Altwert 2026-10-13T17:42:00Z bedeuten beide den 13.10.2026 –
// unabhängig von process.env.TZ, Server- und Browser-Zeitzone. NIE für echte Zeitpunkte verwenden.
//
// INSTANT-Formatter (formatBerlin*, berlinYear): zeigen einen echten Zeitpunkt (createdAt, sentAt, finalizedAt …)
// in der Geschäftszeitzone Europe/Berlin. NIE für Kalendertag-Felder verwenden (Verschiebung um einen Tag).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const calendarShort = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })
const calendarLong = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' })
const calendarLongWithWeekday = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const calendarUnpadded = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC' })

function toDate(value: Date | string | number, what: string): Date {
  const date = value instanceof Date ? value : new Date(value)
  assertValidDate(date, what)
  return date
}

/** Kalendertag als `TT.MM.JJJJ` (UTC-Komponenten, zeitzonenunabhängig). */
export function formatCalendarDate(value: Date | string | number): string {
  return calendarShort.format(toDate(value, 'formatCalendarDate'))
}

/** Kalendertag als `TT. Monat JJJJ` (z. B. „13. Oktober 2026“; UTC-Komponenten, zeitzonenunabhängig). */
export function formatCalendarDateLong(value: Date | string | number): string {
  return calendarLong.format(toDate(value, 'formatCalendarDateLong'))
}

/** Kalendertag im bisherigen de-DE-Kurzformat ohne führende Nullen (`1.1.2027`); Darstellung unverändert, nur zeitzonenfest. */
export function formatCalendarDateCompact(value: Date | string | number): string {
  return calendarUnpadded.format(toDate(value, 'formatCalendarDateCompact'))
}

/** Heutiger Berliner Geschäftstag mit Wochentag, z. B. „Dienstag, 13. Oktober 2026“ (für Kopfzeilen). */
export function formatBerlinBusinessDayLong(now: Date = new Date()): string {
  return calendarLongWithWeekday.format(berlinDayStartUtc(now))
}

/** Jahr eines Kalendertag-Felds (UTC-Komponente) – z. B. für die Archivstruktur. */
export function calendarYear(value: Date): number {
  assertValidDate(value, 'calendarYear')
  return value.getUTCFullYear()
}

/** „Heute“ als `JJJJ-MM-TT` im Berliner Geschäftstag (für Formular-Vorbelegungen). */
export function berlinTodayIso(now: Date = new Date()): string {
  return berlinCalendarDate(now)
}

/** Addiert Kalendertage auf einen `JJJJ-MM-TT`-Tag (reine Kalenderarithmetik über UTC, DST- und TZ-unabhängig). */
export function addCalendarDaysIso(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) throw new RangeError(`addCalendarDaysIso: ungültiges Datum „${isoDate}“`)
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (formatUtcCalendarDate(base) !== isoDate) throw new RangeError(`addCalendarDaysIso: ungültiges Datum „${isoDate}“`)
  return formatUtcCalendarDate(new Date(base.getTime() + days * MS_PER_DAY))
}

/** „Heute + n Kalendertage“ im Berliner Geschäftstag als `JJJJ-MM-TT`. */
export function berlinTodayPlusDaysIso(days: number, now: Date = new Date()): string {
  return addCalendarDaysIso(berlinCalendarDate(now), days)
}

const berlinInstant = new Intl.DateTimeFormat('en-GB', {
  timeZone: BERLIN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function berlinInstantParts(value: Date | string | number, what: string) {
  const parts = berlinInstant.formatToParts(toDate(value, what))
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { year: pick('year'), month: pick('month'), day: pick('day'), hour: pick('hour'), minute: pick('minute'), second: pick('second') }
}

/** ECHTER ZEITPUNKT als Berliner Datum `TT.MM.JJJJ`. */
export function formatBerlinDate(value: Date | string | number): string {
  const p = berlinInstantParts(value, 'formatBerlinDate')
  return `${p.day}.${p.month}.${p.year}`
}

/** ECHTER ZEITPUNKT als Berliner Datum `TT.MM.JJ`. */
export function formatBerlinDateShortYear(value: Date | string | number): string {
  const p = berlinInstantParts(value, 'formatBerlinDateShortYear')
  return `${p.day}.${p.month}.${p.year.slice(-2)}`
}

/** ECHTER ZEITPUNKT als Berliner Datum mit Uhrzeit `TT.MM.JJJJ HH:mm`. */
export function formatBerlinDateTime(value: Date | string | number): string {
  const p = berlinInstantParts(value, 'formatBerlinDateTime')
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`
}

/** ECHTER ZEITPUNKT als Berliner Datum mit Uhrzeit `TT.MM.JJ HH:mm:ss` (Audit-Listen). */
export function formatBerlinDateTimeSecondsShortYear(value: Date | string | number): string {
  const p = berlinInstantParts(value, 'formatBerlinDateTimeSecondsShortYear')
  return `${p.day}.${p.month}.${p.year.slice(-2)} ${p.hour}:${p.minute}:${p.second}`
}

const berlinInstantLong = new Intl.DateTimeFormat('de-DE', {
  timeZone: BERLIN_TIME_ZONE, day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** ECHTER ZEITPUNKT als `TT. Monat JJJJ HH:mm:ss` in Berlin (Audit-Detail). */
export function formatBerlinDateTimeLong(value: Date | string | number): string {
  return berlinInstantLong.format(toDate(value, 'formatBerlinDateTimeLong')).replace(/,?\s+um\s+|,\s*/, ' ')
}

/** Berliner Geschäftsjahr eines echten Zeitpunkts. */
export function berlinYear(value: Date | string | number): number {
  return Number(berlinInstantParts(value, 'berlinYear').year)
}

const calendarMonthName = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', month: 'long' })

/** Monatsname des heutigen Berliner Geschäftstags, z. B. „Oktober“. */
export function formatBerlinBusinessMonthName(now: Date = new Date()): string {
  return calendarMonthName.format(berlinDayStartUtc(now))
}

/** ECHTER ZEITPUNKT als Berliner Datum mit Uhrzeit `TT.MM.JJ HH:mm`. */
export function formatBerlinDateTimeShortYear(value: Date | string | number): string {
  const p = berlinInstantParts(value, 'formatBerlinDateTimeShortYear')
  return `${p.day}.${p.month}.${p.year.slice(-2)} ${p.hour}:${p.minute}`
}

/** ECHTER ZEITPUNKT als Berliner Datum mit Uhrzeit `TT.MM.JJJJ, HH:mm:ss` (Aktivitätsverlauf; bisheriges de-DE-Format, aber Berliner Zeit). */
export function formatBerlinDateTimeWithSeconds(value: Date | string | number): string {
  const p = berlinInstantParts(value, 'formatBerlinDateTimeWithSeconds')
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}:${p.second}`
}

// ── P5-6 C-1: Berliner Tages- und Monatsgrenzen als ECHTE ZEITPUNKTE ──────────────────────────────────
// Achtung: `berlinDayStartUtc` (oben) liefert die UTC-Mitternacht eines Kalendertags (Darstellung gespeicherter
// Kalendertage). Die Funktionen hier liefern dagegen den realen Zeitpunkt „00:00 Uhr in Europe/Berlin“ und sind
// nur für Felder gedacht, die echte Zeitpunkte speichern (createdAt, finalizedAt, ...).

/** Differenz Berliner Wanduhr − UTC in Millisekunden am gegebenen Zeitpunkt (+3 600 000 im Winter, +7 200 000 im Sommer). */
function berlinOffsetMs(instantMs: number): number {
  const p = berlinInstantParts(new Date(instantMs), 'berlinOffsetMs')
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return wall - Math.floor(instantMs / 1000) * 1000
}

/**
 * Realer Zeitpunkt von 00:00:00.000 Uhr Europe/Berlin am Kalendertag `isoDate` (`JJJJ-MM-TT`).
 * Unabhängig von process.env.TZ. Sommer-/Winterzeit-Umstellungen liegen in Berlin nie um Mitternacht, daher ist
 * das Ergebnis eindeutig.
 */
export function berlinDayStartInstant(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) throw new RangeError(`berlinDayStartInstant: ungültiges Datum „${isoDate}“`)
  const wallMidnightAsUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (formatUtcCalendarDate(new Date(wallMidnightAsUtc)) !== isoDate) {
    throw new RangeError(`berlinDayStartInstant: ungültiges Datum „${isoDate}“`)
  }
  // Zwei Schritte: Offset am Näherungswert bestimmen, dann am korrigierten Wert erneut (deckt die Umstellungstage ab).
  const first = wallMidnightAsUtc - berlinOffsetMs(wallMidnightAsUtc)
  return new Date(wallMidnightAsUtc - berlinOffsetMs(first))
}

/** Beginn des FOLGENDEN Berliner Kalendertags nach `isoDate` als echter Zeitpunkt (exklusive Obergrenze für den Tag `isoDate`). */
export function berlinNextDayStartInstant(isoDate: string): Date {
  return berlinDayStartInstant(addCalendarDaysIso(isoDate, 1))
}

/** Beginn des aktuellen Berliner Kalendermonats (00:00 Uhr am Monatsersten, Europe/Berlin) als echter Zeitpunkt. */
export function berlinMonthStartInstant(now: Date = new Date()): Date {
  return berlinDayStartInstant(`${berlinCalendarDate(now).slice(0, 8)}01`)
}
