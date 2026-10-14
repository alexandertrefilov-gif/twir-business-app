// lib/billing/decimal-input.ts
//
// Strenge, serverseitige Eingabevalidierung für Mengen und Preise (REQ-029 P2).
//   - Eingaben sind Dezimal-Strings (oder – für ältere Aufrufer – endliche JS-Zahlen,
//     die zuerst in ihren exakten Klartext überführt und dann wie Strings geprüft werden).
//   - KEINE automatische Rundung: mehr Nachkommastellen als erlaubt → verständlicher Fehler.
//   - Ausgabe: kanonischer Klartext-String ohne Nullen am Ende ("12.5", "0").

import { z } from 'zod'
import { MoneyDecimal, MoneyParseError, parseDecimal } from './money'

export type DecimalFieldSpec = {
  label:         string
  maxScale:      number
  min:           string
  max:           string
  /** true: Wert muss größer als `min` sein (z. B. Menge > 0). */
  minExclusive?: boolean
}

export type DecimalFieldResult =
  | { ok: true;  value: string }
  | { ok: false; message: string }

const DE_NUMBER = (plain: string) => plain.replace('.', ',')

/** Überführt eine endliche JS-Zahl in ihren exakten Klartext (nur für ältere Aufrufer/Tests). */
export function legacyNumberToDecimalString(value: number): string {
  return new MoneyDecimal(value).toFixed()
}

export function validateDecimalField(value: unknown, spec: DecimalFieldSpec): DecimalFieldResult {
  const { label, maxScale, min, max } = spec

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { ok: false, message: `${label} ist keine gültige Zahl.` }
  }
  const text = typeof value === 'number' ? legacyNumberToDecimalString(value) : value
  if (typeof text !== 'string') {
    return { ok: false, message: `${label} ist erforderlich.` }
  }
  if (text.trim() === '') {
    return { ok: false, message: `${label} ist erforderlich.` }
  }

  let parsed
  try {
    parsed = parseDecimal(text, label, maxScale)
  } catch (error) {
    if (error instanceof MoneyParseError && error.message.includes('Nachkommastellen')) {
      return {
        ok: false,
        message: `${label}: höchstens ${maxScale} Nachkommastellen erlaubt. Der Wert wird nicht automatisch gerundet – bitte korrigieren.`,
      }
    }
    return { ok: false, message: `${label} ist keine gültige Zahl (Dezimalpunkt statt Komma verwenden, z. B. 12.50).` }
  }

  const lowerBound = new MoneyDecimal(min)
  const upperBound = new MoneyDecimal(max)
  if (spec.minExclusive ? !parsed.gt(lowerBound) : parsed.lt(lowerBound)) {
    return {
      ok: false,
      message: spec.minExclusive
        ? `${label} muss größer als ${DE_NUMBER(min)} sein.`
        : `${label} darf nicht kleiner als ${DE_NUMBER(min)} sein.`,
    }
  }
  if (parsed.gt(upperBound)) {
    return { ok: false, message: `${label} darf höchstens ${DE_NUMBER(max)} betragen.` }
  }

  return { ok: true, value: parsed.isZero() ? '0' : parsed.toFixed() }
}

/**
 * Zod-Schema: akzeptiert String oder Zahl, validiert streng, liefert den kanonischen String.
 * Der Positions-Index (falls im Pfad) wird der Fehlermeldung vorangestellt.
 */
export function decimalInputSchema(spec: DecimalFieldSpec) {
  return z
    .union([z.string(), z.number()], {
      errorMap: () => ({ message: `${spec.label} ist erforderlich.` }),
    })
    .transform((value, ctx) => {
      const result = validateDecimalField(value, spec)
      if (result.ok) return result.value
      const index = ctx.path.find((segment): segment is number => typeof segment === 'number')
      ctx.addIssue({
        code:    z.ZodIssueCode.custom,
        message: index === undefined ? result.message : `Position ${index + 1}: ${result.message}`,
      })
      return z.NEVER
    })
}

// Gemeinsame Feldregeln (DB: Menge Decimal(10,3), Preis Decimal(12,2))
export const QUANTITY_SPEC: DecimalFieldSpec = {
  label: 'Menge', maxScale: 3, min: '0', max: '999999', minExclusive: true,
}
export const UNIT_PRICE_SPEC: DecimalFieldSpec = {
  label: 'Einzelpreis', maxScale: 2, min: '0', max: '99999999',
}

// REQ-029 P4-B: Positionsrabatt in % (DB: Decimal(5,2)), 0–100, höchstens 2 Nachkommastellen.
export const DISCOUNT_SPEC: DecimalFieldSpec = {
  label: 'Rabatt', maxScale: 2, min: '0', max: '100',
}
