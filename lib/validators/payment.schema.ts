// lib/validators/payment.schema.ts

import { z } from 'zod'
import { decimalInputSchema } from '@/lib/billing/decimal-input'
import { MoneyDecimal } from '@/lib/billing/money'
import { PAYMENT_AMOUNT_SPEC } from '@/lib/billing/payment-math'

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Überweisung' },
  { value: 'cash',          label: 'Barzahlung'  },
  { value: 'sepa_direct',   label: 'SEPA-Lastschrift' },
  { value: 'credit_card',   label: 'Kreditkarte' },
  { value: 'other',         label: 'Sonstige'    },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

export const PaymentCreateSchema = z.object({
  invoiceId:   z.string().uuid('Ungültige Rechnungs-ID'),
  // REQ-029 P4-D: Dezimal-String (alte Aufrufer dürfen eine Zahl senden); höchstens 2 Nachkommastellen,
  // keine automatische Rundung. Ausgabe: kanonischer Betrag mit genau zwei Nachkommastellen ("12.50").
  amount:      decimalInputSchema(PAYMENT_AMOUNT_SPEC).transform((value) => new MoneyDecimal(value).toFixed(2)),
  paymentDate: z.coerce.date({ invalid_type_error: 'Datum ungültig' }),
  method:      z.string().optional().nullable(),
  reference:   z.string().max(200).optional().nullable(),
  notes:       z.string().max(1000).optional().nullable(),
})

export type PaymentCreateInput = z.infer<typeof PaymentCreateSchema>
