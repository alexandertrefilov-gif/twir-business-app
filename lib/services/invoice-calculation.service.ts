// lib/services/invoice-calculation.service.ts
//
// REQ-029 P4-A: EINE serverseitige Rechenquelle für Rechnungen (Anlegen, Bearbeiten, Vorschau,
// Gegenprüfung bei der Finalisierung). Dünner Wrapper um den kanonischen Calculator
// (`lib/billing`, DEC-015, `twir-calc-1`); keine Datenbank, keine Seiteneffekte.
//
// Regeln:
//   - Positionsnetto, Steuer je (Kategorie, Satz) und Summen kommen ausschließlich aus `calculateInvoice`.
//   - Positionssteuer und Positionsbrutto sind ABGELEITET und rein informativ (D3): Steuer = Positionsnetto
//     × Satz / 100 (einmal gerundet), Brutto = Positionsnetto + Steuer. Σ Positionssteuer kann daher von der
//     Steuersumme (je Satz einmal gerundet) um Cent abweichen – maßgeblich ist immer `totalTax`.
//   - Ausgabe sind Dezimal-Strings mit genau zwei Nachkommastellen (Prisma schreibt sie ohne Float-Umweg).
//   - Rabatt wird durchgereicht; ob Rabatte > 0 zulässig sind, entscheidet die Rabattsperre im Service (P4-B).

import { calculateInvoice, CALC_VERSION, InvoiceCalculationError } from '@/lib/billing/invoice-calculator'
import { legacyNumberToDecimalString } from '@/lib/billing/decimal-input'
import { MoneyDecimal, MoneyParseError, parseDecimal, roundCents, toCentString } from '@/lib/billing/money'
import { BusinessRuleError } from '@/lib/auth/permissions'

type DecimalLike = { toFixed(): string }
type DecimalValue = string | number | DecimalLike

export type InvoiceCalcInputLine = {
  quantity:      DecimalValue
  unitPrice:     DecimalValue
  taxRate:       DecimalValue
  discountRate?: DecimalValue | null
}

export type InvoiceCalcOutputLine = {
  /** Positionsnetto (BT-131), genau einmal gerundet. */
  netAmount:   string
  /** Abgeleitet, rein informativ (siehe Kopfkommentar). */
  taxAmount:   string
  /** Abgeleitet, rein informativ. */
  grossAmount: string
}

export type InvoicePersistenceCalc = {
  calcVersion: typeof CALC_VERSION
  lines:       InvoiceCalcOutputLine[]
  totalNet:    string
  totalTax:    string
  totalGross:  string
}

/** Einzelpreis-Skala der Datenbankspalte (Decimal(12,2)): mehr Stellen würden beim Speichern stillschweigend gerundet. */
const UNIT_PRICE_DB_SCALE = 2

function toText(value: DecimalValue): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return legacyNumberToDecimalString(value)
  return value.toFixed()
}

export function calculateInvoiceForPersistence(lines: InvoiceCalcInputLine[]): InvoicePersistenceCalc {
  try {
    const prepared = lines.map((line, index) => {
      const unitPrice = toText(line.unitPrice)
      // Skalenprüfung an der Quelle, damit Netto (aus dem Preis gerechnet) und gespeicherter Preis übereinstimmen.
      parseDecimal(unitPrice, `Position ${index + 1}: Einzelpreis`, UNIT_PRICE_DB_SCALE)
      return {
        key:          String(index + 1),
        quantity:     toText(line.quantity),
        unitPrice,
        taxCategory:  'S' as const,
        taxRate:      toText(line.taxRate),
        discountRate: line.discountRate === undefined || line.discountRate === null ? '0' : toText(line.discountRate),
      }
    })

    const result = calculateInvoice(prepared)
    return {
      calcVersion: result.calcVersion,
      lines: result.lines.map((line) => {
        const net = new MoneyDecimal(line.lineNet)
        const tax = roundCents(net.times(new MoneyDecimal(line.taxRate)).dividedBy(100))
        return {
          netAmount:   line.lineNet,
          taxAmount:   toCentString(tax),
          grossAmount: toCentString(net.plus(tax)),
        }
      }),
      totalNet:   result.totals.lineNetSum,
      totalTax:   result.totals.taxTotal,
      totalGross: result.totals.grandTotal,
    }
  } catch (error) {
    if (error instanceof InvoiceCalculationError || error instanceof MoneyParseError) {
      throw new BusinessRuleError(error.message)
    }
    throw error
  }
}

// ── Gegenprüfung bei der Finalisierung (D5) ─────────────────────────────────

export type StoredInvoiceItemForCheck = {
  position:     number
  quantity:     DecimalLike
  unitPrice:    DecimalLike
  taxRate:      DecimalLike
  discountRate: DecimalLike | null
  netAmount:    DecimalLike
  taxAmount:    DecimalLike
  grossAmount:  DecimalLike
}

export type StoredInvoiceForCheck = {
  totalNet:   DecimalLike
  totalTax:   DecimalLike
  totalGross: DecimalLike
  items:      StoredInvoiceItemForCheck[]
}

const cents = (value: DecimalLike) => new MoneyDecimal(value.toFixed()).toFixed(2)

export const STALE_CALCULATION_HINT =
  'Bitte den Entwurf öffnen und erneut speichern, bevor er finalisiert wird.'

/**
 * Prüft, ob die gespeicherten Beträge eines Entwurfs exakt dem aktuellen Calculator entsprechen.
 * Liefert den Grund (Text) oder `null`, wenn alles aktuell ist. Verändert nichts – es wird nie still korrigiert.
 */
export function findStaleCalculation(invoice: StoredInvoiceForCheck): string | null {
  const items = [...invoice.items].sort((a, b) => a.position - b.position)
  if (items.some((item) => item.discountRate === null)) {
    return 'Der Entwurf enthält Positionen ohne Rabattangabe (Altbestand vor der neuen Berechnung).'
  }

  let calc: InvoicePersistenceCalc
  try {
    calc = calculateInvoiceForPersistence(items.map((item) => ({
      quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, discountRate: item.discountRate,
    })))
  } catch (error) {
    return error instanceof Error ? error.message : 'Die Berechnung ist nicht möglich.'
  }

  if (cents(invoice.totalNet) !== calc.totalNet) return 'Die gespeicherte Nettosumme weicht von der aktuellen Berechnung ab.'
  if (cents(invoice.totalTax) !== calc.totalTax) return 'Die gespeicherte Steuersumme weicht von der aktuellen Berechnung ab.'
  if (cents(invoice.totalGross) !== calc.totalGross) return 'Die gespeicherte Bruttosumme weicht von der aktuellen Berechnung ab.'

  for (const [index, item] of items.entries()) {
    const expected = calc.lines[index]
    if (cents(item.netAmount) !== expected.netAmount) return `Position ${item.position}: Positions-Netto weicht von der aktuellen Berechnung ab.`
    if (cents(item.taxAmount) !== expected.taxAmount) return `Position ${item.position}: Positions-Steuer weicht von der aktuellen Berechnung ab.`
    if (cents(item.grossAmount) !== expected.grossAmount) return `Position ${item.position}: Positions-Brutto weicht von der aktuellen Berechnung ab.`
  }
  return null
}
