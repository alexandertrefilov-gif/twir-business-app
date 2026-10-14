// REQ-029 P5-6 B-1 (B1): Buchhaltungsperioden sind Kalendergrenzen in Europe/Berlin.
//
// Datumsmodell (E7): Rechnungs-/Zahlungsdaten sind Kalendertage, gespeichert als UTC-Mitternacht. Die Periodengrenzen
// werden deshalb in derselben Darstellung gebildet (UTC-Mitternacht des Kalendertags) und sind damit direkt mit den
// gespeicherten Werten vergleichbar – unabhängig von process.env.TZ. „Heute" ist der Berliner Kalendertag.
import { berlinDayStartUtc, formatUtcCalendarDate } from '@/lib/utils/berlin-date'

export type AccountingPeriodPreset = 'month' | 'quarter' | 'year' | 'custom'

export interface AccountingPeriod {
  preset: AccountingPeriodPreset
  from: Date
  toExclusive: Date
  fromInput: string
  toInput: string
  label: string
}

/** UTC-Mitternacht des Kalendertags; Überlauf von Tag/Monat wird kalendarisch normalisiert (Tag 0 = Vormonatsletzter). */
function calendarDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

function addDays(date: Date, days: number): Date {
  return calendarDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)
}

/** Streng `JJJJ-MM-TT` und kalendarisch gültig (kein 29.02.2027); sonst `null`. */
function parseCalendarDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = calendarDate(year, month - 1, day)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? parsed
    : null
}

/** `TT.MM.JJJJ` aus dem Kalendertag (keine Locale-/Zeitzonenabhängigkeit). */
function germanDate(date: Date): string {
  const [year, month, day] = formatUtcCalendarDate(date).split('-')
  return `${day}.${month}.${year}`
}

export function resolveAccountingPeriod(
  query: { period?: string; from?: string; to?: string },
  now = new Date(),
): AccountingPeriod {
  const requested = query.period
  const preset: AccountingPeriodPreset = requested === 'quarter' || requested === 'year' || requested === 'custom'
    ? requested
    : 'month'
  const today = berlinDayStartUtc(now)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  let from: Date
  let toInclusive: Date

  if (preset === 'custom') {
    from = parseCalendarDate(query.from) ?? calendarDate(year, month, 1)
    toInclusive = parseCalendarDate(query.to) ?? today
    if (toInclusive < from) [from, toInclusive] = [toInclusive, from]
  } else if (preset === 'quarter') {
    const quarterMonth = Math.floor(month / 3) * 3
    from = calendarDate(year, quarterMonth, 1)
    toInclusive = calendarDate(year, quarterMonth + 3, 0)
  } else if (preset === 'year') {
    from = calendarDate(year, 0, 1)
    toInclusive = calendarDate(year, 11, 31)
  } else {
    from = calendarDate(year, month, 1)
    toInclusive = calendarDate(year, month + 1, 0)
  }

  return {
    preset,
    from,
    toExclusive: addDays(toInclusive, 1),
    fromInput: formatUtcCalendarDate(from),
    toInput: formatUtcCalendarDate(toInclusive),
    label: `${germanDate(from)} – ${germanDate(toInclusive)}`,
  }
}
