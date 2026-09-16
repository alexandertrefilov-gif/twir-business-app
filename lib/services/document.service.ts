// lib/services/document.service.ts
// Dokumentenarchiv-Service
//
// Aufgaben:
//   - Metadaten registrieren (nach Upload oder PDF-Erzeugung)
//   - Listen nach Entity (Kunde / Auftrag / Rechnung …)
//   - Soft Delete + Audit-Log
//   - Download-URL-Erzeugung (lokales FS oder S3 signed URL)
//
// Nutzt: buildAuditLogCreate (Phase 2), AuditAction (Phase 2)

import { prisma }            from '@/lib/db/prisma'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { AuditAction }       from '@/types/enums'
import { NotFoundError }     from '@/lib/auth/permissions'

// ── Types ─────────────────────────────────────────────────────

export interface RegisterDocumentInput {
  type:            string   // DocumentType enum value
  filename:        string
  originalName:    string
  mimeType:        string
  fileSize:        number
  storagePath:     string
  checksum?:       string | null
  // Optional entity links (at least one required)
  customerId?:     string | null
  offerId?:        string | null
  orderId?:        string | null
  serviceReportId?: string | null
  invoiceId?:      string | null
  uploadedById:    string
}

export interface DocumentListItem {
  id:           string
  type:         string
  filename:     string
  originalName: string
  mimeType:     string
  fileSize:     number
  storagePath:  string
  version:      number
  isArchived:   boolean
  createdAt:    Date
  entityLabel:  string   // "RE-2024-0001" / "Mustermann GmbH" etc.
}

export interface DocumentListParams {
  customerId?:     string
  offerId?:        string
  orderId?:        string
  serviceReportId?: string
  invoiceId?:      string
  search?:         string
  page?:           number
  pageSize?:       number
}

// ── REGISTER ──────────────────────────────────────────────────

export async function registerDocument(
  data:      RegisterDocumentInput,
  userId:    string,
  userEmail: string,
): Promise<string> {
  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        type:            data.type as any,
        filename:        data.filename,
        originalName:    data.originalName,
        mimeType:        data.mimeType,
        fileSize:        data.fileSize,
        storagePath:     data.storagePath,
        checksum:        data.checksum ?? null,
        customerId:      data.customerId      ?? null,
        offerId:         data.offerId         ?? null,
        orderId:         data.orderId         ?? null,
        serviceReportId: data.serviceReportId ?? null,
        invoiceId:       data.invoiceId       ?? null,
        uploadedById:    data.uploadedById,
      },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.DOCUMENT_UPLOADED,
      entityType: 'document',
      entityId:   created.id,
      newValue: {
        filename:     data.filename,
        originalName: data.originalName,
        type:         data.type,
        fileSize:     data.fileSize,
        invoiceId:    data.invoiceId    ?? null,
        customerId:   data.customerId   ?? null,
        orderId:      data.orderId      ?? null,
      },
    })

    return created
  })

  return doc.id
}

// ── LIST ──────────────────────────────────────────────────────

export async function getDocuments(
  params: DocumentListParams = {},
): Promise<{ documents: DocumentListItem[]; total: number }> {
  const {
    customerId, offerId, orderId, serviceReportId, invoiceId,
    search = '', page = 1, pageSize = 50,
  } = params

  const where = {
    deletedAt: null,
    ...(customerId     && { customerId }),
    ...(offerId        && { offerId }),
    ...(orderId        && { orderId }),
    ...(serviceReportId && { serviceReportId }),
    ...(invoiceId      && { invoiceId }),
    ...(search && {
      OR: [
        { filename:     { contains: search, mode: 'insensitive' as const } },
        { originalName: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [raw, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:           true,
        type:         true,
        filename:     true,
        originalName: true,
        mimeType:     true,
        fileSize:     true,
        storagePath:  true,
        version:      true,
        isArchived:   true,
        createdAt:    true,
        customer:     { select: { name: true } },
        offer:        { select: { offerNumber: true } },
        order:        { select: { orderNumber: true } },
        invoice:      { select: { invoiceNumber: true } },
      },
    }),
    prisma.document.count({ where }),
  ])

  return {
    documents: raw.map((d) => ({
      id:           d.id,
      type:         d.type,
      filename:     d.filename,
      originalName: d.originalName,
      mimeType:     d.mimeType,
      fileSize:     d.fileSize,
      storagePath:  d.storagePath,
      version:      d.version,
      isArchived:   d.isArchived,
      createdAt:    d.createdAt,
      entityLabel:
        d.invoice?.invoiceNumber
        ?? d.order?.orderNumber
        ?? d.offer?.offerNumber
        ?? d.customer?.name
        ?? '–',
    })),
    total,
  }
}

// ── GET BY ID ─────────────────────────────────────────────────

export async function getDocumentById(id: string) {
  const doc = await prisma.document.findUnique({
    where:   { id, deletedAt: null },
    include: {
      customer: { select: { id: true, name: true } },
      invoice:  { select: { id: true, invoiceNumber: true } },
      order:    { select: { id: true, orderNumber: true } },
      offer:    { select: { id: true, offerNumber: true } },
    },
  })
  if (!doc) throw new NotFoundError('Dokument nicht gefunden')
  return doc
}

// ── DELETE (soft) ─────────────────────────────────────────────

export async function deleteDocument(
  id:        string,
  reason:    string,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const doc = await prisma.document.findUnique({
    where:  { id, deletedAt: null },
    select: { id: true, filename: true, type: true, invoiceId: true },
  })
  if (!doc) throw new NotFoundError('Dokument nicht gefunden')

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id },
      data:  { deletedAt: new Date() },
    })

    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action:     AuditAction.DOCUMENT_DELETED,
      entityType: 'document',
      entityId:   id,
      oldValue:   { filename: doc.filename, type: doc.type },
      metadata:   { reason },
    })
  })
}

// ── DOWNLOAD URL ──────────────────────────────────────────────

/**
 * Erzeugt eine sichere, temporäre Download-URL.
 * Lokaler Modus: Gibt den internen Pfad zurück — Auslieferung via
 *   /api/documents/[id]/download (Auth-gesichert).
 * S3-Modus: AWS S3 getSignedUrl (Erweiterung Phase 8).
 */
export function getDocumentDownloadPath(storagePath: string): string {
  // Lokales FS: storagePath = relative path under STORAGE_LOCAL_PATH
  // Wird nie direkt an Client ausgeliefert — immer via API Route
  return storagePath
}

// ── HELPERS ───────────────────────────────────────────────────

/** Lesbare Dateigröße */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Eindeutiger Dateiname für Speicherung */
export function generateStorageFilename(
  prefix: string,
  originalName: string,
): string {
  const ext  = originalName.split('.').pop() ?? 'bin'
  const ts   = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${ts}_${rand}.${ext}`
}
