// lib/validators/payment.schema.ts

import { z } from 'zod'

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
  amount:      z
    .number({ invalid_type_error: 'Betrag muss eine Zahl sein' })
    .positive('Betrag muss größer als 0 sein')
    .max(99_999_999, 'Betrag zu hoch'),
  paymentDate: z.coerce.date({ invalid_type_error: 'Datum ungültig' }),
  method:      z.string().optional().nullable(),
  reference:   z.string().max(200).optional().nullable(),
  notes:       z.string().max(1000).optional().nullable(),
})

export type PaymentCreateInput = z.infer<typeof PaymentCreateSchema>
