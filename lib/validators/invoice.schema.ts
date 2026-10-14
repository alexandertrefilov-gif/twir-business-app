// lib/validators/invoice.schema.ts
// Wiederverwendet calcItemAmounts aus offer.schema.ts (Phase 4) — kein Duplikat.

import { z } from 'zod'
import { canonicalizeOfferTextValue, isValidOfferTextValue } from '@/lib/offers/rich-text'
import { decimalInputSchema, DISCOUNT_SPEC, QUANTITY_SPEC, UNIT_PRICE_SPEC } from '@/lib/billing/decimal-input'
import { MoneyDecimal } from '@/lib/billing/money'
export { calcItemAmounts, calcOfferTotals as calcInvoiceTotals } from '@/lib/validators/offer.schema'

// Menge/Einzelpreis werden als Dezimal-String serverseitig streng geprüft (kein stilles Runden).
// Ausgabe bleibt bis P4 eine Zahl für die bestehenden Services; Rückführung String→Zahl ist für
// ≤ 2 bzw. 3 Nachkommastellen verlustfrei (Test: invoice-service-report-precision).
const toLegacyNumber = (value: string): number => Number(value)

// REQ-029 P4-B: Positionsrabatt in % (Decimal(5,2), 0–100, höchstens 2 Nachkommastellen, keine stille Rundung).
// Ausgabe ist der kanonische Dezimal-String mit genau zwei Nachkommastellen (z. B. '0.00', '12.50').
const toDiscountString = (value: string): string => new MoneyDecimal(value).toFixed(2)

// Käuferreferenz (XRechnung BT-10): optional, getrimmt, leer → null, höchstens 255 Zeichen.
// undefined = Feld nicht übermittelt (bestehender Wert bleibt unverändert).
export const BUYER_REFERENCE_MAX_LENGTH = 255

export const InvoiceRecipientSourceSchema = z.enum(['CUSTOMER', 'BILLING', 'CUSTOM'])

export const InvoiceDraftSchema = z.object({
  customerId:          z.string().uuid('Bitte Kunde auswählen'),
  invoiceRecipientSource: InvoiceRecipientSourceSchema.default('CUSTOMER'),
  billingAddressId:       z.string().uuid('Rechnungsadresse ist ungültig').optional().nullable(),
  recipientName:        z.string().max(300).optional().nullable(),
  recipientAdditional:  z.string().max(200).optional().nullable(),
  recipientStreet:      z.string().max(200).optional().nullable(),
  recipientHouseNumber: z.string().max(20).optional().nullable(),
  recipientPostalCode:  z.string().max(10).optional().nullable(),
  recipientCity:        z.string().max(100).optional().nullable(),
  recipientCountry:     z.string().length(2).optional().nullable(),
  recipientContactName: z.string().max(200).optional().nullable(),
  recipientEmail:       z.string().email('E-Mail ist ungültig').max(200).optional().nullable(),
  orderId:             z.string().uuid().optional().nullable(),
  invoiceDate:         z.coerce.date({ invalid_type_error: 'Rechnungsdatum ungültig' }),
  dueDate:             z.coerce.date().optional().nullable(),
  deliveryDate:        z.coerce.date().optional().nullable(),
  deliveryPeriodStart: z.coerce.date().optional().nullable(),
  deliveryPeriodEnd:   z.coerce.date().optional().nullable(),
  paymentTermDays:     z.coerce.number().int().min(0).max(365).optional().nullable(),
  introText:           z.preprocess(
    (value) => typeof value === 'string' ? canonicalizeOfferTextValue(value) : value,
    z.string().max(500_000).refine(isValidOfferTextValue, 'Textformat ist ungültig'),
  ).optional().nullable(),
  outroText:           z.preprocess(
    (value) => typeof value === 'string' ? canonicalizeOfferTextValue(value) : value,
    z.string().max(500_000).refine(isValidOfferTextValue, 'Textformat ist ungültig'),
  ).optional().nullable(),
  buyerReference:      z.preprocess(
    (value) => typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
    z.string()
      .max(BUYER_REFERENCE_MAX_LENGTH, `Die Käuferreferenz darf höchstens ${BUYER_REFERENCE_MAX_LENGTH} Zeichen lang sein.`)
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'Die Käuferreferenz darf keine Steuer- oder Zeilenumbruchzeichen enthalten.')
      .nullable(),
  ).optional(),
  items: z.array(z.object({
    position:    z.number().int().min(1),
    description: z.string().min(1, 'Beschreibung erforderlich').max(500),
    quantity:    decimalInputSchema(QUANTITY_SPEC).transform(toLegacyNumber),
    unit:        z.string().max(20).default('Stk.'),
    unitPrice:   decimalInputSchema(UNIT_PRICE_SPEC).transform(toLegacyNumber),
    discountRate: decimalInputSchema(DISCOUNT_SPEC).transform(toDiscountString).default('0.00'),
    taxRate:     z.number().min(0).max(100),
    notes:       z.string().max(500).optional().nullable(),
  })).min(1, 'Mindestens eine Position erforderlich').max(100),
}).superRefine((data, ctx) => {
  if (data.invoiceRecipientSource === 'BILLING' && !data.billingAddressId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['billingAddressId'], message: 'Bitte Rechnungsadresse auswählen' })
  }
  if (data.invoiceRecipientSource !== 'CUSTOM') return
  for (const [field, message] of [
    ['recipientName', 'Firma / Name ist erforderlich'],
    ['recipientStreet', 'Straße ist erforderlich'],
    ['recipientPostalCode', 'PLZ ist erforderlich'],
    ['recipientCity', 'Ort ist erforderlich'],
    ['recipientCountry', 'Land ist erforderlich'],
  ] as const) {
    if (!data[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message })
  }
  if (data.recipientPostalCode && !/^\d{4,10}$/.test(data.recipientPostalCode)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientPostalCode'], message: 'PLZ ist ungültig' })
  }
})

export type InvoiceDraftInput = z.infer<typeof InvoiceDraftSchema>
