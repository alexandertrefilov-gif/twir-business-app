import crypto from 'node:crypto'
import path from 'node:path'
import { prisma } from '@/lib/db/prisma'
import { BusinessRuleError, NotFoundError } from '@/lib/auth/permissions'
import { buildBusinessCaseArchiveDirectory, existingBusinessCaseArchiveDirectory } from '@/lib/documents/archive-naming'
import { LocalFilesystemArchiveStorage } from '@/lib/documents/archive-storage'
import { sanitizeFilename, validateUpload, validateUploadSignature } from '@/lib/security/upload-validator'
import type { DocumentFormat, OrderConfirmationType } from '@prisma/client'

export type ConfirmationOwner = 'order'

export interface ExternalConfirmationUpload {
  originalName: string
  mimeType: string
  bytes: Uint8Array
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.eml': 'message/rfc822', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
}

function normalizedMime(file: ExternalConfirmationUpload) {
  const supplied = file.mimeType.split(';')[0].trim().toLowerCase()
  return supplied && supplied !== 'application/octet-stream'
    ? supplied
    : MIME_BY_EXTENSION[path.extname(file.originalName).toLowerCase()] ?? supplied
}

function documentFormat(mimeType: string): DocumentFormat {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('wordprocessingml')) return 'DOCX'
  return 'OTHER'
}

async function loadContext(id: string) {
  const row = await prisma.order.findUnique({
    where: { id, deletedAt: null },
    include: {
      customer: true,
      documents: { where: { deletedAt: null }, select: { storagePath: true } },
      customerPurchaseOrder: { select: { id: true } },
      offer: { include: { documents: { where: { deletedAt: null }, select: { storagePath: true } } } },
    },
  })
  if (!row) throw new NotFoundError('Auftrag nicht gefunden')
  if (!row.sentAt) throw new BusinessRuleError('Der Auftrag muss vor der Kundenbestätigung als versendet markiert werden.')
  return {
    customerId: row.customerId, year: (row.offer?.offerDate ?? row.orderDate).getFullYear(),
    customerNumber: row.customer.number, customerName: row.customer.name,
    areaName: row.offer?.areaName ?? row.offer?.title ?? row.title,
    businessCaseId: row.offer ? `offer-${row.offer.id}` : `order-${row.id}`,
    category: '03_Auftrag' as const,
    paths: [...row.documents, ...(row.offer?.documents ?? [])].map(document => document.storagePath),
    links: { orderId: row.id, offerId: row.offerId ?? undefined },
    alreadyConfirmed: Boolean(row.confirmedAt),
    previousConfirmation: { confirmedAt: row.confirmedAt, confirmationType: row.confirmationType, confirmationNote: row.confirmationNote },
    hasCustomerPurchaseOrder: Boolean(row.customerPurchaseOrder),
  }
}

export async function saveExternalConfirmation(input: {
  owner: ConfirmationOwner
  id: string
  file?: ExternalConfirmationUpload
  confirmationType?: OrderConfirmationType
  confirmedAt?: Date
  confirmationNote?: string | null
  actor: { userId: string; userEmail: string }
}) {
  const context = await loadContext(input.id)
  if (!input.confirmationType) throw new BusinessRuleError('Bitte wählen Sie eine Bestätigungsart aus.')
  if (input.confirmationType === 'SIGNED_DOCUMENT' && !input.file) throw new BusinessRuleError('Für diese Bestätigungsart ist ein unterschriebenes Dokument erforderlich.')
  if (input.confirmationType === 'CUSTOMER_PURCHASE_ORDER' && !context.hasCustomerPurchaseOrder) {
    throw new BusinessRuleError('Für diesen Auftrag ist keine Kundenbestellung hinterlegt.')
  }

  let stored: { storage: LocalFilesystemArchiveStorage; storagePath: string } | null = null
  let preparedFile: { mimeType: string; safeOriginal: string; filename: string; storagePath: string; bytes: Uint8Array } | null = null
  if (input.file) {
    const mimeType = normalizedMime(input.file)
    const validation = validateUpload({ originalName: input.file.originalName, mimeType, sizeBytes: input.file.bytes.length })
    if (!validation.valid) throw new BusinessRuleError(validation.error ?? 'Ungültige Datei.')
    if (!validateUploadSignature(input.file.bytes, mimeType)) throw new BusinessRuleError('Der Dateiinhalt passt nicht zum angegebenen Dateityp.')
    const settings = await prisma.companySetting.findFirst({ select: { documentArchiveEnabled: true, documentArchivePath: true } })
    const root = settings?.documentArchiveEnabled && settings.documentArchivePath ? settings.documentArchivePath : process.env.STORAGE_LOCAL_PATH ?? './storage/documents'
    const businessCaseDirectory = existingBusinessCaseArchiveDirectory(context.paths)
    const directory = businessCaseDirectory ? path.join(businessCaseDirectory, context.category) : buildBusinessCaseArchiveDirectory({ ...context, category: context.category })
    const safeOriginal = sanitizeFilename(validation.sanitizedName)
    const extension = path.extname(safeOriginal)
    const filename = `${path.basename(safeOriginal, extension)}_${crypto.randomUUID().slice(0, 8)}${extension}`
    const storagePath = path.join(directory, filename)
    const storage = new LocalFilesystemArchiveStorage(root)
    await storage.writeFile(storagePath, input.file.bytes, 'exclusive')
    stored = { storage, storagePath }
    preparedFile = { mimeType, safeOriginal, filename, storagePath, bytes: input.file.bytes }
  }

  try {
    return await prisma.$transaction(async tx => {
      const confirmedAt = input.confirmedAt ?? new Date()
      const updated = await tx.order.updateMany({
        where: { id: input.id, sentAt: { not: null } },
        data: { confirmedAt, confirmationType: input.confirmationType!, confirmationNote: input.confirmationNote?.trim() || null },
      })
      if (updated.count !== 1) throw new BusinessRuleError('Der Auftrag kann in seinem aktuellen Zustand nicht bestätigt werden.')
      await tx.auditLog.create({ data: {
        userId: input.actor.userId, userEmail: input.actor.userEmail, action: 'STATUS_CHANGE', entityType: 'order', entityId: input.id,
        oldValue: context.previousConfirmation,
        newValue: { confirmedAt: confirmedAt.toISOString(), confirmationType: input.confirmationType, confirmationNote: input.confirmationNote?.trim() || null },
      } })
      if (!preparedFile) return null
      const document = await tx.document.create({ data: {
        type: 'ORDER_CONFIRMATION',
        format: documentFormat(preparedFile.mimeType), lifecycle: 'UPLOAD', archiveStatus: 'ARCHIVED',
        archivedAt: new Date(), isArchived: true, filename: preparedFile.filename, originalName: preparedFile.safeOriginal, mimeType: preparedFile.mimeType,
        fileSize: preparedFile.bytes.length, storagePath: preparedFile.storagePath,
        checksum: crypto.createHash('sha256').update(preparedFile.bytes).digest('hex'),
        uploadedById: input.actor.userId, customerId: context.customerId, ...context.links,
      } })
      await tx.auditLog.create({ data: {
        userId: input.actor.userId, userEmail: input.actor.userEmail, action: 'DOCUMENT_UPLOADED',
        entityType: 'document', entityId: document.id,
        newValue: { confirmationFor: input.owner, ownerId: input.id, originalName: preparedFile.safeOriginal, fileSize: preparedFile.bytes.length },
      } })
      return document.id
    })
  } catch (error) {
    if (stored) await stored.storage.deleteFile(stored.storagePath).catch(() => undefined)
    throw error
  }
}
