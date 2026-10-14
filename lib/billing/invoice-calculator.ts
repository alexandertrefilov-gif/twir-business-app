// lib/billing/invoice-calculator.ts
//
// Kanonischer Rechnungs-Calculator (REQ-029 Block 1, DEC-015, Variante B).
// Reines Modul: keine Prisma-/React-/Next-Importe, keine Seiteneffekte.
// Gedacht als einzige Rechenquelle für XML, PDF, UI und Datenbank; die Schnittstelle
// ist dokumentenneutral und kann später auch für Angebote/Aufträge genutzt werden.
//
// Regeln:
//   1. Basis       = Menge × Einzelpreis / Preisbasis              (ungerundet, exakt)
//   2. Positions-Netto = Basis − Basis × Rabatt% + Zuschläge − Abschläge,
//                        GENAU EINMAL auf 2 Nachkommastellen gerundet (HALF_UP)
//   3. BT-116      = Σ gerundete Positions-Netto je (Kategorie, Satz)
//   4. BT-117      = BT-116 × Satz / 100, einmal je (Kategorie, Satz) gerundet (HALF_UP)
//   5. BT-106 = Σ Positions-Netto; BT-109 = Σ BT-116 (keine Dokument-Zu-/Abschläge in V1);
//      BT-110 = Σ BT-117; BT-112 = BT-109 + BT-110; BT-113 = 0; BT-114 = 0;
//      BT-115 = BT-112 − BT-113 + BT-114
//   6. Positions-Umsatzsteuer/-Brutto sind KEINE Ergebnisse dieses Moduls.

import {
  MoneyDecimal,
  MoneyParseError,
  parseDecimal,
  roundCents,
  toCentString,
  type DecimalInput,
  type Money,
} from './money'

export const CALC_VERSION = 'twir-calc-1' as const

/** V1: nur Kategorie S (DEC-015 D5). Erweiterbar, ohne die Schnittstelle zu ändern. */
export const SUPPORTED_TAX_CATEGORIES = ['S'] as const
export type TaxCategory = (typeof SUPPORTED_TAX_CATEGORIES)[number]

export type CalcLineInput = {
  /** Eindeutiger Schlüssel der Position (ID oder Index) zur Zuordnung im Ergebnis. */
  key:           string
  quantity:      DecimalInput
  unitPrice:     DecimalInput
  /** Preisbasis (Preis gilt je N Einheiten). Default "1". Muss > 0 sein. */
  priceBase?:    DecimalInput
  taxCategory:   TaxCategory
  taxRate:       DecimalInput
  /** Positionsrabatt in Prozent (0–100), auf die ungerundete Basis. Default "0". */
  discountRate?: DecimalInput
  /** Positionszuschläge (Beträge, max. 2 NK). V1: leer. */
  surcharges?:   DecimalInput[]
  /** Positionsabschläge (Beträge, max. 2 NK). V1: leer. */
  allowances?:   DecimalInput[]
}

export type CalcLineResult = {
  key:                    string
  /** Gerundete Basis Menge × Preis / Preisbasis – nur Anzeige. */
  baseAmountRounded:      string
  /** Rabattbetrag, abgeleitet: round(Basis) + Zuschläge − Abschläge − Positions-Netto – nur Anzeige/XML. */
  discountAmountDerived:  string
  /** BT-131: Positions-Netto, genau einmal gerundet. */
  lineNet:                string
  taxCategory:            TaxCategory
  taxRate:                string
}

export type CalcVatBreakdown = {
  category:      TaxCategory
  rate:          string
  /** BT-116 */
  taxableAmount: string
  /** BT-117 */
  taxAmount:     string
}

export type CalcTotals = {
  lineNetSum:   string // BT-106
  taxBasisTotal: string // BT-109
  taxTotal:     string // BT-110
  grandTotal:   string // BT-112
  prepaid:      string // BT-113 (V1: 0.00)
  rounding:     string // BT-114 (V1: 0.00)
  payable:      string // BT-115
}

export type CalcResult = {
  calcVersion: typeof CALC_VERSION
  lines:       CalcLineResult[]
  vat:         CalcVatBreakdown[]
  totals:      CalcTotals
}

export type CalcErrorCode =
  | 'INVALID_NUMBER'
  | 'INVALID_RANGE'
  | 'UNSUPPORTED_TAX_CATEGORY'
  | 'DUPLICATE_KEY'

export class InvoiceCalculationError extends Error {
  readonly code: CalcErrorCode
  readonly lineKey?: string
  constructor(code: CalcErrorCode, message: string, lineKey?: string) {
    super(message)
    this.name    = 'InvoiceCalculationError'
    this.code    = code
    this.lineKey = lineKey
  }
}

// Skalengrenzen der Eingaben (DB: Menge Decimal(10,3), Preis Decimal(12,2), Sätze Decimal(5,2))
const MAX_SCALE_QUANTITY  = 3
const MAX_SCALE_UNITPRICE = 4
const MAX_SCALE_PRICEBASE = 3
const MAX_SCALE_PERCENT   = 2
const MAX_SCALE_AMOUNT    = 2

type ParsedLine = {
  key:          string
  category:     TaxCategory
  rate:         Money
  lineNet:      Money
  baseRounded:  Money
  discountDerived: Money
}

function parse(value: unknown, field: string, scale: number, lineKey: string): Money {
  try {
    return parseDecimal(value, field, scale)
  } catch (error) {
    if (error instanceof MoneyParseError) {
      throw new InvoiceCalculationError('INVALID_NUMBER', `Position ${lineKey}: ${error.message}`, lineKey)
    }
    throw error
  }
}

function calcLine(line: CalcLineInput): ParsedLine {
  const key = line.key

  if (!(SUPPORTED_TAX_CATEGORIES as readonly string[]).includes(line.taxCategory)) {
    throw new InvoiceCalculationError(
      'UNSUPPORTED_TAX_CATEGORY',
      `Position ${key}: Steuerkategorie "${String(line.taxCategory)}" wird in V1 nicht unterstützt`,
      key,
    )
  }

  const quantity  = parse(line.quantity,  'Menge',        MAX_SCALE_QUANTITY,  key)
  const unitPrice = parse(line.unitPrice, 'Einzelpreis',  MAX_SCALE_UNITPRICE, key)
  const priceBase = parse(line.priceBase ?? '1', 'Preisbasis', MAX_SCALE_PRICEBASE, key)
  const rate      = parse(line.taxRate,   'Steuersatz',   MAX_SCALE_PERCENT,   key)
  const discount  = parse(line.discountRate ?? '0', 'Rabatt', MAX_SCALE_PERCENT, key)

  if (!priceBase.gt(0)) {
    throw new InvoiceCalculationError('INVALID_RANGE', `Position ${key}: Preisbasis muss größer 0 sein`, key)
  }
  if (rate.lt(0) || rate.gt(100)) {
    throw new InvoiceCalculationError('INVALID_RANGE', `Position ${key}: Steuersatz muss zwischen 0 und 100 liegen`, key)
  }
  if (discount.lt(0) || discount.gt(100)) {
    throw new InvoiceCalculationError('INVALID_RANGE', `Position ${key}: Rabatt muss zwischen 0 und 100 liegen`, key)
  }

  let surchargeSum = new MoneyDecimal(0)
  for (const [index, value] of (line.surcharges ?? []).entries()) {
    surchargeSum = surchargeSum.plus(parse(value, `Zuschlag ${index + 1}`, MAX_SCALE_AMOUNT, key))
  }
  let allowanceSum = new MoneyDecimal(0)
  for (const [index, value] of (line.allowances ?? []).entries()) {
    allowanceSum = allowanceSum.plus(parse(value, `Abschlag ${index + 1}`, MAX_SCALE_AMOUNT, key))
  }

  // 1. Basis – ungerundet (exakt, solange Preisbasis = 1)
  const base = quantity.times(unitPrice).dividedBy(priceBase)
  // 2. Rabatt auf die UNGERUNDETE Basis
  const discountExact = base.times(discount).dividedBy(100)
  // 3. Genau eine Rundung
  const lineNet = roundCents(base.minus(discountExact).plus(surchargeSum).minus(allowanceSum))

  const baseRounded     = roundCents(base)
  const discountDerived = baseRounded.plus(surchargeSum).minus(allowanceSum).minus(lineNet)

  return { key, category: line.taxCategory, rate, lineNet, baseRounded, discountDerived }
}

/** Positions-Netto (BT-131) einer einzelnen Position – dieselbe Logik wie `calculateInvoice`. */
export function calculateLineNet(line: CalcLineInput): string {
  return toCentString(calcLine(line).lineNet)
}

/**
 * Berechnet Positionen, Steueraufschlüsselung und Summen eines Dokuments.
 * Deterministisch, reihenfolgeunabhängig bei den Summen, ohne Seiteneffekte.
 */
export function calculateInvoice(lines: CalcLineInput[]): CalcResult {
  const seen = new Set<string>()
  const parsed: ParsedLine[] = []
  for (const line of lines) {
    if (seen.has(line.key)) {
      throw new InvoiceCalculationError('DUPLICATE_KEY', `Positionsschlüssel "${line.key}" ist doppelt vergeben`, line.key)
    }
    seen.add(line.key)
    parsed.push(calcLine(line))
  }

  // Gruppierung je (Kategorie, Satz) – BT-116 aus gerundeten Positions-Netto-Werten
  const groups = new Map<string, { category: TaxCategory; rate: Money; taxable: Money }>()
  for (const line of parsed) {
    const groupKey = `${line.category}|${line.rate.toFixed(2)}`
    const existing = groups.get(groupKey)
    if (existing) {
      existing.taxable = existing.taxable.plus(line.lineNet)
    } else {
      groups.set(groupKey, { category: line.category, rate: line.rate, taxable: line.lineNet })
    }
  }

  const sortedGroups = [...groups.values()].sort((a, b) =>
    a.category === b.category ? a.rate.comparedTo(b.rate) : a.category < b.category ? -1 : 1,
  )

  let taxTotal      = new MoneyDecimal(0)
  let taxBasisTotal = new MoneyDecimal(0)
  const vat: CalcVatBreakdown[] = sortedGroups.map((group) => {
    // BT-117: einmal je Kategorie/Satz runden
    const tax = roundCents(group.taxable.times(group.rate).dividedBy(100))
    taxTotal      = taxTotal.plus(tax)
    taxBasisTotal = taxBasisTotal.plus(group.taxable)
    return {
      category:      group.category,
      rate:          group.rate.toFixed(2),
      taxableAmount: toCentString(group.taxable),
      taxAmount:     toCentString(tax),
    }
  })

  let lineNetSum = new MoneyDecimal(0)
  for (const line of parsed) lineNetSum = lineNetSum.plus(line.lineNet)

  const grandTotal = taxBasisTotal.plus(taxTotal)
  const prepaid    = new MoneyDecimal(0) // BT-113: V1 nicht genutzt
  const rounding   = new MoneyDecimal(0) // BT-114: V1 nicht genutzt
  const payable    = grandTotal.minus(prepaid).plus(rounding)

  return {
    calcVersion: CALC_VERSION,
    lines: parsed.map((line) => ({
      key:                   line.key,
      baseAmountRounded:     toCentString(line.baseRounded),
      discountAmountDerived: toCentString(line.discountDerived),
      lineNet:               toCentString(line.lineNet),
      taxCategory:           line.category,
      taxRate:               line.rate.toFixed(2),
    })),
    vat,
    totals: {
      lineNetSum:    toCentString(lineNetSum),
      taxBasisTotal: toCentString(taxBasisTotal),
      taxTotal:      toCentString(taxTotal),
      grandTotal:    toCentString(grandTotal),
      prepaid:       toCentString(prepaid),
      rounding:      toCentString(rounding),
      payable:       toCentString(payable),
    },
  }
}
