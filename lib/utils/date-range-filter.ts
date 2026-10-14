// lib/utils/date-range-filter.ts
// REQ-029 P5-6 C-1: Von/Bis-Datumsfilter der Listenseiten (Audit-Log, Zahlungsjournal) als EINE Prisma-Bedingung.
//
// Eingabe: Die Seiten parsen `<input type="date">` mit `new Date('JJJJ-MM-TT')`, d. h. der gewählte KALENDERTAG
// liegt als UTC-Mitternacht vor (gleiche Darstellung wie gespeicherte Kalendertage). Der Tag wird deshalb über die
// UTC-Komponenten gelesen (formatUtcCalendarDate) und nie über die Prozess-Zeitzone.
//
// Beide Grenzen landen im selben Objekt: ein zweiter `createdAt`-/`paymentDate`-Schlüssel würde den ersten
// überschreiben (N1). Die Obergrenze ist immer exklusiv am Beginn des Folgetags, damit der „Bis“-Tag vollständig
// enthalten ist (N2). Ein leerer Zeitraum (Von nach Bis) ergibt eine nie erfüllbare Bedingung.

import {
  addCalendarDaysIso,
  berlinDayStartInstant,
  berlinNextDayStartInstant,
  formatUtcCalendarDate,
} from '@/lib/utils/berlin-date'

export interface InstantRange { gte?: Date; lt?: Date }

/**
 * Für Felder mit echten ZEITPUNKTEN (z. B. `AuditLog.createdAt`): Berliner Kalendertage `from`/`to`
 * (jeweils als UTC-Mitternacht des gewählten Tags) → [Berliner Tagesbeginn von `from`, Beginn des Tages nach `to`).
 * Liefert `undefined`, wenn weder `from` noch `to` gesetzt ist.
 */
export function instantRangeForBerlinDays(from?: Date, to?: Date): InstantRange | undefined {
  const range: InstantRange = {}
  if (from) range.gte = berlinDayStartInstant(formatUtcCalendarDate(from))
  if (to) range.lt = berlinNextDayStartInstant(formatUtcCalendarDate(to))
  return range.gte || range.lt ? range : undefined
}

/**
 * Für Felder mit KALENDERTAGEN (z. B. `Payment.paymentDate`, gespeichert als UTC-Mitternacht): Zeitraum
 * [Tag `from`, Tag `to`] einschließlich. Die Obergrenze ist exklusiv am Folgetag (UTC), damit auch Altwerte mit
 * Uhrzeit am Bis-Tag (z. B. `…T17:42Z`) erfasst werden.
 */
export function calendarDayRange(from?: Date, to?: Date): InstantRange | undefined {
  const range: InstantRange = {}
  if (from) range.gte = new Date(`${formatUtcCalendarDate(from)}T00:00:00.000Z`)
  if (to) range.lt = new Date(`${addCalendarDaysIso(formatUtcCalendarDate(to), 1)}T00:00:00.000Z`)
  return range.gte || range.lt ? range : undefined
}
