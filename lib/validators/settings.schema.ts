// lib/validators/settings.schema.ts

import { z } from 'zod'

// IBAN basic format check (stripped of spaces)
const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/

export const SettingsUpdateSchema = z.object({
  // Firmendaten — Pflicht für Rechnungen §14 UStG
  companyName:    z.string().min(1, 'Firmenname ist erforderlich').max(200),
  legalForm:      z.string().max(50).optional().nullable(),
  businessActivity: z.string().max(300).optional().nullable(),

  // Adresse
  street:         z.string().max(200).optional().nullable(),
  houseNumber:    z.string().max(20).optional().nullable(),
  postalCode:     z.string().max(10).optional().nullable(),
  city:           z.string().max(100).optional().nullable(),
  country:        z.string().length(2).default('DE'),

  // Steuer — Pflicht auf Rechnungen
  vatId:          z
    .string().max(20)
    .regex(/^(DE\d{9}|[A-Z]{2}.+)?$/, 'USt-ID Format ungültig (z.B. DE123456789)')
    .optional().nullable().transform((v) => v || null),
  taxNumber:      z.string().max(30).optional().nullable(),
  taxOffice:      z.string().max(100).optional().nullable(),

  // Bankdaten
  bankName:       z.string().max(100).optional().nullable(),
  iban:           z
    .string().max(40)
    .transform((v) => v?.replace(/\s/g, '').toUpperCase() || null)
    .refine(
      (v) => !v || ibanRegex.test(v),
      { message: 'IBAN hat ungültiges Format' },
    )
    .optional().nullable(),
  bic:            z.string().max(11).optional().nullable(),

  // Kontakt
  email:          z.string().email('E-Mail ungültig').optional().nullable().transform((v) => v || null),
  phone:          z.string().max(50).optional().nullable(),
  fax:            z.string().max(50).optional().nullable(),
  website:        z.string().max(200).optional().nullable(),

  // Handelsregister
  registerCourt:   z.string().max(100).optional().nullable(),
  registerNumber:  z.string().max(50).optional().nullable(),
  managingDirector:z.string().max(200).optional().nullable(),
  supplierNumber:  z.string().max(50).optional().nullable(),

  // Nummernkreis-Präfixe
  invoicePrefix:        z.string().min(1).max(10).default('RE'),
  offerPrefix:          z.string().min(1).max(10).default('AN'),
  orderPrefix:          z.string().min(1).max(10).default('AU'),
  serviceReportPrefix:  z.string().min(1).max(10).default('LN'),

  // Rechnungs-Defaults
  defaultPaymentTermDays: z.coerce.number().int().min(0).max(365).default(14),
  defaultTaxRate:         z.coerce.number().min(0).max(100).default(19),

  // Standard-Texte für PDFs
  defaultInvoiceIntro:  z.string().max(3000).optional().nullable(),
  defaultInvoiceOutro:  z.string().max(3000).optional().nullable(),
  defaultOfferIntro:    z.string().max(3000).optional().nullable(),
  defaultOfferOutro:    z.string().max(3000).optional().nullable(),

  // Logo-Darstellung in PDF-Dokumenten
  logoScale: z.coerce.number().int().min(50).max(400).default(140),

  documentArchiveEnabled: z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()).default(false),
  documentArchivePath: z.string().trim().max(1000).optional().nullable().transform((value) => value || null),
  documentArchiveJsonEnabled: z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()).default(false),
})

export type SettingsUpdateInput = z.infer<typeof SettingsUpdateSchema>
