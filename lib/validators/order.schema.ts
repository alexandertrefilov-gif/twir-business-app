// lib/validators/order.schema.ts
// Auftrags-Validierung.
// Positionen teilen dieselbe Struktur wie Angebotspositionen →
// calcItemAmounts / calcOfferTotals aus offer.schema.ts wiederverwenden.

import { z } from 'zod'
import {
  canonicalizeOfferTextValue,
  isValidOfferTextValue,
} from '@/lib/offers/rich-text'

// ── Re-export shared calc helpers ────────────────────────────
export {
  calcItemAmounts,
  calcOfferTotals as calcOrderTotals,
} from '@/lib/validators/offer.schema'

// ── Line items (identical structure to OfferItem) ─────────────

export const OrderItemSchema = z.object({
  position:    z.number().int().min(1),
  description: z.string().min(1, 'Beschreibung ist erforderlich').max(500),
  quantity:    z.number().positive('Menge muss größer als 0 sein').max(999_999),
  unit:        z.string().max(20).default('Stk.'),
  unitPrice:   z.number().min(0).max(99_999_999),
  taxRate:     z.number().min(0).max(100),
  notes:       z.string().max(500).optional().nullable(),
})

export type OrderItemInput = z.infer<typeof OrderItemSchema>

// ── Order header ──────────────────────────────────────────────

export const OrderCreateSchema = z.object({
  customerId:  z.string().uuid('Bitte Kunde auswählen'),
  title:       z.string().min(1, 'Bezeichnung ist erforderlich').max(200),
  description: z.preprocess(
    (value) => typeof value === 'string' ? canonicalizeOfferTextValue(value) : value,
    z.string().max(500_000).refine(isValidOfferTextValue, 'Textformat ist ungültig'),
  ).optional().nullable(),
  orderDate:   z.coerce.date(),
  startDate:   z.coerce.date().optional().nullable(),
  endDate:     z.coerce.date().optional().nullable(),
  items:       z.array(OrderItemSchema).max(100).default([]),
})

export const OrderUpdateSchema = OrderCreateSchema

export type OrderCreateInput = z.infer<typeof OrderCreateSchema>
export type OrderUpdateInput = z.infer<typeof OrderUpdateSchema>
