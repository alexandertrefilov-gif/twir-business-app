import { z } from 'zod'

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform(value => value || null)
const optionalEmail = z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().email('E-Mail ist ungültig').max(200).optional().nullable(),
)

export const AddressDataSchema = z.object({
  companyName: z.string().trim().min(1, 'Firma / Name ist erforderlich').max(300),
  additional: optionalText(200),
  street: z.string().trim().min(1, 'Straße ist erforderlich').max(200),
  houseNumber: optionalText(20),
  postalCode: z.string().trim().regex(/^\d{4,10}$/, 'PLZ ist ungültig'),
  city: z.string().trim().min(1, 'Ort ist erforderlich').max(100),
  country: z.string().trim().length(2, 'Land ist ungültig').transform(value => value.toUpperCase()),
  contactName: optionalText(200),
  email: optionalEmail,
  phone: optionalText(50),
})

export const CustomerAddressInputSchema = AddressDataSchema.extend({
  label: z.string().trim().min(1, 'Bezeichnung ist erforderlich').max(120),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
})

export const AddressSearchSchema = z.string().trim().min(2, 'Mindestens zwei Zeichen eingeben').max(100)
export const CustomerAddressTypeSchema = z.enum(['BILLING', 'SHIPPING'])

export type AddressDataInput = z.infer<typeof AddressDataSchema>
export type CustomerAddressInput = z.infer<typeof CustomerAddressInputSchema>
export type CustomerAddressTypeValue = z.infer<typeof CustomerAddressTypeSchema>
