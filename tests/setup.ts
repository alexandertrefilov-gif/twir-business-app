// tests/setup.ts
// Globale Test-Vorbereitung

import { vi } from 'vitest'

// ── Prisma mocken ─────────────────────────────────────────────
// Unit-Tests laufen ohne echte DB-Verbindung.
// Integration-Tests verwenden eine separate Test-DB.

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction:    vi.fn(),
    $queryRaw:       vi.fn(),
    numberSequence:  {
      findFirst: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
    invoice:    { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    payment:    { create: vi.fn(), aggregate: vi.fn(), update: vi.fn() },
    auditLog:   { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    companySetting: { findFirst: vi.fn(), findUnique: vi.fn() },
    collaborationMembership: { findFirst: vi.fn(), findMany: vi.fn() },
    collaborationProjectStage: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    collaborationProject: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    collaborationTask: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    collaborationChecklistItem: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    collaborationBlocker: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    collaborationApproval: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

// ── Audit Service mocken (Schreiben) ──────────────────────────
vi.mock('@/lib/services/audit.service', () => ({
  writeAuditLog:      vi.fn().mockResolvedValue(undefined),
  buildAuditLogCreate: vi.fn().mockResolvedValue(undefined),
  getAuditLogs:       vi.fn().mockResolvedValue([]),
}))
