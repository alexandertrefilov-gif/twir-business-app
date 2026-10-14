import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceStatus } from '@/types/enums'

const {
  invoiceFindUnique,
  txInvoiceFindUnique,
  invoiceItemDeleteMany,
  invoiceDeleteMany,
  auditLogCreate,
  queryRaw,
} = vi.hoisted(() => ({
  invoiceFindUnique: vi.fn(),
  txInvoiceFindUnique: vi.fn(),
  invoiceItemDeleteMany: vi.fn(),
  invoiceDeleteMany: vi.fn(),
  auditLogCreate: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    invoice: { findUnique: invoiceFindUnique },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => callback({
      $queryRaw: queryRaw,
      invoice: { findUnique: txInvoiceFindUnique, deleteMany: invoiceDeleteMany },
      invoiceItem: { deleteMany: invoiceItemDeleteMany },
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
    queryRaw.mockResolvedValue([{ id: 'invoice-1' }])
    txInvoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.DRAFT })
    invoiceDeleteMany.mockResolvedValue({ count: 1 })
  })

  it('löscht einen Entwurf mit Positionen unter Zeilensperre und schreibt das Audit-Log', async () => {
    invoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.DRAFT })

    await deleteInvoiceDraft('invoice-1', 'user-1', 'admin@example.test')

    expect(invoiceFindUnique).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      select: { status: true },
    })
    expect(queryRaw).toHaveBeenCalledTimes(1) // SELECT … FOR UPDATE
    expect(invoiceItemDeleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 'invoice-1' },
    })
    // P4-A: Löschen nur mit Statusbedingung
    expect(invoiceDeleteMany).toHaveBeenCalledWith({ where: { id: 'invoice-1', status: InvoiceStatus.DRAFT } })
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

    expect(queryRaw).not.toHaveBeenCalled()
    expect(invoiceItemDeleteMany).not.toHaveBeenCalled()
    expect(invoiceDeleteMany).not.toHaveBeenCalled()
    expect(auditLogCreate).not.toHaveBeenCalled()
  })

  it('meldet eine unbekannte Rechnung ohne Löschabfrage', async () => {
    invoiceFindUnique.mockResolvedValue(null)

    await expect(
      deleteInvoiceDraft('missing', 'user-1', 'admin@example.test'),
    ).rejects.toThrow('Rechnung nicht gefunden')

    expect(invoiceItemDeleteMany).not.toHaveBeenCalled()
    expect(invoiceDeleteMany).not.toHaveBeenCalled()
  })

  it('P4-A: zwischenzeitlich finalisiert (Status unter Sperre) → Konflikt, es wird nichts gelöscht', async () => {
    invoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.DRAFT })
    txInvoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.FINALIZED })

    await expect(
      deleteInvoiceDraft('invoice-1', 'user-1', 'admin@example.test'),
    ).rejects.toThrow(/zwischenzeitlich finalisiert/)

    expect(invoiceItemDeleteMany).not.toHaveBeenCalled()
    expect(invoiceDeleteMany).not.toHaveBeenCalled()
    expect(auditLogCreate).not.toHaveBeenCalled()
  })

  it('P4-A: Löschen mit Statusbedingung trifft keine Zeile (count 0) → Konflikt, kein Audit', async () => {
    invoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.DRAFT })
    invoiceDeleteMany.mockResolvedValue({ count: 0 })

    await expect(
      deleteInvoiceDraft('invoice-1', 'user-1', 'admin@example.test'),
    ).rejects.toThrow(/zwischenzeitlich finalisiert/)

    expect(auditLogCreate).not.toHaveBeenCalled()
  })
})
