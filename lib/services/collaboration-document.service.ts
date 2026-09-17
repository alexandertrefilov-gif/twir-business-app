// lib/services/collaboration-document.service.ts
// Eigenständige Collaboration-Dokumentdomäne (Fotos, Protokolle,
// Prüfberichte, Planzeichnungen zu Projekten/GGA-Schränken).
//
// Wiederverwendet bewusst die bestehende Sicherheits-/Storage-Schicht:
//   - validateUpload (lib/security/upload-validator.ts) — unverändert
//   - LocalFilesystemArchiveStorage (lib/documents/archive-storage.ts) —
//     dieselbe Klasse wie das interne Dokumentenarchiv, aber mit eigenem
//     Basisverzeichnis (".../collaboration"), damit interne kaufmännische
//     Dokumente (OneDrive-Archiv) niemals mit Collaboration-Uploads
//     vermischt werden. Keine zweite physische Storage-Architektur.
//
// Das interne Document-Modell wird NICHT verwendet — siehe Begründung im
// GGA-Cabinet-Report, Abschnitt "Dokumentarchitektur".

import path from 'path'
import { prisma } from '@/lib/db/prisma'
import { requireCollaborationProjectAccess, requireCollaborationSession } from '@/lib/auth/collaboration-guards'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/auth/permissions'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { AuditAction } from '@/types/enums'
import { editorRoles } from '@/lib/services/collaboration-phase2.service'
import { validateUpload, validateUploadSignature } from '@/lib/security/upload-validator'
import { generateStorageFilename } from '@/lib/services/document.service'
import { LocalFilesystemArchiveStorage } from '@/lib/documents/archive-storage'

// Rollen, die ausschließlich EXTERNAL-sichtbare Dokumente sehen/laden dürfen
// (der externe Betreiber selbst + "externe Viewer"). Alle anderen Rollen
// sehen weiterhin uneingeschränkt alles (bestehendes, unverändertes Verhalten).
const EXTERNAL_ONLY_VISIBILITY_ROLES = ['OPERATOR', 'COLLAB_VIEWER'] as const

// Sichtbarkeit ändern ist eine bewusste interne Aktion — nur dieselben
// Rollen, die auch Cabinet-Stammdaten pflegen dürfen (nicht OPERATOR, nicht
// COLLAB_VIEWER, siehe Vorgabe).
const documentVisibilityRoles = ['COLLAB_MANAGER', 'INTERNAL_PLANNER'] as const

// Strukturierte Fotokategorien für die GGA-Bestandsaufnahme (Phase 3) plus
// die bestehenden Dokumentarten. documentKind ist ein reiner String (kein
// DB-Enum) — die Werteliste wird ausschließlich hier app-seitig gepflegt,
// keine Migration nötig.
const DOCUMENT_KINDS = [
  'Übersicht', 'Typenschild', 'Innenraum', 'Abluft', 'Elektro', 'Mangel',
  'Protokoll', 'Pruefbericht', 'Planzeichnung', 'Sonstiges',
] as const

function getStorage(): LocalFilesystemArchiveStorage {
  const root = path.join(process.env.STORAGE_LOCAL_PATH ?? './storage/documents', 'collaboration')
  return new LocalFilesystemArchiveStorage(root)
}

export interface UploadCollaborationDocumentInput {
  projectId: string
  cabinetId?: string | null
  documentKind: string
  originalName: string
  mimeType: string
  buffer: Buffer
}

export async function uploadCollaborationDocument(input: UploadCollaborationDocumentInput) {
  const { userId, userEmail } = await requireCollaborationSession()
  const membership = await requireCollaborationProjectAccess(userId, input.projectId)
  if (!(editorRoles as readonly string[]).includes(membership.role)) {
    throw new ForbiddenError('Keine Berechtigung zum Hochladen von Dokumenten')
  }
  if (!DOCUMENT_KINDS.includes(input.documentKind as never)) {
    throw new ValidationError(`Ungültige Dokumentart. Erlaubt: ${DOCUMENT_KINDS.join(', ')}`)
  }
  if (input.cabinetId) {
    const cabinet = await prisma.ggaCabinet.findFirst({ where: { id: input.cabinetId, projectId: input.projectId, deletedAt: null } })
    if (!cabinet) throw new NotFoundError('Schrank nicht gefunden')
  }

  const validation = validateUpload({
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
  })
  if (!validation.valid) throw new ValidationError(validation.error ?? 'Datei ungültig')
  // Magic-Byte-Prüfung: MIME-Type/Extension allein sind clientseitig
  // vorgetäuscht angebbar. Gleiches Muster wie
  // customer-purchase-order.service.ts/external-confirmation.service.ts.
  if (!validateUploadSignature(input.buffer, input.mimeType)) {
    throw new ValidationError('Der Dateiinhalt passt nicht zum angegebenen Dateityp.')
  }

  const storage = getStorage()
  const storageName = generateStorageFilename('collab', validation.sanitizedName)
  await storage.ensureDirectory('.')
  await storage.writeFile(storageName, new Uint8Array(input.buffer), 'exclusive')

  try {
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.collaborationDocument.create({
        data: {
          projectId: input.projectId,
          cabinetId: input.cabinetId ?? null,
          documentKind: input.documentKind,
          filename: storageName,
          originalName: validation.sanitizedName,
          mimeType: input.mimeType,
          fileSize: input.buffer.byteLength,
          storagePath: storageName,
          uploadedById: userId,
        },
      })
      await buildAuditLogCreate(tx, {
        userId, userEmail,
        action: AuditAction.DOCUMENT_UPLOADED,
        entityType: 'collaboration_document',
        entityId: created.id,
        newValue: { originalName: created.originalName, documentKind: created.documentKind, projectId: input.projectId, cabinetId: input.cabinetId ?? null },
      })
      return created
    })
    return document
  } catch (error) {
    await storage.deleteFile(storageName).catch(() => {})
    throw error
  }
}

export async function listCollaborationDocuments(filters: { projectId: string; cabinetId?: string }) {
  const { userId } = await requireCollaborationSession()
  const membership = await requireCollaborationProjectAccess(userId, filters.projectId)
  if (filters.cabinetId) {
    // IDOR-Härtung: eine cabinetId aus einem fremden Projekt darf niemals
    // (versehentlich) Dokumente eines anderen Cabinets/Projekts liefern.
    const cabinet = await prisma.ggaCabinet.findFirst({ where: { id: filters.cabinetId, projectId: filters.projectId, deletedAt: null } })
    if (!cabinet) throw new NotFoundError('Schrank nicht gefunden')
  }
  const restrictToExternal = (EXTERNAL_ONLY_VISIBILITY_ROLES as readonly string[]).includes(membership.role)
  return prisma.collaborationDocument.findMany({
    where: {
      projectId: filters.projectId, deletedAt: null,
      ...(filters.cabinetId ? { cabinetId: filters.cabinetId } : {}),
      ...(restrictToExternal ? { visibility: 'EXTERNAL' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: { select: { firstName: true, lastName: true } }, cabinet: { select: { id: true, kennung: true } } },
  })
}

/** Für die Download-Route: löst Dokument + Berechtigung serverseitig auf (IDOR-Schutz). */
export async function getCollaborationDocumentForDownload(documentId: string) {
  const { userId } = await requireCollaborationSession()
  const document = await prisma.collaborationDocument.findUnique({ where: { id: documentId, deletedAt: null } })
  if (!document) throw new NotFoundError('Dokument nicht gefunden')
  const membership = await requireCollaborationProjectAccess(userId, document.projectId)
  if ((EXTERNAL_ONLY_VISIBILITY_ROLES as readonly string[]).includes(membership.role) && document.visibility !== 'EXTERNAL') {
    // Bewusst dieselbe Fehlermeldung wie "nicht gefunden" — eine bekannte
    // documentId eines INTERNAL-Dokuments darf dessen Existenz nicht verraten.
    throw new NotFoundError('Dokument nicht gefunden')
  }
  return document
}

/**
 * Ändert die Sichtbarkeit eines Dokuments (INTERNAL ↔ EXTERNAL). Ausschließlich
 * autorisierte interne Rollen — niemals anhand von documentKind, Dateiname,
 * Upload-Nutzer, Cabinet-Status, lifecycleStage, Prüf- oder Approval-Status
 * automatisch abgeleitet.
 */
export async function setCollaborationDocumentVisibility(documentId: string, visibility: 'INTERNAL' | 'EXTERNAL') {
  const { userId, userEmail } = await requireCollaborationSession()
  const document = await prisma.collaborationDocument.findUnique({ where: { id: documentId, deletedAt: null } })
  if (!document) throw new NotFoundError('Dokument nicht gefunden')
  const membership = await requireCollaborationProjectAccess(userId, document.projectId)
  if (!(documentVisibilityRoles as readonly string[]).includes(membership.role)) {
    throw new ForbiddenError('Keine Berechtigung, die Dokumentsichtbarkeit zu ändern')
  }
  if (document.visibility === visibility) return document

  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.collaborationDocument.update({ where: { id: documentId }, data: { visibility } })
    await buildAuditLogCreate(tx, {
      userId, userEmail,
      action: AuditAction.UPDATE,
      entityType: 'collaboration_document',
      entityId: documentId,
      oldValue: { visibility: document.visibility },
      newValue: { visibility },
      metadata: {
        reason: visibility === 'EXTERNAL' ? 'Dokument für Betreiber freigegeben' : 'Externe Dokumentfreigabe zurückgenommen',
        projectId: document.projectId,
        cabinetId: document.cabinetId,
      },
    })
    return value
  })
  return updated
}

export async function softDeleteCollaborationDocument(documentId: string, reason: string) {
  const { userId, userEmail } = await requireCollaborationSession()
  const document = await prisma.collaborationDocument.findUnique({ where: { id: documentId, deletedAt: null } })
  if (!document) throw new NotFoundError('Dokument nicht gefunden')
  const membership = await requireCollaborationProjectAccess(userId, document.projectId)
  if (!(editorRoles as readonly string[]).includes(membership.role)) throw new ForbiddenError('Keine Berechtigung zum Löschen von Dokumenten')

  await prisma.$transaction(async (tx) => {
    await tx.collaborationDocument.update({ where: { id: documentId }, data: { deletedAt: new Date() } })
    await buildAuditLogCreate(tx, { userId, userEmail, action: AuditAction.DOCUMENT_DELETED, entityType: 'collaboration_document', entityId: documentId, oldValue: { originalName: document.originalName }, metadata: { reason } })
  })
}

export function getCollaborationDocumentStorage() {
  return getStorage()
}

export { DOCUMENT_KINDS }
