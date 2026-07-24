// lib/services/audit.service.ts
// Audit-Log-Service — append-only, niemals update oder delete
// Alle kritischen Aktionen MÜSSEN hier geloggt werden

import { prisma } from '@/lib/db/prisma'
import { AuditAction } from '@/types/enums'

export interface AuditLogParams {
  userId?:    string | null
  userEmail?: string | null
  action:     AuditAction
  entityType: string
  entityId:   string
  oldValue?:  Record<string, unknown> | null
  newValue?:  Record<string, unknown> | null
  metadata?:  {
    ip?:       string
    userAgent?: string
    reason?:   string
    [key: string]: unknown
  }
}

/**
 * Schreibt einen unveränderlichen Audit-Log-Eintrag.
 *
 * WICHTIG: Diese Funktion darf NIEMALS eine Exception werfen,
 * die eine kritische Transaktion abbricht. Fehler werden geloggt.
 *
 * Kritische Aktionen die IMMER geloggt werden müssen:
 * - Rechnung finalisieren / stornieren / korrigieren
 * - Zahlung erfassen / löschen
 * - Benutzerrechte ändern
 * - Kundendaten ändern
 * - Dokument löschen
 * - Firmeneinstellungen ändern
 */
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId:     params.userId ?? null,
        userEmail:  params.userEmail ?? null,
        action:     params.action,
        entityType: params.entityType,
        entityId:   params.entityId,
        oldValue:   params.oldValue   ? (params.oldValue as object)   : undefined,
        newValue:   params.newValue   ? (params.newValue as object)   : undefined,
        metadata:   params.metadata   ? (params.metadata as object)   : undefined,
      },
    })
  } catch (error) {
    // Audit-Log-Fehler niemals nach oben propagieren — aber immer stderr loggen
    console.error('[AUDIT LOG ERROR] Eintrag konnte nicht geschrieben werden:', {
      error,
      params,
    })
  }
}

/**
 * Audit-Log innerhalb einer Transaktion schreiben.
 * Verwenden wenn der Log-Eintrag Teil einer Transaktion sein muss
 * (z.B. Rechnung finalisieren — Log und Finalisierung atomar).
 */
export function buildAuditLogCreate(params: AuditLogParams) {
  return prisma.auditLog.create({
    data: {
      userId:     params.userId ?? null,
      userEmail:  params.userEmail ?? null,
      action:     params.action,
      entityType: params.entityType,
      entityId:   params.entityId,
      oldValue:   params.oldValue   ? (params.oldValue as object)   : undefined,
      newValue:   params.newValue   ? (params.newValue as object)   : undefined,
      metadata:   params.metadata   ? (params.metadata as object)   : undefined,
    },
  })
}

/**
 * Audit-Logs für eine Entity abfragen.
 */
export async function getAuditLogs(entityType: string, entityId: string) {
  return prisma.auditLog.findMany({
    where:   { entityType, entityId },
    include: { user: { select: { email: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  })
}
