// lib/validators/service-report.schema.ts

import { z } from 'zod'
import { canonicalizeOfferTextValue, isValidOfferTextValue } from '@/lib/offers/rich-text'
import {
  decimalInputSchema,
  legacyNumberToDecimalString,
  validateDecimalField,
  QUANTITY_SPEC,
  UNIT_PRICE_SPEC,
  type DecimalFieldSpec,
} from '@/lib/billing/decimal-input'
import { calculateInvoice, calculateLineNet, type CalcLineInput } from '@/lib/billing/invoice-calculator'
import { MoneyDecimal, toCentString } from '@/lib/billing/money'

export const SERVICE_ITEM_TYPES = ['hours', 'material', 'flat'] as const
export type ServiceItemType = (typeof SERVICE_ITEM_TYPES)[number]

export const SERVICE_ITEM_TYPE_LABELS: Record<ServiceItemType, string> = {
  hours:    'Dienstleistung',
  material: 'Material',
  flat:     'Leistungseinheit',
}

/** Standardeinheiten je Typ */
export const DEFAULT_UNIT: Record<ServiceItemType, string> = {
  hours:    'Std.',
  material: 'Stk.',
  flat:     'Psch.',
}

// ── Item ─────────────────────────────────────────────────────

// Menge/Einzelpreis/Rabatt werden als Dezimal-String serverseitig streng geprüft (kein stilles Runden
// durch die Decimal-Spalten). Die Ausgabe bleibt bis P4 eine Zahl für bestehende Aufrufer; die
// Rückführung String→Zahl ist für ≤ 2 bzw. 3 Nachkommastellen verlustfrei (siehe Tests).
const toLegacyNumber = (value: string): number => Number(value)
const DISCOUNT_SPEC: DecimalFieldSpec = { label: 'Rabatt', maxScale: 2, min: '0', max: '100' }

export const ServiceReportItemSchema = z.object({
  position:    z.number().int().min(1),
  type:        z.enum(SERVICE_ITEM_TYPES),
  description: z.string().min(1, 'Beschreibung ist erforderlich').max(500),
  quantity:    decimalInputSchema(QUANTITY_SPEC).transform(toLegacyNumber),
  unit:        z.string().max(20),
  unitPrice:   decimalInputSchema(UNIT_PRICE_SPEC).transform(toLegacyNumber),
  discountRate: decimalInputSchema(DISCOUNT_SPEC).transform(toLegacyNumber).default(0),
  taxRate:      z.number().min(0).max(100).default(19),
  notes:       z.string().max(500).optional().nullable(),
})

export type ServiceReportItemInput = z.infer<typeof ServiceReportItemSchema>
/** Eingabeform (vor der Validierung): Mengen/Preise dürfen Strings sein. */
export type ServiceReportItemFormInput = z.input<typeof ServiceReportItemSchema>

// ── Report header ─────────────────────────────────────────────

export const ServiceReportCreateSchema = z.object({
  orderId:     z.string().uuid('Bitte Auftrag auswählen'),
  title:       z.string().max(200).optional().nullable(),
  description: z.preprocess(
    (value) => typeof value === 'string' ? canonicalizeOfferTextValue(value) : value,
    z.string().max(500_000).refine(isValidOfferTextValue, 'Textformat ist ungültig'),
  ).optional().nullable(),
  reportDate:  z.coerce.date({ invalid_type_error: 'Datum ungültig' }),
  items:       z.array(ServiceReportItemSchema).max(100),
})

export const ServiceReportUpdateSchema = ServiceReportCreateSchema

export type ServiceReportCreateInput = z.infer<typeof ServiceReportCreateSchema>
export type ServiceReportUpdateInput = z.infer<typeof ServiceReportUpdateSchema>

// ── Helpers ───────────────────────────────────────────────────
// Alle Beträge entstehen über den kanonischen Calculator (lib/billing, DEC-015):
// Positions-Netto genau einmal gerundet, Steuer einmal je Satz. Rückgabewerte bleiben
// Zahlen, weil bestehende Aufrufer/Tests damit arbeiten (Bridge bis P4/P6).

type NumericItem = { quantity: number; unitPrice: number; discountRate?: number; taxRate?: number }

function toCalcLine(item: NumericItem, key: string): CalcLineInput {
  return {
    key,
    quantity:     legacyNumberToDecimalString(item.quantity),
    unitPrice:    legacyNumberToDecimalString(item.unitPrice),
    discountRate: legacyNumberToDecimalString(item.discountRate ?? 0),
    taxRate:      legacyNumberToDecimalString(item.taxRate ?? 19),
    taxCategory:  'S',
  }
}

export function calcReportItemAmounts(item: NumericItem) {
  try {
    const result = calculateInvoice([toCalcLine(item, 'item')])
    const line = result.lines[0]
    return {
      subtotal:       Number(line.baseAmountRounded),
      discountAmount: Number(line.discountAmountDerived),
      netAmount:      Number(line.lineNet),
      taxAmount:      Number(result.totals.taxTotal),
      grossAmount:    Number(result.totals.grandTotal),
    }
  } catch {
    // Nur Anzeige bei ungültiger Zwischeneingabe (Server validiert streng): keine Beträge statt eines zweiten Rechenwegs (REQ-029 F2-B)
    return { subtotal: 0, discountAmount: 0, netAmount: 0, taxAmount: 0, grossAmount: 0 }
  }
}

/** Persistenz-/PDF-Netto: wirft bei ungültigen Werten, rundet nie stillschweigend. */
export function calcReportItemNet(item: { quantity: number; unitPrice: number; discountRate?: number }): number {
  return Number(calculateLineNet(toCalcLine(item, 'item')))
}

export function calcReportTotal(items: ServiceReportItemInput[]): number {
  const result = calculateInvoice(items.map((item, index) => toCalcLine(item, String(index))))
  return Number(result.totals.lineNetSum)
}

export function calcReportTotals(items: ServiceReportItemInput[]) {
  try {
    const result = calculateInvoice(items.map((item, index) => toCalcLine(item, String(index))))
    let subtotal = new MoneyDecimal(0)
    let discount = new MoneyDecimal(0)
    for (const line of result.lines) {
      subtotal = subtotal.plus(line.baseAmountRounded)
      discount = discount.plus(line.discountAmountDerived)
    }
    return {
      subtotal:      Number(toCentString(subtotal)),
      totalDiscount: Number(toCentString(discount)),
      totalNet:      Number(result.totals.lineNetSum),
      totalTax:      Number(result.totals.taxTotal),
      totalGross:    Number(result.totals.grandTotal),
    }
  } catch {
    const amounts = items.map(calcReportItemAmounts)
    const subtotal = Math.round(amounts.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100
    const totalDiscount = Math.round(amounts.reduce((sum, item) => sum + item.discountAmount, 0) * 100) / 100
    const totalNet = Math.round(amounts.reduce((sum, item) => sum + item.netAmount, 0) * 100) / 100
    const totalTax = Math.round(amounts.reduce((sum, item) => sum + item.taxAmount, 0) * 100) / 100
    return { subtotal, totalDiscount, totalNet, totalTax, totalGross: Math.round((totalNet + totalTax) * 100) / 100 }
  }
}

// ── Formular-Vorschau auf Basis der Eingabetexte (keine Floats) ──────────────

export type ReportPreviewTotals = {
  subtotal: string; totalDiscount: string; totalNet: string; totalTax: string; totalGross: string
  /** Positionen (1-basiert), deren Eingabe (noch) nicht berechenbar ist. */
  invalidPositions: number[]
}

function toCalcLineFromForm(item: ServiceReportItemFormInput, key: string): CalcLineInput | null {
  const quantity  = validateDecimalField(item.quantity, QUANTITY_SPEC)
  const unitPrice = validateDecimalField(item.unitPrice, UNIT_PRICE_SPEC)
  const discount  = validateDecimalField(item.discountRate ?? '0', DISCOUNT_SPEC)
  if (!quantity.ok || !unitPrice.ok || !discount.ok) return null
  const taxRate = typeof item.taxRate === 'number' ? legacyNumberToDecimalString(item.taxRate) : '19'
  return { key, quantity: quantity.value, unitPrice: unitPrice.value, discountRate: discount.value, taxRate, taxCategory: 'S' }
}

export function previewReportLine(item: ServiceReportItemFormInput): string | null {
  const line = toCalcLineFromForm(item, 'item')
  return line ? calculateLineNet(line) : null
}

export function previewReportTotals(items: ServiceReportItemFormInput[]): ReportPreviewTotals {
  const lines: CalcLineInput[] = []
  const invalidPositions: number[] = []
  items.forEach((item, index) => {
    const line = toCalcLineFromForm(item, String(index))
    if (line) lines.push(line); else invalidPositions.push(index + 1)
  })
  const result = calculateInvoice(lines)
  let subtotal = new MoneyDecimal(0)
  let discount = new MoneyDecimal(0)
  for (const line of result.lines) {
    subtotal = subtotal.plus(line.baseAmountRounded)
    discount = discount.plus(line.discountAmountDerived)
  }
  return {
    subtotal: toCentString(subtotal), totalDiscount: toCentString(discount),
    totalNet: result.totals.lineNetSum, totalTax: result.totals.taxTotal, totalGross: result.totals.grandTotal,
    invalidPositions,
  }
}
