// lib/validators/service-report.schema.ts

import { z } from 'zod'
import { canonicalizeOfferTextValue, isValidOfferTextValue } from '@/lib/offers/rich-text'
import { calcItemAmounts } from '@/lib/validators/offer.schema'

export const SERVICE_ITEM_TYPES = ['hours', 'material', 'flat'] as const
export type ServiceItemType = (typeof SERVICE_ITEM_TYPES)[number]

export const SERVICE_ITEM_TYPE_LABELS: Record<ServiceItemType, string> = {
  hours:    'Dienstleistung',
  material: 'Material',
  flat:     'Leistungseinheit',
}

/** Standardeinheiten je Typ */
export const DEFAULT_UNIT: Record<ServiceItemType, string> = {
  hours:    'Std.',
  material: 'Stk.',
  flat:     'Psch.',
}

// ── Item ─────────────────────────────────────────────────────

export const ServiceReportItemSchema = z.object({
  position:    z.number().int().min(1),
  type:        z.enum(SERVICE_ITEM_TYPES),
  description: z.string().min(1, 'Beschreibung ist erforderlich').max(500),
  quantity:    z.number().positive('Menge muss größer als 0 sein').max(999_999),
  unit:        z.string().max(20),
  unitPrice:   z.number().min(0).max(99_999_999),
  discountRate: z.number().min(0, 'Rabatt darf nicht negativ sein').max(100, 'Rabatt darf höchstens 100 % betragen').default(0),
  taxRate:      z.number().min(0).max(100).default(19),
  notes:       z.string().max(500).optional().nullable(),
})

export type ServiceReportItemInput = z.infer<typeof ServiceReportItemSchema>

// ── Report header ─────────────────────────────────────────────

export const ServiceReportCreateSchema = z.object({
  orderId:     z.string().uuid('Bitte Auftrag auswählen'),
  title:       z.string().max(200).optional().nullable(),
  description: z.preprocess(
    (value) => typeof value === 'string' ? canonicalizeOfferTextValue(value) : value,
    z.string().max(500_000).refine(isValidOfferTextValue, 'Textformat ist ungültig'),
  ).optional().nullable(),
  reportDate:  z.coerce.date({ invalid_type_error: 'Datum ungültig' }),
  items:       z.array(ServiceReportItemSchema).max(100),
})

export const ServiceReportUpdateSchema = ServiceReportCreateSchema

export type ServiceReportCreateInput = z.infer<typeof ServiceReportCreateSchema>
export type ServiceReportUpdateInput = z.infer<typeof ServiceReportUpdateSchema>

// ── Helpers ───────────────────────────────────────────────────

export function calcReportItemAmounts(item: {
  quantity: number
  unitPrice: number
  discountRate?: number
  taxRate?: number
}) {
  return calcItemAmounts({ ...item, taxRate: item.taxRate ?? 19 })
}

export function calcReportItemNet(item: { quantity: number; unitPrice: number; discountRate?: number }): number {
  return calcReportItemAmounts(item).netAmount
}

export function calcReportTotal(items: ServiceReportItemInput[]): number {
  return Math.round(
    items.reduce((s, i) => s + calcReportItemNet(i), 0) * 100,
  ) / 100
}

export function calcReportTotals(items: ServiceReportItemInput[]) {
  const amounts = items.map(calcReportItemAmounts)
  const subtotal = Math.round(amounts.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100
  const totalDiscount = Math.round(amounts.reduce((sum, item) => sum + item.discountAmount, 0) * 100) / 100
  const totalNet = Math.round(amounts.reduce((sum, item) => sum + item.netAmount, 0) * 100) / 100
  const totalTax = Math.round(amounts.reduce((sum, item) => sum + item.taxAmount, 0) * 100) / 100
  return { subtotal, totalDiscount, totalNet, totalTax, totalGross: Math.round((totalNet + totalTax) * 100) / 100 }
}
