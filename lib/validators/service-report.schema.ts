// lib/validators/service-report.schema.ts

import { z } from 'zod'

export const SERVICE_ITEM_TYPES = ['hours', 'material', 'flat'] as const
export type ServiceItemType = (typeof SERVICE_ITEM_TYPES)[number]

export const SERVICE_ITEM_TYPE_LABELS: Record<ServiceItemType, string> = {
  hours:    'Arbeitsstunden',
  material: 'Material',
  flat:     'Pauschalposition',
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
  notes:       z.string().max(500).optional().nullable(),
})

export type ServiceReportItemInput = z.infer<typeof ServiceReportItemSchema>

// ── Report header ─────────────────────────────────────────────

export const ServiceReportCreateSchema = z.object({
  orderId:     z.string().uuid('Bitte Auftrag auswählen'),
  title:       z.string().max(200).optional().nullable(),
  description: z.string().max(3000).optional().nullable(),
  reportDate:  z.coerce.date({ invalid_type_error: 'Datum ungültig' }),
  items:       z.array(ServiceReportItemSchema).min(1, 'Mindestens eine Position erforderlich').max(100),
})

export const ServiceReportUpdateSchema = ServiceReportCreateSchema

export type ServiceReportCreateInput = z.infer<typeof ServiceReportCreateSchema>
export type ServiceReportUpdateInput = z.infer<typeof ServiceReportUpdateSchema>

// ── Helpers ───────────────────────────────────────────────────

export function calcReportItemNet(item: { quantity: number; unitPrice: number }): number {
  return Math.round(item.quantity * item.unitPrice * 100) / 100
}

export function calcReportTotal(items: ServiceReportItemInput[]): number {
  return Math.round(
    items.reduce((s, i) => s + calcReportItemNet(i), 0) * 100,
  ) / 100
}
