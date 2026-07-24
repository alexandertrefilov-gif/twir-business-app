// lib/validators/invoice.schema.ts
// Wiederverwendet calcItemAmounts aus offer.schema.ts (Phase 4) — kein Duplikat.

import { z } from 'zod'
export { calcItemAmounts, calcOfferTotals as calcInvoiceTotals } from '@/lib/validators/offer.schema'

export const InvoiceDraftSchema = z.object({
  customerId:          z.string().uuid('Bitte Kunde auswählen'),
  orderId:             z.string().uuid().optional().nullable(),
  invoiceDate:         z.coerce.date({ invalid_type_error: 'Rechnungsdatum ungültig' }),
  dueDate:             z.coerce.date().optional().nullable(),
  deliveryDate:        z.coerce.date().optional().nullable(),
  deliveryPeriodStart: z.coerce.date().optional().nullable(),
  deliveryPeriodEnd:   z.coerce.date().optional().nullable(),
  paymentTermDays:     z.coerce.number().int().min(0).max(365).optional().nullable(),
  introText:           z.string().max(3000).optional().nullable(),
  outroText:           z.string().max(3000).optional().nullable(),
  items: z.array(z.object({
    position:    z.number().int().min(1),
    description: z.string().min(1, 'Beschreibung erforderlich').max(500),
    quantity:    z.number().positive().max(999_999),
    unit:        z.string().max(20).default('Stk.'),
    unitPrice:   z.number().min(0).max(99_999_999),
    taxRate:     z.number().min(0).max(100),
    notes:       z.string().max(500).optional().nullable(),
  })).min(1, 'Mindestens eine Position erforderlich').max(100),
})

export type InvoiceDraftInput = z.infer<typeof InvoiceDraftSchema>
