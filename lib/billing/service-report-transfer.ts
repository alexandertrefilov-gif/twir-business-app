// lib/billing/service-report-transfer.ts
//
// Übernahme der Positionen eines Leistungsnachweises in einen Rechnungsentwurf (REQ-029 P2).
//   - Einzelpreis, Menge, Einheit, Steuersatz werden DIREKT übernommen (kein Rückrechnen aus dem Netto).
//   - Seit REQ-029 P4-B wird der Positionsrabatt unverändert (Dezimal-String) in den Rechnungsentwurf übernommen;
//     er wird nie stillschweigend entfernt oder verrechnet. Das Netto wird mit Rabatt berechnet.
//   - Weicht das neu berechnete Positions-Netto vom gespeicherten Nachweis-Netto ab (R-1),
//     wird die Differenz als Hinweis geliefert – ohne die Erstellung zu blockieren.

import { calculateLineNet, InvoiceCalculationError } from './invoice-calculator'
import { MoneyDecimal, toCentString } from './money'

type DecimalLike = { toFixed(): string }

export type ServiceReportItemLike = {
  id:           string
  description:  string
  quantity:     DecimalLike
  unit:         string
  unitPrice:    DecimalLike
  discountRate: DecimalLike
  taxRate:      DecimalLike
  netAmount:    DecimalLike
}

export type InvoiceItemPrefill = {
  _key:        string
  description: string
  quantity:    string
  unit:        string
  unitPrice:   string
  discountRate: string
  taxRate:     string
}

export type NetDeviation = {
  position:        number
  description:     string
  previousNet:     string
  recalculatedNet: string
  difference:      string
}

export type ServiceReportTransfer = {
  blocked:    { reason: string; positions: number[] } | null
  items:      InvoiceItemPrefill[]
  deviations: NetDeviation[]
}

export function prepareInvoiceItemsFromServiceReport(source: ServiceReportItemLike[]): ServiceReportTransfer {
  const items: InvoiceItemPrefill[] = []
  const deviations: NetDeviation[] = []

  for (const [index, item] of source.entries()) {
    const quantity  = item.quantity.toFixed()
    const unitPrice = item.unitPrice.toFixed()
    const taxRate   = item.taxRate.toFixed()
    const discountRate = new MoneyDecimal(item.discountRate.toFixed()).toFixed(2)
    items.push({ _key: item.id, description: item.description, quantity, unit: item.unit, unitPrice, discountRate, taxRate })

    let recalculated: string
    try {
      recalculated = calculateLineNet({
        key: item.id, quantity, unitPrice, taxRate, taxCategory: 'S', discountRate,
      })
    } catch (error) {
      if (error instanceof InvoiceCalculationError) {
        return {
          blocked: {
            reason: `Position ${index + 1} des Leistungsnachweises kann nicht berechnet werden: ${error.message}`,
            positions: [index + 1],
          },
          items: [],
          deviations: [],
        }
      }
      throw error
    }

    const previous = toCentString(new MoneyDecimal(item.netAmount.toFixed()))
    if (previous !== recalculated) {
      deviations.push({
        position:        index + 1,
        description:     item.description,
        previousNet:     previous,
        recalculatedNet: recalculated,
        difference:      toCentString(new MoneyDecimal(recalculated).minus(previous)),
      })
    }
  }

  return { blocked: null, items, deviations }
}
