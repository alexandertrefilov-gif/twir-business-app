import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ invoiceFindMany: vi.fn(), paymentFindMany: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    invoice: { findMany: db.invoiceFindMany },
    payment: { findMany: db.paymentFindMany },
  },
}))

import { resolveAccountingPeriod } from '@/lib/accounting/period'
import { deriveOpenItems, getAccountingInvoices, getAccountingOverview, getOpenAccountingInvoices } from '@/lib/services/accounting.service'

const decimal = (value: number) => ({ toNumber: () => value })
const period = resolveAccountingPeriod({ period: 'custom', from: '2026-09-01', to: '2026-09-30' }, new Date(2026, 8, 10))

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1', invoiceNumber: 'RE2026-0001', invoiceDate: new Date(2026, 8, 2), dueDate: new Date(2026, 8, 8),
    status: 'SENT', type: 'STANDARD', totalNet: decimal(100), totalTax: decimal(19), totalGross: decimal(119), paidAmount: decimal(20),
    customer: { name: 'Kunde GmbH' }, items: [{ taxAmount: decimal(19) }], payments: [{ amount: decimal(20) }], ...overrides,
  }
}

describe('read-only Buchhaltungsservice', () => {
  beforeEach(() => { vi.clearAllMocks(); db.paymentFindMany.mockResolvedValue([]) })

  it('berechnet Zahlung und offenen Betrag aus nicht gelöschten Payment-Zeilen', async () => {
    db.invoiceFindMany.mockResolvedValue([invoice({ paidAmount: decimal(999), payments: [{ amount: decimal(25) }] })])
    const [row] = await getAccountingInvoices(period)
    expect(row.paymentTotal).toBe(25)
    expect(row.openAmount).toBe(94)
    expect(row.reconciliationMismatch).toBe(true)
  })

  it('bezieht Original und negative Stornorechnung genau einmal in den Umsatz ein', async () => {
    db.invoiceFindMany.mockResolvedValue([
      invoice({ status: 'CANCELLED', totalGross: decimal(119), totalTax: decimal(19), items: [{ taxAmount: decimal(19) }], payments: [] }),
      invoice({ id: 'cancel-1', invoiceNumber: 'RE2026-0002', type: 'CANCELLATION', status: 'FINALIZED', totalNet: decimal(-100), totalTax: decimal(-19), totalGross: decimal(-119), paidAmount: decimal(0), items: [{ taxAmount: decimal(-19) }], payments: [] }),
    ])
    const result = await getAccountingOverview(period)
    expect(result.invoicedRevenue).toBe(0)
    expect(result.outputTax).toBe(0)
  })

  it('aggregiert Zahlungseingänge im Zeitraum', async () => {
    db.invoiceFindMany.mockResolvedValue([])
    db.paymentFindMany.mockResolvedValue([
      { id: 'p1', paymentDate: new Date(2026, 8, 3), amount: decimal(50), method: 'bank_transfer', reference: null, invoice: { id: 'i1', invoiceNumber: 'RE1', status: 'PARTIALLY_PAID', customer: { name: 'Kunde' } } },
      { id: 'p2', paymentDate: new Date(2026, 8, 4), amount: decimal(69), method: 'bank_transfer', reference: null, invoice: { id: 'i1', invoiceNumber: 'RE1', status: 'PAID', customer: { name: 'Kunde' } } },
    ])
    expect((await getAccountingOverview(period)).paymentIncome).toBe(119)
    expect(db.paymentFindMany.mock.calls[0][0].where.deletedAt).toBeNull()
  })

  it('führt nur unbezahlte offene Status als offene Posten und sortiert überfällige zuerst', async () => {
    db.invoiceFindMany.mockResolvedValue([
      invoice({ id: 'late', dueDate: new Date(2026, 7, 1), payments: [] }),
      invoice({ id: 'current', dueDate: new Date(2026, 8, 9), payments: [{ amount: decimal(19) }] }),
      invoice({ id: 'paid', status: 'PAID', payments: [{ amount: decimal(119) }], paidAmount: decimal(119) }),
    ])
    const items = deriveOpenItems(await getAccountingInvoices(period), new Date(2026, 8, 10))
    expect(items.map((item) => item.id)).toEqual(['late', 'current'])
    expect(items[0].overdue).toBe(true)
    expect(items[1].openAmount).toBe(100)
  })

  it('verwendet lokale inklusive Tagesgrenzen als exklusive Obergrenze', () => {
    expect(period.from).toEqual(new Date(2026, 8, 1))
    expect(period.toExclusive).toEqual(new Date(2026, 9, 1))
  })

  it('offene Posten sind stichtagsbezogen und nicht auf den Zeitraum-Filter beschränkt', async () => {
    db.invoiceFindMany.mockResolvedValue([
      // Rechnung aus einer weit zurückliegenden Periode, aber noch unbezahlt.
      invoice({ id: 'old-open', invoiceDate: new Date(2025, 0, 5), dueDate: new Date(2025, 0, 19), payments: [] }),
    ])
    const rows = await getOpenAccountingInvoices()
    expect(db.invoiceFindMany.mock.calls[0][0].where.invoiceDate).toBeUndefined()
    expect(rows.map((row) => row.id)).toEqual(['old-open'])
  })
})
