// ============================================================
// types/enums.ts
// TypeScript-Enums spiegeln die Prisma-Enums exakt wider.
// Statusmaschinen definieren erlaubte Übergänge.
// ============================================================

// ── Rollen ──────────────────────────────────────────────────
export const RoleName = {
  ADMIN:           'ADMIN',
  OFFICE:          'OFFICE',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  EMPLOYEE:        'EMPLOYEE',
  ACCOUNTING:      'ACCOUNTING',
} as const
export type RoleName = (typeof RoleName)[keyof typeof RoleName]

export const CollaborationRole = {
  COLLAB_VIEWER: 'COLLAB_VIEWER',
  COLLAB_MEMBER: 'COLLAB_MEMBER',
  COLLAB_MANAGER: 'COLLAB_MANAGER',
  EXTERNAL_PLANNER: 'EXTERNAL_PLANNER',
  INTERNAL_PLANNER: 'INTERNAL_PLANNER',
  OPERATOR: 'OPERATOR',
  PARTNER: 'PARTNER',
} as const
export type CollaborationRole = (typeof CollaborationRole)[keyof typeof CollaborationRole]

export const CollaborationProjectStatus = {
  DRAFT: 'DRAFT',
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const
export type CollaborationProjectStatus = (typeof CollaborationProjectStatus)[keyof typeof CollaborationProjectStatus]

export const CollaborationHealthStatus = {
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
} as const
export type CollaborationHealthStatus = (typeof CollaborationHealthStatus)[keyof typeof CollaborationHealthStatus]

export const CollaborationStageStatus = {
  NOT_STARTED: 'NOT_STARTED',
  READY: 'READY',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
} as const
export type CollaborationStageStatus = (typeof CollaborationStageStatus)[keyof typeof CollaborationStageStatus]

export const COLLABORATION_TASK_STATUS_LABELS = { TODO: 'Offen', IN_PROGRESS: 'In Bearbeitung', BLOCKED: 'Blockiert', DONE: 'Erledigt', SKIPPED: 'Übersprungen' } as const
export const COLLABORATION_TASK_PRIORITY_LABELS = { LOW: 'Niedrig', MEDIUM: 'Mittel', HIGH: 'Hoch', URGENT: 'Dringend' } as const
export const COLLABORATION_BLOCKER_STATUS_LABELS = { OPEN: 'Offen', RESOLVED: 'Gelöst' } as const
export const COLLABORATION_APPROVAL_STATUS_LABELS = { REQUESTED: 'Ausstehend', APPROVED: 'Freigegeben', REJECTED: 'Abgelehnt' } as const

export const COLLABORATION_PROJECT_STATUS_LABELS: Record<CollaborationProjectStatus, string> = {
  DRAFT: 'Entwurf',
  PLANNED: 'Geplant',
  ACTIVE: 'Aktiv',
  ON_HOLD: 'Pausiert',
  COMPLETED: 'Abgeschlossen',
  CANCELLED: 'Abgebrochen',
}

export const COLLABORATION_STAGE_STATUS_LABELS: Record<CollaborationStageStatus, string> = {
  NOT_STARTED: 'Nicht begonnen',
  READY: 'Bereit',
  IN_PROGRESS: 'In Bearbeitung',
  WAITING_FOR_APPROVAL: 'Wartet auf Freigabe',
  BLOCKED: 'Blockiert',
  COMPLETED: 'Abgeschlossen',
  SKIPPED: 'Übersprungen',
}

export const COLLABORATION_ROLE_LABELS: Record<CollaborationRole, string> = {
  COLLAB_MANAGER: 'TWIR Projektleitung / Management',
  INTERNAL_PLANNER: 'TWIR interne Planung',
  EXTERNAL_PLANNER: 'Externe GGA-Planung',
  OPERATOR: 'Betreiber / Mercedes-Benz',
  PARTNER: 'Montage-/Fachpartner',
  COLLAB_MEMBER: 'Weitere Beteiligte',
  COLLAB_VIEWER: 'Nur Lesezugriff',
}

export const COLLABORATION_HEALTH_STATUS_LABELS: Record<CollaborationHealthStatus, string> = {
  GREEN: 'Stabil',
  YELLOW: 'Beobachten',
  RED: 'Kritisch',
}

export const ROLE_DISPLAY_NAMES: Record<RoleName, string> = {
  ADMIN:           'Administrator',
  OFFICE:          'Büro',
  PROJECT_MANAGER: 'Projektleiter',
  EMPLOYEE:        'Mitarbeiter',
  ACCOUNTING:      'Buchhaltung',
}

// ── Angebot-Status ──────────────────────────────────────────
export const OfferStatus = {
  DRAFT:              'DRAFT',
  SENT:               'SENT',
  ACCEPTED:           'ACCEPTED',
  REJECTED:           'REJECTED',
  EXPIRED:            'EXPIRED',
  CONVERTED_TO_ORDER: 'CONVERTED_TO_ORDER',
} as const
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus]

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  DRAFT:              'Entwurf',
  SENT:               'Versendet',
  ACCEPTED:           'Angenommen',
  REJECTED:           'Abgelehnt',
  EXPIRED:            'Abgelaufen',
  CONVERTED_TO_ORDER: 'In Auftrag umgewandelt',
}

/**
 * Erlaubte Status-Übergänge für Angebote.
 * Key = aktueller Status, Value = erlaubte Zielstatus.
 */
export const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  DRAFT:              [OfferStatus.SENT],
  SENT:               [OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.EXPIRED],
  ACCEPTED:           [OfferStatus.CONVERTED_TO_ORDER],
  REJECTED:           [],
  EXPIRED:            [],
  CONVERTED_TO_ORDER: [],
}

// ── Auftrag-Status ──────────────────────────────────────────
export const OrderStatus = {
  OPEN:        'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED:   'COMPLETED',
  INVOICED:    'INVOICED',
  CANCELLED:   'CANCELLED',
} as const
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]

export const OrderConfirmationType = {
  SIGNED_DOCUMENT: 'SIGNED_DOCUMENT',
  EMAIL: 'EMAIL',
  VERBAL: 'VERBAL',
  CUSTOMER_PURCHASE_ORDER: 'CUSTOMER_PURCHASE_ORDER',
  NOT_REQUIRED: 'NOT_REQUIRED',
} as const
export type OrderConfirmationType = (typeof OrderConfirmationType)[keyof typeof OrderConfirmationType]

export const ORDER_CONFIRMATION_TYPE_LABELS: Record<OrderConfirmationType, string> = {
  SIGNED_DOCUMENT: 'Unterschriebenes Dokument',
  EMAIL: 'Per E-Mail bestätigt',
  VERBAL: 'Mündlich / telefonisch bestätigt',
  CUSTOMER_PURCHASE_ORDER: 'Durch Kundenbestellung bestätigt',
  NOT_REQUIRED: 'Keine separate Bestätigung erforderlich',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  OPEN:        'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  COMPLETED:   'Abgeschlossen',
  INVOICED:    'Abgerechnet',
  CANCELLED:   'Storniert',
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  OPEN:        [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  IN_PROGRESS: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED:   [OrderStatus.INVOICED],
  INVOICED:    [],
  CANCELLED:   [],
}

// ── Rechnungs-Status ────────────────────────────────────────
export const InvoiceStatus = {
  DRAFT:          'DRAFT',
  FINALIZED:      'FINALIZED',
  SENT:           'SENT',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID:           'PAID',
  OVERDUE:        'OVERDUE',
  CANCELLED:      'CANCELLED',
  CORRECTED:      'CORRECTED',
} as const
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus]

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT:          'Entwurf',
  FINALIZED:      'Finalisiert',
  SENT:           'Versendet',
  PARTIALLY_PAID: 'Teilweise bezahlt',
  PAID:           'Bezahlt',
  OVERDUE:        'Überfällig',
  CANCELLED:      'Storniert',
  CORRECTED:      'Korrigiert',
}

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT:          [InvoiceStatus.FINALIZED],
  FINALIZED:      [InvoiceStatus.SENT, InvoiceStatus.CANCELLED],
  SENT:           [InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
  PARTIALLY_PAID: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE],
  PAID:           [],                               // Terminal — kein weiterer Übergang
  OVERDUE:        [InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.CANCELLED],
  CANCELLED:      [],                               // Terminal
  CORRECTED:      [],                               // Terminal — Original ist durch Korrektur-RE ersetzt
}

/** Rechnungen die nach Finalisierung nicht direkt bearbeitbar sind */
export const INVOICE_LOCKED_STATUSES = new Set<InvoiceStatus>([
  InvoiceStatus.FINALIZED,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.CANCELLED,
  InvoiceStatus.CORRECTED,
])

export const isInvoiceLocked = (status: InvoiceStatus): boolean =>
  INVOICE_LOCKED_STATUSES.has(status)

// ── Rechnungstyp ────────────────────────────────────────────
export const InvoiceType = {
  STANDARD:    'STANDARD',
  ADVANCE:     'ADVANCE',
  PARTIAL:     'PARTIAL',
  FINAL:       'FINAL',
  CORRECTION:  'CORRECTION',
  CANCELLATION:'CANCELLATION',
} as const
export type InvoiceType = (typeof InvoiceType)[keyof typeof InvoiceType]

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  STANDARD:    'Rechnung',
  ADVANCE:     'Abschlagsrechnung',
  PARTIAL:     'Teilrechnung',
  FINAL:       'Schlussrechnung',
  CORRECTION:  'Korrekturrechnung',
  CANCELLATION:'Stornorechnung',
}

// ── Audit-Aktionen ──────────────────────────────────────────
export const AuditAction = {
  CREATE:             'CREATE',
  UPDATE:             'UPDATE',
  OFFER_NUMBER_CHANGE:'OFFER_NUMBER_CHANGE',
  DELETE:             'DELETE',
  STATUS_CHANGE:      'STATUS_CHANGE',
  FINALIZE:           'FINALIZE',
  CANCEL:             'CANCEL',
  CORRECT:            'CORRECT',
  PAYMENT_ADDED:      'PAYMENT_ADDED',
  PAYMENT_REMOVED:    'PAYMENT_REMOVED',
  DOCUMENT_UPLOADED:  'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED:   'DOCUMENT_DELETED',
  LOGIN:              'LOGIN',
  LOGOUT:             'LOGOUT',
  PERMISSION_CHANGED: 'PERMISSION_CHANGED',
  SETTINGS_CHANGED:   'SETTINGS_CHANGED',
  ARCHIVE_SUCCEEDED:   'ARCHIVE_SUCCEEDED',
  ARCHIVE_FAILED:      'ARCHIVE_FAILED',
  ARCHIVE_RETRIED:     'ARCHIVE_RETRIED',
  ARCHIVE_TESTED:      'ARCHIVE_TESTED',
} as const
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

// ── Nummernkreis-Typen ──────────────────────────────────────
export const NumberSequenceType = {
  OFFER:          'OFFER',
  ORDER:          'ORDER',
  INVOICE:        'INVOICE',
  SERVICE_REPORT: 'SERVICE_REPORT',
} as const
export type NumberSequenceType = (typeof NumberSequenceType)[keyof typeof NumberSequenceType]

// ── Hilfsfunktion: Übergang erlaubt? ────────────────────────
export function isOfferTransitionAllowed(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from]?.includes(to) ?? false
}

export function isOrderTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false
}

export function isInvoiceTransitionAllowed(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from]?.includes(to) ?? false
}
