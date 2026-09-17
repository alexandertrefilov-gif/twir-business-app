import crypto from 'node:crypto'
import path from 'node:path'
import { prisma } from '@/lib/db/prisma'
import { writeAuditLog } from '@/lib/services/audit.service'
import { getOfferPdfData } from '@/lib/services/offer-pdf.service'
import { getOrderPdfData } from '@/lib/services/order-pdf.service'
import { getServiceReportPdfData } from '@/lib/services/service-report-pdf.service'
import { getInvoicePdfData } from '@/lib/services/invoice-pdf.service'
import { renderOfferPdf } from '@/lib/pdf-templates/offer.template'
import { renderOrderPdf } from '@/lib/pdf-templates/order.template'
import { renderServiceReportPdf } from '@/lib/pdf-templates/service-report.template'
import { renderInvoicePdf } from '@/lib/pdf-templates/invoice.template'
import { FULL_ORDER_PDF_OPTIONS } from '@/lib/validators/order-pdf.schema'
import { renderBusinessDocumentDocx } from '@/lib/documents/document-docx'
import { buildArchiveFilename, buildBusinessCaseArchiveDirectory, existingBusinessCaseArchiveDirectory, type BusinessCaseArchiveCategory } from '@/lib/documents/archive-naming'
import { LocalFilesystemArchiveStorage } from '@/lib/documents/archive-storage'
import type { RoleName } from '@/types/enums'
import type { DocumentFormat } from '@prisma/client'

export type ArchivableDocumentKind = 'offer' | 'order' | 'serviceReport' | 'invoice'
export type ArchiveLifecycle = 'DRAFT' | 'FINAL'

type Actor = { userId: string; userEmail: string; role: RoleName }
type ArchiveContext = {
  number: string
  year: number
  customerId: string
  customerNumber: string | null
  customerName: string
  areaName: string | null
  businessCaseId: string
  existingBusinessCaseDirectory: string | null
  category: BusinessCaseArchiveCategory
  documentType: 'OFFER_PDF' | 'ORDER_PDF' | 'SERVICE_REPORT_PDF' | 'INVOICE_PDF'
  links: { offerId?: string; orderId?: string; serviceReportId?: string; invoiceId?: string }
  status: string
  finalizedAt?: Date | null
}

export function offerArchiveLifecycleError(
  status: string,
  lifecycle: ArchiveLifecycle,
): string | null {
  if (status === 'DRAFT' && lifecycle === 'FINAL') {
    return 'Ein Angebotsentwurf darf nicht als FINAL archiviert werden.'
  }
  if (status !== 'DRAFT' && lifecycle === 'DRAFT') {
    return 'Ein bereits freigegebenes Angebot darf nicht mehr als Entwurf archiviert werden.'
  }
  return null
}

async function loadContext(kind: ArchivableDocumentKind, id: string): Promise<ArchiveContext> {
  if (kind === 'offer') {
    const row = await prisma.offer.findUnique({ where: { id }, include: { customer: true, documents: { where: { deletedAt: null }, select: { storagePath: true } } } })
    if (!row) throw new Error('Angebot nicht gefunden.')
    return { number: row.offerNumber, year: row.offerDate.getFullYear(), customerId: row.customerId, customerNumber: row.customer.number, customerName: row.customer.name, areaName: row.areaName ?? row.title,
      businessCaseId: `offer-${row.id}`, existingBusinessCaseDirectory: existingBusinessCaseArchiveDirectory(row.documents.map(document => document.storagePath)), category: '01_Angebot', documentType: 'OFFER_PDF', links: { offerId: id }, status: row.status, finalizedAt: row.sentAt }
  }
  if (kind === 'order') {
    const row = await prisma.order.findUnique({ where: { id }, include: { customer: true, offer: { include: { documents: { where: { deletedAt: null }, select: { storagePath: true } } } } } })
    if (!row) throw new Error('Auftrag nicht gefunden.')
    return { number: row.orderNumber, year: (row.offer?.offerDate ?? row.orderDate).getFullYear(), customerId: row.customerId, customerNumber: row.customer.number, customerName: row.customer.name, areaName: row.offer?.areaName ?? row.offer?.title ?? row.title,
      businessCaseId: row.offer ? `offer-${row.offer.id}` : `order-${row.id}`, existingBusinessCaseDirectory: existingBusinessCaseArchiveDirectory(row.offer?.documents.map(document => document.storagePath) ?? []), category: '03_Auftrag', documentType: 'ORDER_PDF', links: { orderId: id }, status: row.status, finalizedAt: row.completedAt }
  }
  if (kind === 'serviceReport') {
    const row = await prisma.serviceReport.findUnique({ where: { id }, include: { order: { include: { customer: true, offer: { include: { documents: { where: { deletedAt: null }, select: { storagePath: true } } } } } } } })
    if (!row) throw new Error('Leistungsnachweis nicht gefunden.')
    return { number: row.reportNumber, year: (row.order.offer?.offerDate ?? row.order.orderDate).getFullYear(), customerId: row.order.customerId, customerNumber: row.order.customer.number, customerName: row.order.customer.name, areaName: row.order.offer?.areaName ?? row.order.offer?.title ?? row.order.title,
      businessCaseId: row.order.offer ? `offer-${row.order.offer.id}` : `order-${row.order.id}`, existingBusinessCaseDirectory: existingBusinessCaseArchiveDirectory(row.order.offer?.documents.map(document => document.storagePath) ?? []), category: '04_Leistung', documentType: 'SERVICE_REPORT_PDF', links: { orderId: row.orderId, serviceReportId: id }, status: row.status, finalizedAt: row.finalizedAt }
  }
  const row = await prisma.invoice.findUnique({ where: { id }, include: { customer: true, order: { include: { offer: { include: { documents: { where: { deletedAt: null }, select: { storagePath: true } } } } } } } })
  if (!row) throw new Error('Rechnung nicht gefunden.')
  return { number: row.invoiceNumber ?? `Rechnungsentwurf-${id.slice(0, 8)}`, year: (row.order?.offer?.offerDate ?? row.order?.orderDate ?? row.invoiceDate).getFullYear(), customerId: row.customerId, customerNumber: row.customer.number, customerName: row.customer.name, areaName: row.order?.offer?.areaName ?? row.order?.offer?.title ?? row.order?.title ?? null,
    businessCaseId: row.order?.offer ? `offer-${row.order.offer.id}` : row.order ? `order-${row.order.id}` : `invoice-${row.id}`, existingBusinessCaseDirectory: existingBusinessCaseArchiveDirectory(row.order?.offer?.documents.map(document => document.storagePath) ?? []), category: '05_Rechnung', documentType: 'INVOICE_PDF', links: { orderId: row.orderId ?? undefined, invoiceId: id }, status: row.status, finalizedAt: row.finalizedAt }
}

async function render(kind: ArchivableDocumentKind, id: string, actor: Actor) {
  if (kind === 'offer') { const data = await getOfferPdfData(id); return { data, pdf: await renderOfferPdf(data), label: 'Angebot' } }
  if (kind === 'order') { const data = await getOrderPdfData(id, FULL_ORDER_PDF_OPTIONS); return { data, pdf: await renderOrderPdf(data), label: 'Auftrag' } }
  if (kind === 'serviceReport') { const data = await getServiceReportPdfData(id, actor.userId, actor.role); return { data, pdf: await renderServiceReportPdf(data), label: 'Leistungsnachweis' } }
  const data = await getInvoicePdfData(id); return { data, pdf: await renderInvoicePdf(data), label: 'Rechnung' }
}

export async function archiveBusinessDocument(kind: ArchivableDocumentKind, id: string, lifecycle: ArchiveLifecycle, actor: Actor, retried = false) {
  const settings = await prisma.companySetting.findFirst()
  if (!settings?.documentArchiveEnabled) return { status: 'disabled' as const }
  if (!settings.documentArchivePath) {
    const error = 'Dokumentenarchiv ist aktiv, aber kein Basispfad konfiguriert.'
    await writeAuditLog({ userId: actor.userId, userEmail: actor.userEmail, action: 'ARCHIVE_FAILED', entityType: kind, entityId: id, metadata: { lifecycle, error } })
    return { status: 'failed' as const, error }
  }
  const context = await loadContext(kind, id)
  const lifecycleError = kind === 'offer'
    ? offerArchiveLifecycleError(context.status, lifecycle)
    : null
  if (lifecycleError) {
    await writeAuditLog({
      userId: actor.userId,
      userEmail: actor.userEmail,
      action: 'ARCHIVE_FAILED',
      entityType: kind,
      entityId: id,
      metadata: { lifecycle, status: context.status, error: lifecycleError },
    })
    return { status: 'failed' as const, error: lifecycleError }
  }
  const directory = context.existingBusinessCaseDirectory
    ? path.join(context.existingBusinessCaseDirectory, context.category)
    : buildBusinessCaseArchiveDirectory(context)
  const storage = new LocalFilesystemArchiveStorage(settings.documentArchivePath)
  const formats: DocumentFormat[] = ['PDF', 'DOCX', ...(settings.documentArchiveJsonEnabled ? ['JSON' as const] : [])]
  const pending = (await Promise.all(formats.map(async format => {
    const existing = await prisma.document.findFirst({ where: { deletedAt: null, type: context.documentType, format, lifecycle, ...context.links }, orderBy: { createdAt: 'desc' } })
    if (lifecycle === 'FINAL' && existing?.archiveStatus === 'ARCHIVED') return null
    const filename = buildArchiveFilename(context.number, lifecycle, format === 'JSON' ? 'meta.json' : format.toLowerCase())
    const common = { archiveStatus: 'PENDING' as const, archiveError: null, lastArchiveAttemptAt: new Date(), filename, originalName: filename,
      mimeType: format === 'PDF' ? 'application/pdf' : format === 'DOCX' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/json', storagePath: path.join(directory, filename) }
    if (existing) return prisma.document.update({
      where: { id: existing.id },
      data: {
        ...common,
        // Existing archives remain in place until a separately approved migration.
        storagePath: path.join(path.dirname(existing.storagePath), filename),
        archiveAttempts: { increment: 1 },
      },
    })
    return prisma.document.create({ data: { type: context.documentType, format, lifecycle, ...common, archiveAttempts: 1,
      customerId: context.customerId, ...context.links, fileSize: 0, version: 1, isArchived: lifecycle === 'FINAL', uploadedById: actor.userId } })
  }))).filter((document): document is NonNullable<typeof document> => document !== null)
  if (pending.length === 0) return { status: 'archived' as const, documents: [] }
  try {
    const rendered = await render(kind, id, actor)
    const json = Buffer.from(JSON.stringify({ documentType: kind, number: context.number, customerNumber: context.customerNumber, customerName: context.customerName, status: context.status, lifecycle, createdAt: new Date().toISOString(), finalizedAt: context.finalizedAt?.toISOString() ?? null }, null, 2))
    const docx = await renderBusinessDocumentDocx(rendered.data as unknown as Record<string, unknown>, rendered.label)
    const buffers: Record<string, Buffer> = { PDF: Buffer.from(rendered.pdf), DOCX: docx, JSON: json }
    for (const doc of pending) {
      const contents = buffers[doc.format]
      await storage.writeFile(doc.storagePath, contents, lifecycle === 'FINAL' ? 'exclusive' : 'replace')
      await prisma.document.update({ where: { id: doc.id }, data: { archiveStatus: 'ARCHIVED', archiveError: null, archivedAt: new Date(), fileSize: contents.length, checksum: crypto.createHash('sha256').update(contents).digest('hex') } })
    }
    await writeAuditLog({ userId: actor.userId, userEmail: actor.userEmail, action: retried ? 'ARCHIVE_RETRIED' : 'ARCHIVE_SUCCEEDED', entityType: kind, entityId: id, metadata: { number: context.number, lifecycle, formats } })
    return { status: 'archived' as const, documents: pending.map(doc => doc.id) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Archivierungsfehler'
    await prisma.document.updateMany({ where: { id: { in: pending.map(doc => doc.id) } }, data: { archiveStatus: 'FAILED', archiveError: message.slice(0, 1000) } })
    await writeAuditLog({ userId: actor.userId, userEmail: actor.userEmail, action: 'ARCHIVE_FAILED', entityType: kind, entityId: id, metadata: { number: context.number, lifecycle, error: message } })
    return { status: 'failed' as const, error: message }
  }
}
