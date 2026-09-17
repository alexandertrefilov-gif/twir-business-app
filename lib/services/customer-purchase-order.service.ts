import crypto from 'node:crypto'
import path from 'node:path'
import { prisma } from '@/lib/db/prisma'
import { BusinessRuleError, NotFoundError } from '@/lib/auth/permissions'
import { buildBusinessCaseArchiveDirectory, existingBusinessCaseArchiveDirectory } from '@/lib/documents/archive-naming'
import { LocalFilesystemArchiveStorage } from '@/lib/documents/archive-storage'
import { sanitizeFilename, validateUpload, validateUploadSignature } from '@/lib/security/upload-validator'
import { acceptOfferInTransaction } from '@/lib/services/offer.service'
import type { DocumentFormat } from '@prisma/client'

const PURCHASE_ORDER_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'message/rfc822',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
])

export interface PurchaseOrderUpload {
  originalName: string
  mimeType: string
  bytes: Uint8Array
}

function documentFormat(mimeType: string): DocumentFormat {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('wordprocessingml')) return 'DOCX'
  return 'OTHER'
}

const PURCHASE_ORDER_MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.eml': 'message/rfc822',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function purchaseOrderMimeType(file: PurchaseOrderUpload): string {
  const supplied = file.mimeType.split(';')[0].trim().toLowerCase()
  if (supplied && supplied !== 'application/octet-stream') return supplied
  return PURCHASE_ORDER_MIME_BY_EXTENSION[path.extname(file.originalName).toLowerCase()] ?? supplied
}

export async function saveCustomerPurchaseOrder(input: {
  offerId: string
  orderNumber: string | null
  orderDate: Date | null
  file?: PurchaseOrderUpload
  acceptOffer?: boolean
  actor: { userId: string; userEmail: string }
}) {
  const offer = await prisma.offer.findUnique({
    where: { id: input.offerId, deletedAt: null },
    include: { customer: true, customerPurchaseOrder: true, order: { select: { id: true } }, documents: { where: { deletedAt: null }, select: { storagePath: true } } },
  })
  if (!offer) throw new NotFoundError('Angebot nicht gefunden')
  if (!['SENT', 'ACCEPTED', 'CONVERTED_TO_ORDER'].includes(offer.status)) {
    throw new BusinessRuleError('Eine Kundenbestellung kann erst nach Versand des Angebots hinterlegt werden.')
  }
  if (!input.file && !input.orderNumber && !input.orderDate && !input.acceptOffer) return offer.customerPurchaseOrder?.id ?? null

  let stored: { storage: LocalFilesystemArchiveStorage; storagePath: string } | null = null
  let fileData: { originalName: string; mimeType: string; bytes: Uint8Array; storagePath: string; filename: string } | null = null
  if (input.file) {
    // Drag & Drop from Outlook/Finder may omit the browser MIME. In that case
    // the extension only selects the expected type; the signature check below
    // still verifies the actual bytes server-side.
    const mimeType = purchaseOrderMimeType(input.file)
    if (!PURCHASE_ORDER_MIMES.has(mimeType)) throw new BusinessRuleError('Dieser Dateityp ist für Kundenbestellungen nicht erlaubt.')
    const validation = validateUpload({ originalName: input.file.originalName, mimeType, sizeBytes: input.file.bytes.length })
    if (!validation.valid) throw new BusinessRuleError(validation.error ?? 'Ungültige Datei.')
    if (!validateUploadSignature(input.file.bytes, mimeType)) throw new BusinessRuleError('Der Dateiinhalt passt nicht zum angegebenen Dateityp.')
    const settings = await prisma.companySetting.findFirst({ select: { documentArchiveEnabled: true, documentArchivePath: true } })
    const root = settings?.documentArchiveEnabled && settings.documentArchivePath
      ? settings.documentArchivePath
      : process.env.STORAGE_LOCAL_PATH ?? './storage/documents'
    const directory = settings?.documentArchiveEnabled && settings.documentArchivePath
      ? path.join(
          existingBusinessCaseArchiveDirectory(offer.documents.map(document => document.storagePath))
            ?? buildBusinessCaseArchiveDirectory({
              year: offer.offerDate.getFullYear(), customerNumber: offer.customer.number,
              customerName: offer.customer.name, areaName: offer.areaName ?? offer.title,
              businessCaseId: `offer-${offer.id}`, category: '02_Bestellung',
            }).split(path.sep).slice(0, -1).join(path.sep),
          '02_Bestellung',
        )
      : ''
    const safeOriginal = sanitizeFilename(validation.sanitizedName)
    const uniqueName = `${path.basename(safeOriginal, path.extname(safeOriginal))}_${crypto.randomUUID().slice(0, 8)}${path.extname(safeOriginal)}`
    const storagePath = path.join(directory, uniqueName)
    const storage = new LocalFilesystemArchiveStorage(root)
    await storage.writeFile(storagePath, input.file.bytes, 'exclusive')
    stored = { storage, storagePath }
    fileData = { originalName: safeOriginal, mimeType, bytes: input.file.bytes, storagePath, filename: uniqueName }
  }

  try {
    return await prisma.$transaction(async tx => {
      if (input.acceptOffer) {
        await acceptOfferInTransaction(tx, offer.id, input.actor.userId, input.actor.userEmail)
      }
      if (!input.file && !input.orderNumber && !input.orderDate) return offer.customerPurchaseOrder?.id ?? null

      const purchaseOrder = await tx.customerPurchaseOrder.upsert({
        where: { offerId: offer.id },
        update: {
          ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
          ...(input.orderDate ? { orderDate: input.orderDate } : {}),
          ...(offer.order?.id ? { orderId: offer.order.id } : {}),
        },
        create: { offerId: offer.id, customerId: offer.customerId, orderNumber: input.orderNumber, orderDate: input.orderDate, orderId: offer.order?.id, createdById: input.actor.userId },
      })
      let documentId: string | null = null
      if (fileData) {
        const document = await tx.document.create({ data: {
          type: 'UPLOAD', format: documentFormat(fileData.mimeType), lifecycle: 'UPLOAD',
          archiveStatus: 'ARCHIVED', archivedAt: new Date(), isArchived: true,
          filename: fileData.filename, originalName: fileData.originalName, mimeType: fileData.mimeType,
          fileSize: fileData.bytes.length, storagePath: fileData.storagePath,
          checksum: crypto.createHash('sha256').update(fileData.bytes).digest('hex'), uploadedById: input.actor.userId,
          customerId: offer.customerId, offerId: offer.id, orderId: offer.order?.id,
          customerPurchaseOrderId: purchaseOrder.id,
        } })
        documentId = document.id
      }
      await tx.auditLog.create({ data: {
        userId: input.actor.userId, userEmail: input.actor.userEmail, action: offer.customerPurchaseOrder ? 'UPDATE' : 'CREATE',
        entityType: 'customerPurchaseOrder', entityId: purchaseOrder.id,
        oldValue: offer.customerPurchaseOrder ? {
          orderNumber: offer.customerPurchaseOrder.orderNumber,
          orderDate: offer.customerPurchaseOrder.orderDate?.toISOString() ?? null,
        } : undefined,
        newValue: {
          offerId: offer.id,
          orderNumber: input.orderNumber ?? offer.customerPurchaseOrder?.orderNumber ?? null,
          orderDate: (input.orderDate ?? offer.customerPurchaseOrder?.orderDate)?.toISOString() ?? null,
          originalName: fileData?.originalName ?? null,
        },
      } })
      if (documentId && fileData) {
        await tx.auditLog.create({ data: {
          userId: input.actor.userId, userEmail: input.actor.userEmail, action: 'DOCUMENT_UPLOADED',
          entityType: 'document', entityId: documentId,
          newValue: { offerId: offer.id, customerPurchaseOrderId: purchaseOrder.id, originalName: fileData.originalName, fileSize: fileData.bytes.length },
        } })
      }
      return purchaseOrder.id
    })
  } catch (error) {
    if (stored) await stored.storage.deleteFile(stored.storagePath).catch(() => undefined)
    throw error
  }
}
