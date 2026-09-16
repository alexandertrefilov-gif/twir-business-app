import { prisma } from '@/lib/db/prisma'
import { NotFoundError } from '@/lib/auth/permissions'
import { RoleName } from '@/types/enums'

export interface BusinessProcessDocument {
  id: string
  number: string
  status: string
  type?: string
  finalizedAt?: Date | null
  sentAt?: Date | null
  confirmedAt?: Date | null
  confirmationDocuments?: { id: string; originalName: string; mimeType: string }[]
  confirmationType?: string | null
  confirmationNote?: string | null
}

export interface BusinessProcessData {
  project?: { id: string; number: string; name: string } | null
  offer: BusinessProcessDocument | null
  order: BusinessProcessDocument | null
  serviceReports: BusinessProcessDocument[]
  invoices: BusinessProcessDocument[]
  customerPurchaseOrder?: {
    id: string
    orderNumber: string | null
    orderDate: Date | null
    documents: { id: string; originalName: string; mimeType: string }[]
  } | null
}

const orderProcessSelect = {
  id: true,
  orderNumber: true,
  status: true,
  sentAt: true,
  confirmedAt: true,
  confirmationType: true,
  confirmationNote: true,
  project: { select: { id: true, projectNumber: true, name: true } },
  offer: { select: { id: true, offerNumber: true, status: true } },
  serviceReports: {
    orderBy: { reportDate: 'asc' as const },
    select: {
      id: true, reportNumber: true, status: true, finalizedAt: true, sentAt: true, confirmedAt: true,
      documents: {
        where: { deletedAt: null, type: 'SERVICE_REPORT_CONFIRMATION' as const },
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, originalName: true, mimeType: true },
      },
    },
  },
  invoices: {
    orderBy: { invoiceDate: 'asc' as const },
    select: { id: true, invoiceNumber: true, status: true, type: true },
  },
  customerPurchaseOrder: {
    select: {
      id: true, orderNumber: true, orderDate: true,
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' as const }, select: { id: true, originalName: true, mimeType: true } },
    },
  },
  documents: {
    where: { deletedAt: null, type: 'ORDER_CONFIRMATION' as const },
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, originalName: true, mimeType: true },
  },
}

async function processForOrder(orderId: string, userId: string, role: RoleName) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      ...orderProcessSelect,
      serviceReports: {
        ...orderProcessSelect.serviceReports,
        ...(role === RoleName.EMPLOYEE && { where: { createdById: userId } }),
      },
    },
  })
  if (!order) throw new NotFoundError('Geschäftsvorgang nicht gefunden')
  return {
    project: order.project ? { id: order.project.id, number: order.project.projectNumber, name: order.project.name } : null,
    offer: order.offer ? { id: order.offer.id, number: order.offer.offerNumber, status: order.offer.status } : null,
    order: { id: order.id, number: order.orderNumber, status: order.status, sentAt: order.sentAt, confirmedAt: order.confirmedAt, confirmationType: order.confirmationType, confirmationNote: order.confirmationNote, confirmationDocuments: order.documents },
    serviceReports: order.serviceReports.map((report) => ({ id: report.id, number: report.reportNumber, status: report.status, finalizedAt: report.finalizedAt, sentAt: report.sentAt, confirmedAt: report.confirmedAt, confirmationDocuments: report.documents })),
    invoices: order.invoices.map((invoice) => ({ id: invoice.id, number: invoice.invoiceNumber ?? 'Rechnungsentwurf', status: invoice.status, type: invoice.type })),
    customerPurchaseOrder: order.customerPurchaseOrder,
  } satisfies BusinessProcessData
}

export async function getBusinessProcessForOffer(offerId: string, userId: string, role: RoleName) {
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, deletedAt: null },
    select: {
      id: true, offerNumber: true, status: true, project: { select: { id: true, projectNumber: true, name: true } }, order: { select: { id: true } },
      customerPurchaseOrder: {
        select: {
          id: true, orderNumber: true, orderDate: true,
          documents: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, originalName: true, mimeType: true } },
        },
      },
    },
  })
  if (!offer) throw new NotFoundError('Geschäftsvorgang nicht gefunden')
  if (offer.order) {
    try {
      return await processForOrder(offer.order.id, userId, role)
    } catch (error) {
      // Das Angebot bleibt historisch lesbar, auch wenn sein Folgeauftrag
      // nicht mehr als aktiver Geschäftsvorgang verfügbar ist.
      if (!(error instanceof NotFoundError)) throw error
    }
  }
  return {
    project: offer.project ? { id: offer.project.id, number: offer.project.projectNumber, name: offer.project.name } : null,
    offer: { id: offer.id, number: offer.offerNumber, status: offer.status },
    order: null,
    serviceReports: [],
    invoices: [],
    customerPurchaseOrder: offer.customerPurchaseOrder,
  } satisfies BusinessProcessData
}

export async function getBusinessProcessForOrder(orderId: string, userId: string, role: RoleName) {
  return processForOrder(orderId, userId, role)
}

export async function getBusinessProcessForServiceReport(reportId: string, userId: string, role: RoleName) {
  const report = await prisma.serviceReport.findUnique({
    where: { id: reportId },
    select: { id: true, reportNumber: true, orderId: true, status: true, finalizedAt: true, sentAt: true, confirmedAt: true,
      documents: { where: { deletedAt: null, type: 'SERVICE_REPORT_CONFIRMATION' }, select: { id: true, originalName: true, mimeType: true } } },
  })
  if (!report) throw new NotFoundError('Geschäftsvorgang nicht gefunden')
  try {
    return await processForOrder(report.orderId, userId, role)
  } catch (error) {
    // Ein gespeicherter Leistungsnachweis darf durch eine nicht mehr
    // verfügbare historische Auftragsrelation nicht unlesbar werden.
    if (!(error instanceof NotFoundError)) throw error
    return {
      offer: null,
      order: null,
      serviceReports: [{ id: report.id, number: report.reportNumber, status: report.status, finalizedAt: report.finalizedAt, sentAt: report.sentAt, confirmedAt: report.confirmedAt, confirmationDocuments: report.documents }],
      invoices: [],
    } satisfies BusinessProcessData
  }
}

export async function getBusinessProcessForInvoice(
  invoiceId: string,
  userId: string,
  role: RoleName,
  knownInvoice?: { id: string; invoiceNumber: string | null; status: string; type: string; orderId: string | null },
) {
  const invoice = knownInvoice ?? await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, invoiceNumber: true, status: true, type: true, orderId: true },
  })
  if (!invoice) throw new NotFoundError('Geschäftsvorgang nicht gefunden')
  if (invoice.orderId) {
    try {
      return await processForOrder(invoice.orderId, userId, role)
    } catch (error) {
      // Historische Rechnungen müssen auch dann lesbar bleiben, wenn ihr
      // optionaler Auftrag soft gelöscht wurde oder in Legacy-Daten fehlt.
      if (!(error instanceof NotFoundError)) throw error
    }
  }
  return {
    project: null,
    offer: null,
    order: null,
    serviceReports: [],
    invoices: [{ id: invoice.id, number: invoice.invoiceNumber ?? 'Rechnungsentwurf', status: invoice.status, type: invoice.type }],
  } satisfies BusinessProcessData
}
