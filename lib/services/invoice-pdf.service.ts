import type { InvoicePdfData } from '@/lib/pdf-templates/invoice.template'
import { getInvoiceById } from '@/lib/services/invoice-query.service'
import { getCompanySnapshot } from '@/lib/services/settings.service'
import { loadCompanyLogoForPdf } from '@/lib/services/company-logo-rendering.service'
import { prisma } from '@/lib/db/prisma'
import { BusinessRuleError, NotFoundError } from '@/lib/auth/permissions'
import { resolveInvoiceRecipientSnapshot } from '@/lib/services/invoice.service'
import { calculateInvoiceForPersistence } from '@/lib/services/invoice-calculation.service'
import type { InvoiceDraftInput } from '@/lib/validators/invoice.schema'
import { formatCalendarDate } from '@/lib/utils/berlin-date'

type Snapshot = Record<string, unknown>
const text = (source: Snapshot, key: string) => typeof source[key] === 'string' ? source[key] as string : null
const number = (source: Snapshot, key: string) => typeof source[key] === 'number' ? source[key] as number : undefined

export async function getInvoicePdfData(invoiceId: string): Promise<InvoicePdfData> {
  const invoice = await getInvoiceById(invoiceId)
  const liveCompany = await getCompanySnapshot()
  const storedCompany = (invoice.companySnapshot as Snapshot | null) ?? null
  const storedCustomer = (invoice.customerSnapshot as Snapshot | null) ?? null
  const company = storedCompany ? {
    companyName: text(storedCompany, 'companyName') ?? liveCompany.companyName,
    legalForm: text(storedCompany, 'legalForm'), street: text(storedCompany, 'street'), houseNumber: text(storedCompany, 'houseNumber'),
    postalCode: text(storedCompany, 'postalCode'), city: text(storedCompany, 'city'), vatId: text(storedCompany, 'vatId'),
    taxNumber: text(storedCompany, 'taxNumber'), bankName: text(storedCompany, 'bankName'), iban: text(storedCompany, 'iban'),
    bic: text(storedCompany, 'bic'), email: text(storedCompany, 'email'), phone: text(storedCompany, 'phone'),
  } : liveCompany
  const customer = storedCustomer ? {
    name: text(storedCustomer, 'name') ?? invoice.customer.name,
    additional: text(storedCustomer, 'additional'),
    contactName: text(storedCustomer, 'contactName'),
    street: text(storedCustomer, 'street'), houseNumber: text(storedCustomer, 'houseNumber'), postalCode: text(storedCustomer, 'postalCode'),
    city: text(storedCustomer, 'city'), country: text(storedCustomer, 'country'), vatId: text(storedCustomer, 'vatId'),
  } : invoice.customer
  const logoStorageKey = storedCompany ? text(storedCompany, 'logoStorageKey') : liveCompany.logoStorageKey
  const logo = await loadCompanyLogoForPdf(logoStorageKey)
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: formatCalendarDate(invoice.invoiceDate), dueDate: invoice.dueDate ? formatCalendarDate(invoice.dueDate) : null,
    deliveryDate: invoice.deliveryDate ? formatCalendarDate(invoice.deliveryDate) : null, orderNumber: invoice.order?.orderNumber,
    introText: invoice.introText, outroText: invoice.outroText, company, customer,
    logoDataUri: logo?.dataUri, logoScale: storedCompany ? number(storedCompany, 'logoScale') : liveCompany.logoScale,
    logoSourceWidth: logo?.width ?? (storedCompany ? number(storedCompany, 'logoWidth') : liveCompany.logoWidth ?? undefined),
    logoSourceHeight: logo?.height ?? (storedCompany ? number(storedCompany, 'logoHeight') : liveCompany.logoHeight ?? undefined),
    items: invoice.items.map((item) => ({ position: item.position, description: item.description, quantity: item.quantity.toNumber(), unit: item.unit,
      unitPrice: item.unitPrice.toNumber(), discountRate: item.discountRate ? item.discountRate.toNumber() : 0, taxRate: item.taxRate.toNumber(), netAmount: item.netAmount.toNumber(), grossAmount: item.grossAmount.toNumber() })),
    totalNet: invoice.totalNet.toNumber(), totalTax: invoice.totalTax.toNumber(), totalGross: invoice.totalGross.toNumber(),
  }
}

export async function getInvoiceDraftPdfData(draft: InvoiceDraftInput, invoiceId?: string): Promise<InvoicePdfData> {
  if (invoiceId) {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } })
    if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')
    if (invoice.status !== 'DRAFT') throw new BusinessRuleError('Nur Rechnungsentwürfe können als bearbeitete Vorschau gerendert werden.')
  }
  const customer = await prisma.customer.findFirst({ where: { id: draft.customerId, deletedAt: null } })
  if (!customer) throw new NotFoundError('Kunde nicht gefunden')
  let orderNumber: string | null = null
  if (draft.orderId) {
    const order = await prisma.order.findFirst({ where: { id: draft.orderId, deletedAt: null }, select: { customerId: true, orderNumber: true } })
    if (!order) throw new NotFoundError('Auftrag nicht gefunden')
    if (order.customerId !== draft.customerId) throw new BusinessRuleError('Auftrag und Kunde stimmen nicht überein.')
    orderNumber = order.orderNumber
  }

  const company = await getCompanySnapshot()
  const [recipient, logo] = await Promise.all([
    resolveInvoiceRecipientSnapshot(customer, {
      invoiceRecipientSource: draft.invoiceRecipientSource,
      billingAddressId: draft.billingAddressId ?? undefined,
      recipientName: draft.recipientName ?? undefined, recipientAdditional: draft.recipientAdditional ?? undefined,
      recipientContactName: draft.recipientContactName ?? undefined, recipientEmail: draft.recipientEmail ?? undefined,
      recipientStreet: draft.recipientStreet ?? undefined, recipientHouseNumber: draft.recipientHouseNumber ?? undefined,
      recipientPostalCode: draft.recipientPostalCode ?? undefined, recipientCity: draft.recipientCity ?? undefined,
      recipientCountry: draft.recipientCountry ?? undefined,
    }),
    loadCompanyLogoForPdf(company.logoStorageKey),
  ])
  // P4-A: dieselbe Rechenquelle wie Anlegen/Bearbeiten (Dezimalarithmetik); Zahlen nur für die Darstellung.
  const calc = calculateInvoiceForPersistence(draft.items.map(item => ({
    quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, discountRate: item.discountRate,
  })))

  return {
    invoiceNumber: null,
    invoiceDate: formatCalendarDate(draft.invoiceDate),
    dueDate: draft.dueDate ? formatCalendarDate(draft.dueDate) : null,
    deliveryDate: draft.deliveryDate ? formatCalendarDate(draft.deliveryDate) : null,
    orderNumber,
    introText: draft.introText, outroText: draft.outroText,
    company,
    customer: recipient,
    logoDataUri: logo?.dataUri, logoScale: company.logoScale,
    logoSourceWidth: logo?.width ?? company.logoWidth ?? undefined,
    logoSourceHeight: logo?.height ?? company.logoHeight ?? undefined,
    items: draft.items.map((item, index) => ({
      position: item.position, description: item.description, quantity: item.quantity, unit: item.unit,
      unitPrice: item.unitPrice, discountRate: Number(item.discountRate ?? 0), taxRate: item.taxRate,
      netAmount: Number(calc.lines[index].netAmount), grossAmount: Number(calc.lines[index].grossAmount),
    })),
    totalNet: Number(calc.totalNet), totalTax: Number(calc.totalTax), totalGross: Number(calc.totalGross),
  }
}
