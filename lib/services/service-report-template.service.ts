import { prisma } from '@/lib/db/prisma'
import { NotFoundError } from '@/lib/auth/permissions'
import type { ServiceItemType } from '@/lib/validators/service-report.schema'
import { decodeOfferText, encodeOfferText, orderDescriptionWithOfferFallback } from '@/lib/offers/rich-text'

export interface ServiceReportTemplateItem {
  position: number
  description: string
  quantity: string
  unit: string
  unitPrice: string
  discountRate: string
  taxRate: string
  notes: string
  type: ServiceItemType
}

export function mergeOfferTextForServiceReport(
  introText?: string | null,
  outroText?: string | null,
  items: ServiceReportTemplateItem[] = [],
): string | undefined {
  const values = [introText, outroText].filter((value): value is string => Boolean(value))
  if (values.length === 0 && items.length === 0) return undefined
  const introSections = introText ? decodeOfferText(introText).sections : []
  const outroSections = outroText ? decodeOfferText(outroText).sections : []
  return encodeOfferText({
    version: 1,
    sections: [...introSections, ...outroSections],
    positionsAfterSectionId: introSections.at(-1)?.id ?? null,
    positionsEnabled: true,
  })
}

export function serviceItemTypeForUnit(unit: string): ServiceItemType {
  const normalized = unit.trim().toLocaleLowerCase('de-DE')
  if (/^(std\.?|h|stunde|stunden)$/.test(normalized)) return 'hours'
  if (/^(psch\.?|pausch\.?|pauschale|m²|m2|m³|m3)$/.test(normalized)) return 'flat'
  return 'material'
}

export function copyOrderItemsToServiceReportTemplate(items: Array<{
  position: number
  description: string
  quantity: { toString(): string }
  unit: string
  unitPrice: { toString(): string }
  taxRate?: { toString(): string }
  notes: string | null
}>): ServiceReportTemplateItem[] {
  return items.map((item) => ({
    position: item.position,
    type: serviceItemTypeForUnit(item.unit),
    description: item.description,
    quantity: item.quantity.toString(),
    unit: item.unit,
    unitPrice: item.unitPrice.toString(),
    discountRate: '0',
    taxRate: item.taxRate?.toString() ?? '19',
    notes: item.notes ?? '',
  }))
}

export async function getServiceReportTemplate(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED'] } },
    select: {
      id: true,
      orderNumber: true,
      title: true,
      description: true,
      startDate: true,
      customer: { select: { name: true } },
      offer: {
        select: {
          offerNumber: true,
          title: true,
          introText: true,
          outroText: true,
        },
      },
      items: {
        orderBy: { position: 'asc' },
        select: { position: true, description: true, quantity: true, unit: true, unitPrice: true, taxRate: true, notes: true },
      },
    },
  })
  if (!order) throw new NotFoundError('Auftrag nicht gefunden oder nicht für Leistungen freigegeben')
  const items = copyOrderItemsToServiceReportTemplate(order.items)
  return {
    orderNumber: order.orderNumber,
    offerNumber: order.offer?.offerNumber,
    customerName: order.customer.name,
    title: order.offer?.title ?? order.title ?? undefined,
    description: orderDescriptionWithOfferFallback(
      order.description,
      order.offer,
      items.length > 0,
    ) ?? undefined,
    reportDate: order.startDate?.toISOString().slice(0, 10),
    items,
  }
}
