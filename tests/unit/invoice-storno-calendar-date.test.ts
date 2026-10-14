// REQ-029 P5-6 B-1 / A2: Storno-Rechnungsdatum = Berliner Kalendertag der Stornierung (gespeichert als UTC-Mitternacht);
// finalizedAt bleibt ein echter Zeitpunkt. Beide Semantiken dürfen nicht vermischt werden (Owner-Entscheidung D-4).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(), invFindUnique: vi.fn(), invCreate: vi.fn(), invUpdateMany: vi.fn(),
  paymentCount: vi.fn(), nextNumber: vi.fn(), audit: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => {
  const tx = () => ({
    $queryRaw: m.queryRaw,
    invoice: { findUnique: m.invFindUnique, create: m.invCreate, updateMany: m.invUpdateMany },
    payment: { count: m.paymentCount },
  })
  return { prisma: { $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx()) } }
})
vi.mock('@/lib/services/number-sequence.service', () => ({ nextNumber: m.nextNumber }))
vi.mock('@/lib/services/audit.service', () => ({ buildAuditLogCreate: m.audit }))

import { cancelInvoice } from '@/lib/services/invoice.service'

const neg = (label: string) => ({ neg: () => `neg(${label})` })
function original() {
  return {
    id: 'inv-1', status: 'SENT', type: 'STANDARD', invoiceNumber: 'RE-1', customerId: 'c-1', orderId: null,
    customerSnapshot: {}, companySnapshot: {}, cancelledByInvoiceId: null, buyerReference: null,
    paidAmount: { isZero: () => true },
    totalNet: neg('net'), totalTax: neg('tax'), totalGross: neg('gross'),
    items: [{ position: 1, description: 'A', quantity: 1, unit: 'Stk.', unitPrice: 10, discountRate: '0.00', taxRate: 19,
      netAmount: neg('n'), taxAmount: neg('t'), grossAmount: neg('g') }],
  }
}

async function cancelAt(at: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(at))
  try {
    await cancelInvoice('inv-1', 'Fehler', 'u1', 'u@x.test')
  } finally {
    vi.useRealTimers()
  }
  return m.invCreate.mock.calls[m.invCreate.mock.calls.length - 1][0].data as { invoiceDate: Date; finalizedAt: Date }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.queryRaw.mockResolvedValue([{ id: 'inv-1' }])
  m.paymentCount.mockResolvedValue(0)
  m.invCreate.mockResolvedValue({ id: 'storno-1' })
  m.invUpdateMany.mockResolvedValue({ count: 1 })
  m.nextNumber.mockResolvedValue('RE-2')
  m.invFindUnique.mockResolvedValue(original())
})
afterEach(() => { vi.useRealTimers() })

describe('A2 Storno: invoiceDate = Berliner Kalendertag als UTC-Mitternacht', () => {
  it.each([
    ['2026-10-12T10:00:00Z', '2026-10-12T00:00:00.000Z', 'Berlin 12.10. 12:00'],
    ['2026-10-12T21:59:59Z', '2026-10-12T00:00:00.000Z', 'Berlin 12.10. 23:59:59 (CEST)'],
    ['2026-10-12T22:00:00Z', '2026-10-13T00:00:00.000Z', 'Berlin 13.10. 00:00 (CEST)'],
    ['2026-10-12T22:30:00Z', '2026-10-13T00:00:00.000Z', 'Berlin 13.10. 00:30'],
    ['2026-12-31T23:30:00Z', '2027-01-01T00:00:00.000Z', 'Jahreswechsel Berlin'],
    ['2027-01-01T04:30:00Z', '2027-01-01T00:00:00.000Z', 'New York noch 31.12.'],
    ['2028-02-29T23:30:00Z', '2028-03-01T00:00:00.000Z', 'Schalttag → 01.03.'],
    ['2027-03-27T23:30:00Z', '2027-03-28T00:00:00.000Z', 'Tag der Sommerzeit-Umstellung'],
  ])('%s → invoiceDate %s (%s)', async (at, expected) => {
    const data = await cancelAt(at)
    expect(data.invoiceDate.toISOString()).toBe(expected)
  })

  it('invoiceDate hat immer exakt 00:00:00.000 UTC (kanonisches Kalenderdatum, keine Uhrzeit im Kalenderfeld)', async () => {
    for (const at of ['2026-10-12T07:15:33.123Z', '2026-10-12T22:30:00Z', '2026-01-01T00:00:00Z']) {
      const { invoiceDate } = await cancelAt(at)
      expect(invoiceDate.getTime() % 86_400_000).toBe(0)
    }
  })
})

describe('A2 Storno: finalizedAt bleibt der echte Zeitpunkt', () => {
  it.each(['2026-10-12T07:15:33.123Z', '2026-10-12T22:30:00.000Z', '2026-12-31T23:30:00.000Z'])('%s', async (at) => {
    const { finalizedAt, invoiceDate } = await cancelAt(at)
    expect(finalizedAt.toISOString()).toBe(new Date(at).toISOString())
    expect(finalizedAt.getTime()).not.toBe(invoiceDate.getTime())
  })
})

describe('A2 unabhängig von process.env.TZ (Laufzeit-Wechsel)', () => {
  const original0 = process.env.TZ
  afterEach(() => { if (original0 === undefined) delete process.env.TZ; else process.env.TZ = original0 })
  it.each(['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Auckland'])('TZ=%s', async (zone) => {
    process.env.TZ = zone
    const { invoiceDate, finalizedAt } = await cancelAt('2026-10-12T22:30:00Z')
    expect(invoiceDate.toISOString()).toBe('2026-10-13T00:00:00.000Z')
    expect(finalizedAt.toISOString()).toBe('2026-10-12T22:30:00.000Z')
  })
})

describe('A2 statischer Schutz', () => {
  it('die Stornoanlage verwendet keinen rohen new Date() für invoiceDate', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/services/invoice.service.ts'), 'utf8')
    expect(src).not.toMatch(/invoiceDate:\s*new Date\(\)/)
  })
})
