import { format } from 'date-fns'
import type { RoleName } from '@/types/enums'
import type { ServiceReportPdfData } from '@/lib/pdf-templates/service-report.template'
import { getServiceReportById } from '@/lib/services/service-report.service'
import { getCompanySnapshot } from '@/lib/services/settings.service'
import { loadCompanyLogoForPdf } from '@/lib/services/company-logo-rendering.service'
import type { ServiceItemType } from '@/lib/validators/service-report.schema'
import { calcReportItemNet, calcReportTotal, type ServiceReportCreateInput } from '@/lib/validators/service-report.schema'
import { prisma } from '@/lib/db/prisma'
import { NotFoundError } from '@/lib/auth/permissions'

type CustomerSnapshot = {
  name?: string
  street?: string | null
  houseNumber?: string | null
  postalCode?: string | null
  city?: string | null
}

export async function getServiceReportPdfData(
  reportId: string,
  userId: string,
  role: RoleName,
): Promise<ServiceReportPdfData> {
  const [report, liveCompany] = await Promise.all([
    getServiceReportById(reportId, userId, role),
    getCompanySnapshot(),
  ])
  const company = (report.companySnapshot as typeof liveCompany | null) ?? liveCompany
  const logo = await loadCompanyLogoForPdf(company.logoStorageKey ?? company.logoPath)
  const snapshot = (report.customerSnapshot ?? report.order.customerSnapshot) as CustomerSnapshot | null
  const customer = snapshot ?? report.order.customer
  const items = report.items.map((item) => ({
    position: item.position,
    type: item.type as ServiceItemType,
    description: item.description,
    quantity: item.quantity.toNumber(),
    unit: item.unit,
    unitPrice: item.unitPrice.toNumber(),
    netAmount: item.netAmount.toNumber(),
    notes: item.notes,
  }))
  const byType = items.reduce<Record<ServiceItemType, number>>((totals, item) => {
    totals[item.type] = Math.round((totals[item.type] + item.netAmount) * 100) / 100
    return totals
  }, { hours: 0, material: 0, flat: 0 })

  return {
    reportNumber: report.reportNumber,
    reportDate: format(report.reportDate, 'dd.MM.yyyy'),
    title: report.title,
    description: report.description,
    logoDataUri: logo?.dataUri,
    logoScale: company.logoScale,
    logoSourceWidth: logo?.width ?? company.logoWidth ?? undefined,
    logoSourceHeight: logo?.height ?? company.logoHeight ?? undefined,
    company,
    order: { orderNumber: report.order.orderNumber, title: report.order.title, offerNumber: report.order.offer?.offerNumber },
    customer: {
      name: customer.name ?? report.order.customer.name,
      street: customer.street,
      houseNumber: customer.houseNumber,
      postalCode: customer.postalCode,
      city: customer.city,
    },
    preparedBy: `${report.createdBy.firstName} ${report.createdBy.lastName}`,
    items,
    totalNet: report.totalNet.toNumber(),
    byType,
  }
}

export async function getServiceReportDraftPdfData(
  draft: ServiceReportCreateInput,
  userId: string,
  role: RoleName,
  reportId?: string,
): Promise<ServiceReportPdfData> {
  const existing = reportId ? await getServiceReportById(reportId, userId, role) : null
  if (existing && existing.orderId !== draft.orderId) {
    throw new NotFoundError('Leistungsnachweis oder Auftrag nicht gefunden')
  }

  const [order, user, company] = await Promise.all([
    prisma.order.findFirst({
      where: { id: draft.orderId, deletedAt: null },
      include: {
        customer: true,
        offer: { select: { offerNumber: true } },
      },
    }),
    prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { firstName: true, lastName: true },
    }),
    getCompanySnapshot(),
  ])
  if (!order || !user) throw new NotFoundError('Auftrag oder Benutzer nicht gefunden')

  const logo = await loadCompanyLogoForPdf(company.logoPath)
  const snapshot = order.customerSnapshot as CustomerSnapshot | null
  const customer = snapshot ?? order.customer
  const items = draft.items.map((item) => ({
    position: item.position,
    type: item.type,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    netAmount: calcReportItemNet(item),
    notes: item.notes,
  }))
  const byType = items.reduce<Record<ServiceItemType, number>>((totals, item) => {
    totals[item.type] = Math.round((totals[item.type] + item.netAmount) * 100) / 100
    return totals
  }, { hours: 0, material: 0, flat: 0 })

  return {
    reportNumber: existing?.reportNumber ?? 'Vorschau',
    reportDate: format(draft.reportDate, 'dd.MM.yyyy'),
    title: draft.title,
    description: draft.description,
    logoDataUri: logo?.dataUri,
    logoScale: company.logoScale,
    logoSourceWidth: logo?.width ?? company.logoWidth ?? undefined,
    logoSourceHeight: logo?.height ?? company.logoHeight ?? undefined,
    company,
    order: { orderNumber: order.orderNumber, title: order.title, offerNumber: order.offer?.offerNumber },
    customer: {
      name: customer.name ?? order.customer.name,
      street: customer.street,
      houseNumber: customer.houseNumber,
      postalCode: customer.postalCode,
      city: customer.city,
    },
    preparedBy: `${user.firstName} ${user.lastName}`,
    items,
    totalNet: calcReportTotal(draft.items),
    byType,
  }
}
