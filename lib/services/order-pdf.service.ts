import { format } from 'date-fns'
import type { OrderPdfData } from '@/lib/pdf-templates/order.template'
import { getOrderById } from '@/lib/services/order.service'
import { getCompanySnapshot } from '@/lib/services/settings.service'
import { loadCompanyLogoForPdf } from '@/lib/services/company-logo-rendering.service'
import type { OrderPdfOptions } from '@/lib/validators/order-pdf.schema'
import { orderDescriptionWithOfferFallback } from '@/lib/offers/rich-text'

type CustomerSnapshot = {
  name?: string
  street?: string | null
  houseNumber?: string | null
  postalCode?: string | null
  city?: string | null
}

export async function getOrderPdfData(
  orderId: string,
  options: OrderPdfOptions,
): Promise<OrderPdfData> {
  const [order, liveCompany] = await Promise.all([getOrderById(orderId), getCompanySnapshot()])
  const company = (order.companySnapshot as typeof liveCompany | null) ?? liveCompany
  const logo = await loadCompanyLogoForPdf(company.logoStorageKey ?? company.logoPath)
  const snapshot = order.customerSnapshot as CustomerSnapshot | null
  const customer = snapshot ?? order.customer
  const contact = order.customer.contacts[0]

  return {
    options,
    ...(options.showOrderNumber && { orderNumber: order.orderNumber }),
    ...(options.showOrderDate && { orderDate: format(order.orderDate, 'dd.MM.yyyy') }),
    ...(options.showTitle && { title: order.title }),
    ...(options.showDescription && {
      description: orderDescriptionWithOfferFallback(
        order.description,
        order.offer,
        order.items.length > 0,
      ),
    }),
    ...(options.showServicePeriod && {
      startDate: order.startDate ? format(order.startDate, 'dd.MM.yyyy') : null,
      endDate: order.endDate ? format(order.endDate, 'dd.MM.yyyy') : null,
    }),
    ...(options.showOfferReference && { offerNumber: order.offer?.offerNumber }),
    logoDataUri: logo?.dataUri,
    logoScale: company.logoScale,
    logoSourceWidth: logo?.width ?? company.logoWidth ?? undefined,
    logoSourceHeight: logo?.height ?? company.logoHeight ?? undefined,
    company,
    ...(options.showCustomer && {
      customer: {
        name: customer.name ?? order.customer.name,
        street: customer.street,
        houseNumber: customer.houseNumber,
        postalCode: customer.postalCode,
        city: customer.city,
        ...(options.showContact && contact && {
          contact: [contact.salutation, contact.firstName, contact.lastName].filter(Boolean).join(' '),
          contactPosition: contact.position,
        }),
      },
    }),
    items: options.showItems ? order.items.map((item) => ({
      position: item.position,
      description: item.description,
      ...(options.showQuantities && { quantity: item.quantity.toNumber() }),
      ...(options.showUnits && { unit: item.unit }),
      ...(options.showUnitPrices && { unitPrice: item.unitPrice.toNumber() }),
      ...(options.showTotalPrices && { netAmount: item.netAmount.toNumber() }),
      ...(options.showTax && { taxRate: item.taxRate.toNumber() }),
      ...(options.showInternalNotes && { notes: item.notes }),
    })) : [],
    ...(options.showSummaries && {
      totalNet: order.totalNet.toNumber(),
      ...(options.showTax && { totalTax: order.totalTax.toNumber() }),
      totalGross: order.totalGross.toNumber(),
    }),
  }
}
