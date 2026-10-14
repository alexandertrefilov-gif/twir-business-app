// lib/billing/document-amounts.ts
//
// REQ-029 F2-B: Gemeinsame Beträge für Angebot, Auftrag und Rechnung aus EINER Rechenquelle (`calculateInvoice`, twir-calc-1).
// Reines Modul (keine Prisma-/React-/Next-Importe), ausschließlich Dezimalarithmetik, Beträge als Cent-Strings.
//
// Regeln (identisch zur akzeptierten Rechnungslogik, DEC-015 / EN 16931):
//   - Positionsnetto: Menge × Preis − Rabatt, genau einmal auf 2 Nachkommastellen gerundet (HALF_UP).
//   - Steuer je Satz: roundCents(Σ gerundete Positionsnetto × Satz / 100), einmal je Satz (BT-117).
//   - Brutto = Netto + Steuer.
//   - Positionssteuer: Die gerundete Satzsteuer wird nach dem Verfahren des größten Rests auf die Positionen des Satzes
//     verteilt (Σ Positionssteuer je Satz = Satzsteuer). Dadurch bleibt die bestehende Darstellung "Steuer je Satz =
//     Σ gespeicherte Positionssteuer" für neue UND historische Angebote/Aufträge unverändert gültig; es wird nichts neu gerechnet.

import { MoneyDecimal, toCentString } from './money'
import type { Money } from './money'
import { calculateInvoice, CALC_VERSION } from './invoice-calculator'
import type { CalcLineInput } from './invoice-calculator'

export type DocumentLineInput = {
  quantity:      string
  unitPrice:     string
  taxRate:       string
  /** Positionsrabatt in Prozent (Default "0"). */
  discountRate?: string
}

export type DocumentLineAmounts = {
  netAmount:   string
  taxAmount:   string
  grossAmount: string
}

export type DocumentTaxGroup = {
  /** Steuersatz mit 2 Nachkommastellen ("19.00"). */
  rate:          string
  /** BT-116 */
  taxableAmount: string
  /** BT-117 */
  taxAmount:     string
}

export type DocumentAmounts = {
  calcVersion: typeof CALC_VERSION
  lines:       DocumentLineAmounts[]
  taxGroups:   DocumentTaxGroup[]
  totalNet:    string
  totalTax:    string
  totalGross:  string
}

type Part = { index: number; floor: Money; fraction: Money }

/**
 * Verteilt die gerundete Satzsteuer ganzzahlig in Cent auf die Positionen des Satzes (größter Rest,
 * bei Gleichstand die kleinere Positionsnummer). Σ Ergebnis je Satz = Satzsteuer.
 */
export function allocateLineTax(
  nets: readonly string[],
  rates: readonly string[],
  groupTaxByRate: ReadonlyMap<string, string>,
): string[] {
  const result: Money[] = nets.map(() => new MoneyDecimal(0))
  const byRate = new Map<string, number[]>()
  rates.forEach((rate, index) => {
    const key = new MoneyDecimal(rate).toFixed(2)
    const list = byRate.get(key)
    if (list) list.push(index)
    else byRate.set(key, [index])
  })

  for (const [key, indexes] of byRate) {
    const target = new MoneyDecimal(groupTaxByRate.get(key) ?? '0').times(100)
    const parts: Part[] = indexes.map((index) => {
      const exactCents = new MoneyDecimal(nets[index]).times(new MoneyDecimal(key))
      const floor = exactCents.floor()
      return { index, floor, fraction: exactCents.minus(floor) }
    })
    let floorSum = new MoneyDecimal(0)
    for (const part of parts) floorSum = floorSum.plus(part.floor)
    let left = target.minus(floorSum)
    if (left.isNegative() || left.gt(parts.length)) {
      throw new Error(`Positionssteuer-Verteilung nicht möglich (Satz ${key}): Rest ${left.toFixed()} bei ${parts.length} Positionen`)
    }
    parts.sort((a, b) => {
      const byFraction = b.fraction.comparedTo(a.fraction)
      return byFraction !== 0 ? byFraction : a.index - b.index
    })
    for (const part of parts) {
      const extra = left.gt(0) ? 1 : 0
      left = left.minus(extra)
      result[part.index] = part.floor.plus(extra).dividedBy(100)
    }
  }
  return result.map((value) => toCentString(value))
}

/**
 * Berechnet Positionen, Steuergruppen und Summen eines Angebots/Auftrags/Rechnungsentwurfs aus Klartext-Dezimalwerten.
 * Wirft `InvoiceCalculationError` / `MoneyParseError` bei ungültigen Eingaben (nie stilles Runden von Eingaben).
 */
export function calculateDocumentAmounts(lines: readonly DocumentLineInput[]): DocumentAmounts {
  const calcLines: CalcLineInput[] = lines.map((line, index) => ({
    key:          String(index + 1),
    quantity:     line.quantity,
    unitPrice:    line.unitPrice,
    taxRate:      line.taxRate,
    discountRate: line.discountRate ?? '0',
    taxCategory:  'S' as const,
  }))
  const result = calculateInvoice(calcLines)
  const groupTax = new Map(result.vat.map((group) => [group.rate, group.taxAmount] as const))
  const taxes = allocateLineTax(
    result.lines.map((line) => line.lineNet),
    result.lines.map((line) => line.taxRate),
    groupTax,
  )
  return {
    calcVersion: result.calcVersion,
    lines: result.lines.map((line, index) => ({
      netAmount:   line.lineNet,
      taxAmount:   taxes[index],
      grossAmount: toCentString(new MoneyDecimal(line.lineNet).plus(new MoneyDecimal(taxes[index]))),
    })),
    taxGroups: result.vat.map((group) => ({ rate: group.rate, taxableAmount: group.taxableAmount, taxAmount: group.taxAmount })),
    totalNet:   result.totals.lineNetSum,
    totalTax:   result.totals.taxTotal,
    totalGross: result.totals.grandTotal,
  }
}
