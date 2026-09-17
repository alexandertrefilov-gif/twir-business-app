import { z } from 'zod'

export const CustomerPurchaseOrderMetadataSchema = z.object({
  orderNumber: z.string().trim().max(100, 'Die Bestellnummer darf höchstens 100 Zeichen enthalten.').optional().transform(value => value || null),
  orderDate: z.union([z.literal(''), z.coerce.date()]).optional().transform(value => value === '' || value === undefined ? null : value),
})
