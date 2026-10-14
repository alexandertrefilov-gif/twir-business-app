// lib/billing/money.ts
//
// Exakte Geld-Arithmetik für die kanonische Rechnungsberechnung (REQ-029, DEC-015).
//   - decimal.js, Präzision 40 signifikante Stellen
//   - Rundung: ROUND_HALF_UP = bei exakter Hälfte "weg von Null"
//     (TWIR-Designentscheidung, nicht normvorgeschrieben – siehe DEC-015)
//   - JavaScript-`number` wird als Eingabe ausdrücklich abgelehnt (Float-Risiko)

import Decimal from 'decimal.js'

/** Isolierter Decimal-Konstruktor: ändert NICHT die globale decimal.js-Konfiguration. */
export const MoneyDecimal = Decimal.clone({
  precision: 40,
  rounding:  Decimal.ROUND_HALF_UP,
})

export type Money = InstanceType<typeof MoneyDecimal>

/** String oder Decimal-Objekt (decimal.js / Prisma.Decimal). Nie `number`. */
export type DecimalInput = string | { toFixed(): string; isZero(): boolean }

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyParseError'
  }
}

const PLAIN_DECIMAL = /^[+-]?\d+(\.\d+)?$/

/** Anzahl der Nachkommastellen eines Klartext-Dezimalstrings (ohne Normalisierung von Nullen). */
function scaleOf(plain: string): number {
  const dot = plain.indexOf('.')
  return dot === -1 ? 0 : plain.length - dot - 1
}

/**
 * Parst eine Eingabe streng. Erlaubt sind nur Klartext-Dezimalzahlen
 * ("12", "-0.5", "1234.560"). Exponentialschreibweise, Leerstrings, NaN,
 * Infinity und JS-numbers werden abgelehnt.
 * `maxScale`: höchstens so viele Nachkommastellen (Nullen am Ende zählen nicht).
 */
export function parseDecimal(value: unknown, field: string, maxScale: number): Money {
  if (typeof value === 'number') {
    throw new MoneyParseError(`${field}: JavaScript-Zahlen sind nicht zulässig (Float-Risiko) – Wert als String oder Decimal übergeben`)
  }
  let plain: string
  if (typeof value === 'string') {
    plain = value.trim()
  } else if (value !== null && typeof value === 'object' && typeof (value as { toFixed?: unknown }).toFixed === 'function') {
    plain = (value as { toFixed(): string }).toFixed()
  } else {
    throw new MoneyParseError(`${field}: ungültiger Wert`)
  }
  if (!PLAIN_DECIMAL.test(plain)) {
    throw new MoneyParseError(`${field}: "${plain}" ist keine gültige Dezimalzahl`)
  }
  const parsed = new MoneyDecimal(plain)
  // Nachkommastellen ohne bedeutungslose Nullen am Ende zählen
  const significantScale = scaleOf(parsed.toFixed())
  if (significantScale > maxScale) {
    throw new MoneyParseError(`${field}: höchstens ${maxScale} Nachkommastellen erlaubt`)
  }
  return parsed
}

/** Rundet genau einmal auf zwei Dezimalstellen (HALF_UP, weg von Null). */
export function roundCents(value: Money): Money {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/** Ausgabe als String mit genau zwei Nachkommastellen; "-0.00" wird zu "0.00". */
export function toCentString(value: Money): string {
  return value.isZero() ? '0.00' : value.toFixed(2)
}
