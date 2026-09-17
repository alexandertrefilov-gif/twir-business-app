// lib/validators/invoice.schema.ts
// Wiederverwendet calcItemAmounts aus offer.schema.ts (Phase 4) — kein Duplikat.

import { z } from 'zod'
import { canonicalizeOfferTextValue, isValidOfferTextValue } from '@/lib/offers/rich-text'
export { calcItemAmounts, calcOfferTotals as calcInvoiceTotals } from '@/lib/validators/offer.schema'

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
  items: z.array(z.object({
    position:    z.number().int().min(1),
    description: z.string().min(1, 'Beschreibung erforderlich').max(500),
    quantity:    z.number().positive().max(999_999),
    unit:        z.string().max(20).default('Stk.'),
    unitPrice:   z.number().min(0).max(99_999_999),
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
