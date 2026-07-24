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
  },
}))

// ── Audit Service mocken (Schreiben) ──────────────────────────
vi.mock('@/lib/services/audit.service', () => ({
  writeAuditLog:      vi.fn().mockResolvedValue(undefined),
  buildAuditLogCreate: vi.fn().mockReturnValue({ then: vi.fn() }),
  getAuditLogs:       vi.fn().mockResolvedValue([]),
}))
