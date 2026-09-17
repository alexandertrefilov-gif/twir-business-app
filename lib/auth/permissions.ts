// lib/auth/permissions.ts
// Serverseitiges Rollenrechte-System
// KEINE Rechteprüfung darf ausschließlich im Frontend stattfinden

import { getServerSession } from 'next-auth'
import { forbidden, unauthorized } from 'next/navigation'
import { authOptions } from '@/lib/auth/options'
import { RoleName } from '@/types/enums'
import { prisma } from '@/lib/db/prisma'

// ── Ressourcen und Aktionen ──────────────────────────────────
export const Resource = {
  CUSTOMER:        'customer',
  CONTACT:         'contact',
  OFFER:           'offer',
  ORDER:           'order',
  SERVICE_REPORT:  'service_report',
  INVOICE:         'invoice',
  PAYMENT:         'payment',
  ACCOUNTING:      'accounting',
  DOCUMENT:        'document',
  AUDIT_LOG:       'audit_log',
  USER:            'user',
  ROLE:            'role',
  SETTINGS:        'settings',
  PROJECT:         'project',
} as const
export type Resource = (typeof Resource)[keyof typeof Resource]

export const Action = {
  CREATE:   'create',
  READ:     'read',
  UPDATE:   'update',
  DELETE:   'delete',
  FINALIZE: 'finalize',   // Rechnung finalisieren
  CANCEL:   'cancel',     // Rechnung stornieren
  EXPORT:   'export',     // DATEV, XRechnung (Phase 8)
} as const
export type Action = (typeof Action)[keyof typeof Action]

// ── Statische Rollenmatrix ───────────────────────────────────
// Schlüssel: `${Resource}:${Action}`
// Wert: Rollen die berechtigt sind

type PermissionMatrix = Record<string, RoleName[]>

const ALL_ROLES: RoleName[] = [
  RoleName.ADMIN,
  RoleName.OFFICE,
  RoleName.PROJECT_MANAGER,
  RoleName.EMPLOYEE,
  RoleName.ACCOUNTING,
]

const ADMIN_ONLY: RoleName[] = [RoleName.ADMIN]
const ACCOUNTING_ROLES: RoleName[] = [RoleName.ADMIN, RoleName.ACCOUNTING]
const OFFICE_ROLES: RoleName[] = [RoleName.ADMIN, RoleName.OFFICE]
const MANAGEMENT_ROLES: RoleName[] = [RoleName.ADMIN, RoleName.OFFICE, RoleName.PROJECT_MANAGER]

export const PERMISSION_MATRIX: PermissionMatrix = {
  // Kunden
  'customer:create':  MANAGEMENT_ROLES,
  'customer:read':    [RoleName.ADMIN, RoleName.OFFICE, RoleName.PROJECT_MANAGER, RoleName.ACCOUNTING],
  'customer:update':  MANAGEMENT_ROLES,
  'customer:delete':  OFFICE_ROLES,

  // Kontakte
  'contact:create':   MANAGEMENT_ROLES,
  'contact:read':     [RoleName.ADMIN, RoleName.OFFICE, RoleName.PROJECT_MANAGER, RoleName.ACCOUNTING],
  'contact:update':   MANAGEMENT_ROLES,
  'contact:delete':   OFFICE_ROLES,

  // Angebote
  'offer:create':     MANAGEMENT_ROLES,
  'offer:read':       [RoleName.ADMIN, RoleName.OFFICE, RoleName.PROJECT_MANAGER, RoleName.ACCOUNTING],
  'offer:update':     MANAGEMENT_ROLES,
  'offer:delete':     OFFICE_ROLES,

  // Aufträge
  'order:create':     MANAGEMENT_ROLES,
  'order:read':       ALL_ROLES,
  'order:update':     MANAGEMENT_ROLES,
  'order:delete':     OFFICE_ROLES,

  // Leistungserfassung
  'service_report:create': [...MANAGEMENT_ROLES, RoleName.EMPLOYEE],
  'service_report:read':   ALL_ROLES,
  'service_report:update': MANAGEMENT_ROLES,
  'service_report:delete': MANAGEMENT_ROLES,

  // Rechnungen — Entwurf
  'invoice:create':   [RoleName.ADMIN, RoleName.OFFICE, RoleName.ACCOUNTING],
  'invoice:read':     [RoleName.ADMIN, RoleName.OFFICE, RoleName.PROJECT_MANAGER, RoleName.ACCOUNTING],
  'invoice:update':   [RoleName.ADMIN, RoleName.OFFICE, RoleName.ACCOUNTING],  // Nur DRAFT
  'invoice:delete':   [RoleName.ADMIN, RoleName.OFFICE, RoleName.ACCOUNTING],  // Nur DRAFT

  // Rechnungen — kritische Aktionen
  'invoice:finalize': ACCOUNTING_ROLES,  // Nur Buchhaltung + Admin
  'invoice:cancel':   ACCOUNTING_ROLES,

  // Zahlungen
  'payment:create':   ACCOUNTING_ROLES,
  'payment:read':     ACCOUNTING_ROLES,
  'payment:delete':   ACCOUNTING_ROLES,

  // Buchhaltung — ausschließlich interne Finanzrollen
  'accounting:read':  ACCOUNTING_ROLES,

  // Dokumente
  'document:create':  MANAGEMENT_ROLES,
  'document:read':    ALL_ROLES,
  'document:delete':  OFFICE_ROLES,

  // Interne Projekte
  'project:create': MANAGEMENT_ROLES,
  'project:read': [RoleName.ADMIN, RoleName.OFFICE, RoleName.PROJECT_MANAGER, RoleName.ACCOUNTING],
  'project:update': MANAGEMENT_ROLES,
  'project:delete': OFFICE_ROLES,

  // Audit-Log — nur lesen
  'audit_log:read':   ACCOUNTING_ROLES,

  // Benutzerverwaltung
  'user:create':      ADMIN_ONLY,
  'user:read':        ADMIN_ONLY,
  'user:update':      ADMIN_ONLY,
  'user:delete':      ADMIN_ONLY,

  // Rollen
  'role:read':        ADMIN_ONLY,
  'role:update':      ADMIN_ONLY,

  // Einstellungen
  'settings:read':    ADMIN_ONLY,
  'settings:update':  ADMIN_ONLY,
}

// ── Hilfsfunktionen ──────────────────────────────────────────

/**
 * Prüft ob eine Rolle eine bestimmte Aktion auf einer Ressource darf.
 * Statisch — kein Datenbankzugriff.
 */
export function roleHasPermission(
  role: RoleName,
  resource: Resource,
  action: Action,
): boolean {
  const key = `${resource}:${action}`
  const allowed = PERMISSION_MATRIX[key]
  if (!allowed) return false
  return allowed.includes(role)
}

/**
 * Liest die aktuelle Session und prüft die Berechtigung.
 * Wirft einen Error wenn nicht berechtigt.
 * In Server Actions und API Routes verwenden.
 */
export async function requirePermission(
  resource: Resource,
  action: Action,
): Promise<{ userId: string; userEmail: string; role: RoleName }> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    throw new UnauthorizedError('Nicht angemeldet')
  }

  const user = session.user as { id: string; email: string; role: RoleName }

  if (!roleHasPermission(user.role, resource, action)) {
    throw new ForbiddenError(
      `Keine Berechtigung: ${resource}:${action} für Rolle ${user.role}`,
    )
  }

  return { userId: user.id, userEmail: user.email, role: user.role }
}

/**
 * Wie requirePermission, aber für Server-Component-Seiten/Layouts gedacht:
 * ein uncaught UnauthorizedError/ForbiddenError aus einer Seite würde von
 * Next.js sonst als generischer, nicht abgefangener Renderfehler behandelt
 * und mit HTTP 500 statt 401/403 beantwortet. Nutzt Next.js' eingebaute
 * unauthorized()/forbidden()-Interrupts (benötigt experimental.authInterrupts
 * in next.config sowie unauthorized.tsx/forbidden.tsx im jeweiligen
 * Routensegment), damit der korrekte Statuscode ausgeliefert wird — zentral
 * hier, keine verstreuten try/catch-Blöcke pro Seite.
 *
 * In Server Actions und API Routes weiterhin requirePermission() direkt
 * verwenden (dort ist der bestehende {error}-Rückgabewert bzw.
 * toHttpError()-Pfad bereits korrekt).
 */
export async function requirePagePermission(
  resource: Resource,
  action: Action,
): Promise<{ userId: string; userEmail: string; role: RoleName }> {
  try {
    return await requirePermission(resource, action)
  } catch (error) {
    if (error instanceof UnauthorizedError) unauthorized()
    if (error instanceof ForbiddenError) forbidden()
    throw error
  }
}

/**
 * Gibt true zurück wenn berechtigt — wirft keinen Error.
 * Für bedingte UI-Entscheidungen im Server-Kontext.
 */
export async function hasPermission(
  resource: Resource,
  action: Action,
): Promise<boolean> {
  try {
    await requirePermission(resource, action)
    return true
  } catch {
    return false
  }
}

// ── Fehlerklassen ────────────────────────────────────────────

export class UnauthorizedError extends Error {
  readonly statusCode = 401
  constructor(message = 'Nicht autorisiert') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403
  constructor(message = 'Zugriff verweigert') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class ValidationError extends Error {
  readonly statusCode = 400
  readonly fieldErrors?: Record<string, string[]>
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message)
    this.name = 'ValidationError'
    this.fieldErrors = fieldErrors
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404
  constructor(message = 'Nicht gefunden') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class BusinessRuleError extends Error {
  readonly statusCode = 422
  constructor(message: string) {
    super(message)
    this.name = 'BusinessRuleError'
  }
}

/**
 * Wandelt bekannte Fehlerklassen in HTTP-Response-Format um.
 * In API Routes verwenden.
 */
export function toHttpError(error: unknown): { status: number; message: string } {
  if (
    error instanceof UnauthorizedError ||
    error instanceof ForbiddenError ||
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof BusinessRuleError
  ) {
    return { status: error.statusCode, message: error.message }
  }
  console.error('[Unhandled Error]', error)
  return { status: 500, message: 'Interner Serverfehler' }
}
