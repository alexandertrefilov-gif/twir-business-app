import { z } from 'zod'

export const OrderConfirmationSchema = z.object({
  confirmationType: z.enum(['SIGNED_DOCUMENT', 'EMAIL', 'VERBAL', 'CUSTOMER_PURCHASE_ORDER', 'NOT_REQUIRED']),
  confirmedAt: z.preprocess(value => value === '' || value == null ? undefined : value, z.coerce.date().optional()),
  confirmationNote: z.preprocess(value => value === '' || value == null ? undefined : value, z.string().trim().max(1000, 'Die Bemerkung darf maximal 1.000 Zeichen enthalten.').optional()),
})

export type OrderConfirmationInput = z.infer<typeof OrderConfirmationSchema>

export const ServiceReportConfirmationSchema = z.object({
  confirmedAt: z.preprocess(value => value === '' || value == null ? undefined : value, z.coerce.date().optional()),
  confirmationNote: z.preprocess(value => value === '' || value == null ? undefined : value, z.string().trim().max(1000, 'Die Bemerkung darf maximal 1.000 Zeichen enthalten.').optional()),
})
