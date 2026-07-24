// lib/validators/offer.schema.ts
import { z } from 'zod'

export const TAX_RATES = [0, 7, 19] as const
export type TaxRate = (typeof TAX_RATES)[number]

export const UNITS = [
  'Stk.', 'Std.', 'Psch.', 'kg', 't', 'm', 'm²', 'm³', 'l', 'km', 'h',
] as const

// ── Line item ────────────────────────────────────────────────

export const OfferItemSchema = z.object({
  position:    z.number().int().min(1),
  description: z.string().min(1, 'Beschreibung ist erforderlich').max(500),
  quantity:    z
    .number({ invalid_type_error: 'Menge muss eine Zahl sein' })
    .positive('Menge muss größer als 0 sein')
    .max(999_999),
  unit:        z.string().max(20).default('Stk.'),
  unitPrice:   z
    .number({ invalid_type_error: 'Preis muss eine Zahl sein' })
    .min(0, 'Preis darf nicht negativ sein')
    .max(99_999_999),
  taxRate:     z.number().min(0).max(100),
  notes:       z.string().max(500).optional().nullable(),
})

export type OfferItemInput = z.infer<typeof OfferItemSchema>

// ── Offer header ─────────────────────────────────────────────

export const OfferCreateSchema = z.object({
  customerId:  z.string().uuid('Bitte Kunde auswählen'),
  title:       z.string().max(200).optional().nullable(),
  introText:   z.string().max(3000).optional().nullable(),
  outroText:   z.string().max(3000).optional().nullable(),
  offerDate:   z.coerce.date({ invalid_type_error: 'Angebotsdatum ungültig' }),
  validUntil:  z.coerce.date().optional().nullable(),
  items:       z
    .array(OfferItemSchema)
    .min(1, 'Mindestens eine Position erforderlich')
    .max(100),
})

export const OfferUpdateSchema = OfferCreateSchema

export type OfferCreateInput = z.infer<typeof OfferCreateSchema>
export type OfferUpdateInput = z.infer<typeof OfferUpdateSchema>

// ── Helpers ──────────────────────────────────────────────────

export function calcItemAmounts(item: {
  quantity: number
  unitPrice: number
  taxRate:  number
}) {
  const net   = Math.round(item.quantity * item.unitPrice * 100) / 100
  const tax   = Math.round(net * item.taxRate / 100 * 100) / 100
  const gross = Math.round((net + tax) * 100) / 100
  return { netAmount: net, taxAmount: tax, grossAmount: gross }
}

export function calcOfferTotals(items: OfferItemInput[]) {
  let totalNet = 0
  let totalTax = 0
  const taxGroups: Record<string, number> = {}

  for (const item of items) {
    const { netAmount, taxAmount } = calcItemAmounts(item)
    totalNet += netAmount
    totalTax += taxAmount
    const key = String(item.taxRate)
    taxGroups[key] = Math.round(((taxGroups[key] ?? 0) + taxAmount) * 100) / 100
  }

  return {
    totalNet:   Math.round(totalNet * 100) / 100,
    totalTax:   Math.round(totalTax * 100) / 100,
    totalGross: Math.round((totalNet + totalTax) * 100) / 100,
    taxGroups,
  }
}
