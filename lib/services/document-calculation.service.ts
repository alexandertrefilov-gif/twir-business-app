// lib/services/document-calculation.service.ts
//
// REQ-029 F2-B: Persistenz-Berechnung für Angebote und Aufträge über die zentrale Rechnungs-Rechenquelle
// (`lib/billing`, twir-calc-1). Dünner Adapter: Eingaben (Zahlen aus den bestehenden Zod-Schemas oder Klartext-Dezimalwerte)
// → Dezimal-Strings → `calculateDocumentAmounts`. Keine Datenbank, keine Seiteneffekte, kein eigener Rundungspfad.
// Ungültige Eingaben werden als BusinessRuleError mit verständlicher Meldung abgelehnt (keine stille Rundung).

import { calculateDocumentAmounts, type DocumentAmounts } from '@/lib/billing/document-amounts'
import { InvoiceCalculationError } from '@/lib/billing/invoice-calculator'
import { legacyNumberToDecimalString } from '@/lib/billing/decimal-input'
import { MoneyParseError, parseDecimal } from '@/lib/billing/money'
import { BusinessRuleError } from '@/lib/auth/permissions'

type DecimalLike = { toFixed(): string }
type DecimalValue = string | number | DecimalLike

export type DocumentCalcItem = {
  quantity:      DecimalValue
  unitPrice:     DecimalValue
  taxRate:       DecimalValue
  discountRate?: DecimalValue | null
}

/** Einzelpreis-Skala der Datenbankspalte (Decimal(12,2)). */
const UNIT_PRICE_DB_SCALE = 2

function toText(value: DecimalValue): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return legacyNumberToDecimalString(value)
  return value.toFixed()
}

export function calculateDocumentForPersistence(items: readonly DocumentCalcItem[]): DocumentAmounts {
  try {
    const prepared = items.map((item, index) => {
      const unitPrice = toText(item.unitPrice)
      parseDecimal(unitPrice, `Position ${index + 1}: Einzelpreis`, UNIT_PRICE_DB_SCALE)
      return {
        quantity:     toText(item.quantity),
        unitPrice,
        taxRate:      toText(item.taxRate),
        discountRate: item.discountRate === undefined || item.discountRate === null ? '0' : toText(item.discountRate),
      }
    })
    return calculateDocumentAmounts(prepared)
  } catch (error) {
    if (error instanceof InvoiceCalculationError || error instanceof MoneyParseError) {
      throw new BusinessRuleError(error.message)
    }
    throw error
  }
}
