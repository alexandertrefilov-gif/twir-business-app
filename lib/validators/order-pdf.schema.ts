import { z } from 'zod'

export class OrderPdfValidationError extends Error {}

const option = z.preprocess(
  (value) => {
    if (value === true || value === 'true' || value === '1') return true
    if (value === false || value === 'false' || value === '0') return false
    return value
  },
  z.boolean(),
)

export const OrderPdfOptionsSchema = z.object({
  showCustomer: option,
  showContact: option,
  showOrderNumber: option,
  showOrderDate: option,
  showTitle: option,
  showDescription: option,
  showItems: option,
  showQuantities: option,
  showUnits: option,
  showUnitPrices: option,
  showTotalPrices: option,
  showTax: option,
  showSummaries: option,
  showInternalNotes: option,
  showServicePeriod: option,
  showOfferReference: option,
})

export type OrderPdfOptions = z.infer<typeof OrderPdfOptionsSchema>

export const EMPLOYEE_ORDER_PDF_OPTIONS: OrderPdfOptions = {
  showCustomer: true,
  showContact: true,
  showOrderNumber: true,
  showOrderDate: true,
  showTitle: true,
  showDescription: true,
  showItems: true,
  showQuantities: true,
  showUnits: true,
  showUnitPrices: false,
  showTotalPrices: false,
  showTax: false,
  showSummaries: false,
  showInternalNotes: false,
  showServicePeriod: true,
  showOfferReference: true,
}

export const FULL_ORDER_PDF_OPTIONS: OrderPdfOptions = Object.fromEntries(
  Object.keys(EMPLOYEE_ORDER_PDF_OPTIONS).map((key) => [key, true]),
) as unknown as OrderPdfOptions

export function parseOrderPdfOptions(searchParams: URLSearchParams): OrderPdfOptions {
  const raw = Object.fromEntries(
    Object.keys(EMPLOYEE_ORDER_PDF_OPTIONS)
      .filter((key) => searchParams.has(key))
      .map((key) => [key, searchParams.get(key)]),
  )
  const result = OrderPdfOptionsSchema.safeParse({ ...EMPLOYEE_ORDER_PDF_OPTIONS, ...raw })
  if (!result.success) throw new OrderPdfValidationError('Ungültige Auftrags-PDF-Konfiguration')
  return result.data
}

export function isPriceFreeOrderPdf(options: OrderPdfOptions): boolean {
  return !options.showUnitPrices &&
    !options.showTotalPrices &&
    !options.showTax &&
    !options.showSummaries
}
