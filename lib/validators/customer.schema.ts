// lib/validators/customer.schema.ts
import { z } from 'zod'

const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/

export const CustomerCreateSchema = z.object({
  // Stammdaten
  name:        z.string().min(1, 'Kurzname ist erforderlich').max(200),
  legalName:   z.string().max(300).optional().nullable(),
  legalForm:   z.string().max(50).optional().nullable(),
  contactSalutation: z.string().max(30).optional().nullable(),
  contactFirstName:  z.string().max(100).optional().nullable(),
  contactLastName:   z.string().max(100).optional().nullable(),
  contactDepartment: z.string().max(150).optional().nullable(),

  // Steuer
  vatId:       z
    .string()
    .max(20)
    .regex(/^(DE\d{9}|[A-Z]{2}.+)?$/, 'USt-ID Format ungültig (z.B. DE123456789)')
    .optional()
    .nullable()
    .transform((v) => v || null),
  taxNumber:   z.string().max(30).optional().nullable(),

  // Adresse
  street:      z.string().max(200).optional().nullable(),
  houseNumber: z.string().max(20).optional().nullable(),
  postalCode:  z
    .string()
    .max(10)
    .regex(/^\d{4,10}$/, 'PLZ ungültig')
    .optional()
    .nullable()
    .transform((v) => v || null),
  city:        z.string().max(100).optional().nullable(),
  country:     z.string().length(2).default('DE'),

  // Kontakt
  email:       z.string().email('E-Mail ungültig').max(200).optional().nullable().transform((v) => v || null),
  phone:       z.string().max(50).optional().nullable(),
  fax:         z.string().max(50).optional().nullable(),
  website:     z
    .string()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => v || null),

  notes:       z.string().max(2000).optional().nullable(),
}).superRefine((data, ctx) => {
  const hasContact = Boolean(
    data.contactSalutation ||
    data.contactFirstName ||
    data.contactLastName ||
    data.contactDepartment,
  )
  if (hasContact && !data.contactFirstName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contactFirstName'],
      message: 'Vorname des Ansprechpartners ist erforderlich',
    })
  }
  if (hasContact && !data.contactLastName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contactLastName'],
      message: 'Nachname des Ansprechpartners ist erforderlich',
    })
  }
})

export const CustomerUpdateSchema = CustomerCreateSchema

export type CustomerCreateInput = z.infer<typeof CustomerCreateSchema>
export type CustomerUpdateInput = z.infer<typeof CustomerUpdateSchema>
