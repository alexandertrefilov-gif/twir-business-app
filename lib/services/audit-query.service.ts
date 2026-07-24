// lib/services/audit-query.service.ts
// Globale Audit-Log-Abfragen für die Admin-UI.
//
// TRENNUNG vom bestehenden audit.service.ts (Phase 2):
//   audit.service.ts      → SCHREIBEN (writeAuditLog, buildAuditLogCreate)
//   audit-query.service.ts → LESEN  (paginiert, gefiltert, für Admin-UI)
//
// Nutzt: AuditAction (Phase 2 enums), prisma (Phase 2 db)

import { prisma }      from '@/lib/db/prisma'
import { Prisma }      from '@prisma/client'
import type { AuditAction } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────

export interface AuditLogListParams {
  userId?:     string
  entityType?: string
  action?:     AuditAction
  entityId?:   string
  from?:       Date
  to?:         Date
  search?:     string
  page?:       number
  pageSize?:   number
}

export interface AuditLogListItem {
  id:         string
  userId:     string | null
  userEmail:  string | null
  userName:   string | null
  action:     string
  entityType: string
  entityId:   string
  oldValue:   unknown
  newValue:   unknown
  metadata:   unknown
  createdAt:  Date
}

export interface AuditLogListResult {
  entries:    AuditLogListItem[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

// ── All distinct entity types (for filter dropdown) ───────────

export const AUDIT_ENTITY_TYPES = [
  'customer', 'offer', 'order', 'service_report',
  'invoice', 'payment', 'dunning_notice', 'document',
  'user', 'settings',
] as const

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  customer:       'Kunde',
  offer:          'Angebot',
  order:          'Auftrag',
  service_report: 'Leistungsnachweis',
  invoice:        'Rechnung',
  payment:        'Zahlung',
  dunning_notice: 'Mahnung',
  document:       'Dokument',
  user:           'Benutzer',
  settings:       'Einstellungen',
}

export function isAuditEntityType(value: string): value is AuditEntityType {
  return AUDIT_ENTITY_TYPES.some((entityType) => entityType === value)
}

export function getAuditEntityLabel(value: string): string {
  return isAuditEntityType(value)
    ? AUDIT_ENTITY_LABELS[value]
    : `Unbekannte Entität (${value})`
}

// ── QUERY ─────────────────────────────────────────────────────

export async function getAuditLogs(
  params: AuditLogListParams = {},
): Promise<AuditLogListResult> {
  const {
    userId,
    entityType,
    action,
    entityId,
    from,
    to,
    search   = '',
    page     = 1,
    pageSize = 50,
  } = params

  const where: Prisma.AuditLogWhereInput = {
    ...(userId     && { userId }),
    ...(entityType && { entityType }),
    ...(action     && { action }),
    ...(entityId   && { entityId }),
    ...(from       && { createdAt: { gte: from } }),
    ...(to         && { createdAt: { lte: to } }),
    ...(search && {
      OR: [
        { entityId:   { contains: search, mode: 'insensitive' } },
        { userEmail:  { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [raw, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ])

  return {
    entries: raw.map((e) => ({
      id:         e.id,
      userId:     e.userId,
      userEmail:  e.userEmail,
      userName:   e.user
        ? `${e.user.firstName} ${e.user.lastName}`
        : null,
      action:     e.action,
      entityType: e.entityType,
      entityId:   e.entityId,
      oldValue:   e.oldValue,
      newValue:   e.newValue,
      metadata:   e.metadata,
      createdAt:  e.createdAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export async function getAuditLogById(id: string) {
  return prisma.auditLog.findUnique({
    where:   { id },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  })
}

/** Zusammenfassung für Dashboard-Widget */
export async function getAuditLogSummary(sinceHours = 24) {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)

  const [total, byAction] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    prisma.auditLog.groupBy({
      by:      ['action'],
      where:   { createdAt: { gte: since } },
      _count:  { action: true },
      orderBy: { _count: { action: 'desc' } },
      take:    5,
    }),
  ])

  return {
    totalLast24h: total,
    topActions:   byAction.map((b) => ({ action: b.action, count: b._count.action })),
  }
}
