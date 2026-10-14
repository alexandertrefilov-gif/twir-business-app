// REQ-029 P5-6 C-2/D7: Die Umwandlung Angebot → Auftrag schreibt `orderDate` als Berliner Kalendertag (UTC-Mitternacht),
// nicht als DB-Default now() (Instant mit Uhrzeit). Regression zum Demo-Befund Auftrag e8c78500… (order_date == created_at).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const orderCreate = vi.fn()
const tx = {
  offer: { findUnique: vi.fn(), update: vi.fn() },
  order: { create: orderCreate },
  customerPurchaseOrder: { findUnique: vi.fn() },
  document: { updateMany: vi.fn() },
}

vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } }))
vi.mock('@/lib/services/audit.service', () => ({ buildAuditLogCreate: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/number-sequence.service', () => ({ nextNumber: vi.fn(async () => 'AU-2026-0001') }))
vi.mock('@/lib/services/settings.service', () => ({ getCompanySnapshot: vi.fn(async () => ({})) }))

import { convertOfferToOrder } from '@/lib/services/offer.service'

const offer = {
  id: 'o1', offerNumber: 'AN-1', status: 'ACCEPTED', customerId: 'c1', projectId: null, title: 'T',
  introText: null, outroText: null, totalNet: 100, totalTax: 19, totalGross: 119,
  customer: { name: 'K', legalName: null, vatId: null, taxNumber: null, street: null, houseNumber: null, postalCode: null, city: null, country: 'DE', email: null, phone: null },
  items: [],
}

async function convertAt(iso: string): Promise<Date> {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
  tx.offer.findUnique.mockResolvedValue(offer)
  tx.customerPurchaseOrder.findUnique.mockResolvedValue(null)
  orderCreate.mockResolvedValue({ id: 'ord1' })
  await convertOfferToOrder('o1', 'u1', 'u@x.de')
  return orderCreate.mock.calls.at(-1)![0].data.orderDate as Date
}

describe('P5-6 C-2: orderDate bei Angebot → Auftrag', () => {
  beforeEach(() => { orderCreate.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('Mittag: Berliner Kalendertag als UTC-Mitternacht', async () => {
    expect((await convertAt('2026-10-13T17:43:41.156Z')).toISOString()).toBe('2026-10-13T00:00:00.000Z')
  })
  it('00:30 Berlin (UTC noch Vortag): Berliner Tag, nicht UTC-Tag', async () => {
    expect((await convertAt('2026-10-13T22:30:00.000Z')).toISOString()).toBe('2026-10-14T00:00:00.000Z')
  })
  it('Jahreswechsel: 00:30 Berlin am 01.01.', async () => {
    expect((await convertAt('2026-12-31T23:30:00.000Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
  it('Winterzeit: 23:30 Berlin am 30.11.', async () => {
    expect((await convertAt('2026-11-30T22:30:00.000Z')).toISOString()).toBe('2026-11-30T00:00:00.000Z')
  })
})
