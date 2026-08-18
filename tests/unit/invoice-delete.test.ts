import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceStatus } from '@/types/enums'

const {
  invoiceFindUnique,
  invoiceItemDeleteMany,
  invoiceDelete,
  auditLogCreate,
} = vi.hoisted(() => ({
  invoiceFindUnique: vi.fn(),
  invoiceItemDeleteMany: vi.fn(),
  invoiceDelete: vi.fn(),
  auditLogCreate: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    invoice: { findUnique: invoiceFindUnique },
    $transaction: vi.fn(async (
      callback: (tx: {
        invoiceItem: { deleteMany: typeof invoiceItemDeleteMany }
        invoice: { delete: typeof invoiceDelete }
        auditLog: { create: typeof auditLogCreate }
      }) => Promise<void>,
    ) => callback({
      invoiceItem: { deleteMany: invoiceItemDeleteMany },
      invoice: { delete: invoiceDelete },
      auditLog: { create: auditLogCreate },
    })),
  },
}))

vi.mock('@/lib/services/number-sequence.service', () => ({
  nextNumber: vi.fn(),
}))

vi.mock('@/lib/services/audit.service', () => ({
  buildAuditLogCreate: vi.fn(),
}))

import { deleteInvoiceDraft } from '@/lib/services/invoice.service'

describe('Rechnungsentwurf löschen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('löscht einen Entwurf mit Positionen und schreibt das Audit-Log', async () => {
    invoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.DRAFT })

    await deleteInvoiceDraft('invoice-1', 'user-1', 'admin@example.test')

    expect(invoiceFindUnique).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      select: { status: true },
    })
    expect(invoiceItemDeleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 'invoice-1' },
    })
    expect(invoiceDelete).toHaveBeenCalledWith({ where: { id: 'invoice-1' } })
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        userEmail: 'admin@example.test',
        action: 'DELETE',
        entityType: 'invoice',
        entityId: 'invoice-1',
        oldValue: { status: InvoiceStatus.DRAFT },
      },
    })
  })

  it('verweigert das Löschen einer finalisierten Rechnung vor jeder Löschabfrage', async () => {
    invoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.FINALIZED })

    await expect(
      deleteInvoiceDraft('invoice-1', 'user-1', 'admin@example.test'),
    ).rejects.toThrow('Nur Rechnungsentwürfe können gelöscht werden.')

    expect(invoiceItemDeleteMany).not.toHaveBeenCalled()
    expect(invoiceDelete).not.toHaveBeenCalled()
    expect(auditLogCreate).not.toHaveBeenCalled()
  })

  it('meldet eine unbekannte Rechnung ohne Löschabfrage', async () => {
    invoiceFindUnique.mockResolvedValue(null)

    await expect(
      deleteInvoiceDraft('missing', 'user-1', 'admin@example.test'),
    ).rejects.toThrow('Rechnung nicht gefunden')

    expect(invoiceItemDeleteMany).not.toHaveBeenCalled()
    expect(invoiceDelete).not.toHaveBeenCalled()
  })
})
