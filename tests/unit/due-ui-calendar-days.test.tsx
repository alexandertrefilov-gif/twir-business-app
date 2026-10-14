// REQ-029 P5-6 B-2 / C2b (OfferTable validUntil) und C2d (Rechnungsliste „fällig“-Markierung):
// gerendert gegen gefälschte Systemzeit; die Markierung ⚠ erscheint ausschließlich nach der Kalendertag-Regel.
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.stubGlobal('React', React)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/offers',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/shared/RecordDeleteButton', () => ({ RecordDeleteButton: () => null }))
vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()
  return { ...actual, requirePagePermission: vi.fn(async () => ({ userId: 'u' })), hasPermission: vi.fn(async () => false) }
})
const queries = vi.hoisted(() => ({ getInvoices: vi.fn() }))
vi.mock('@/lib/services/invoice-query.service', () => ({ getInvoices: queries.getInvoices }))

import { OfferTable } from '@/components/offers/OfferTable'
import InvoicesPage from '@/app/(dashboard)/invoices/page'

const D = (iso: string) => new Date(iso)

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }) })
afterEach(() => { vi.useRealTimers() })

function offerRow(over: Record<string, unknown> = {}) {
  return {
    id: 'o1', offerNumber: 'AN 261001', status: 'SENT', title: null, customerId: 'c1', customerName: 'Kunde',
    offerDate: D('2026-10-01T00:00:00Z'), validUntil: D('2026-10-20T00:00:00Z'), totalNet: 100, totalGross: 119, itemCount: 1,
    createdAt: D('2026-10-01T08:00:00Z'), ...over,
  }
}
function renderOffers(offer: Record<string, unknown>) {
  return renderToStaticMarkup(
    <OfferTable offers={[offerRow(offer) as never]} total={1} page={1} totalPages={1} search="" statusFilter="" canDelete={false} canDeleteAllStatuses={false} canCopy={false} />,
  )
}
const hasWarning = (html: string) => html.includes('⚠')

describe('OfferTable – validUntil (C2b, D-3: letzter gültiger Tag gilt noch)', () => {
  it('am letzten Gültigkeitstag nicht abgelaufen (zu jeder Berliner Uhrzeit)', () => {
    for (const now of ['2026-10-19T22:00:00Z', '2026-10-20T00:00:01Z', '2026-10-20T12:00:00Z', '2026-10-20T21:59:59Z']) {
      vi.setSystemTime(D(now))
      expect(hasWarning(renderOffers({})), now).toBe(false)
    }
  })
  it('am Berliner Folgetag abgelaufen', () => {
    for (const now of ['2026-10-20T22:00:00Z', '2026-10-21T08:00:00Z', '2026-11-30T08:00:00Z']) {
      vi.setSystemTime(D(now))
      expect(hasWarning(renderOffers({})), now).toBe(true)
    }
  })
  it('Altwert mit Uhrzeit (E-5): validUntil 2026-10-20T17:42:31Z gilt als 20.10.', () => {
    vi.setSystemTime(D('2026-10-20T18:30:00Z'))
    expect(hasWarning(renderOffers({ validUntil: D('2026-10-20T17:42:31Z') }))).toBe(false)
    vi.setSystemTime(D('2026-10-20T22:00:00Z'))
    expect(hasWarning(renderOffers({ validUntil: D('2026-10-20T17:42:31Z') }))).toBe(true)
  })
  it('nur versendete Angebote werden markiert; ohne validUntil nie', () => {
    vi.setSystemTime(D('2026-12-01T10:00:00Z'))
    expect(hasWarning(renderOffers({ status: 'DRAFT' }))).toBe(false)
    expect(hasWarning(renderOffers({ status: 'ACCEPTED' }))).toBe(false)
    expect(hasWarning(renderOffers({ validUntil: null }))).toBe(false)
  })
})

async function renderInvoices(dueDate: Date | null, status = 'SENT') {
  queries.getInvoices.mockResolvedValue({
    invoices: [{
      id: 'i1', invoiceNumber: 'RE-1', customerId: 'c1', customerName: 'Kunde', invoiceDate: D('2026-10-01T00:00:00Z'), dueDate,
      status, totalGross: 119, remainingAmount: 119,
    }],
    total: 1, page: 1, totalPages: 1,
  })
  const element = await InvoicesPage({ searchParams: Promise.resolve({}) })
  return renderToStaticMarkup(element as React.ReactElement)
}

describe('Rechnungsliste – „fällig“-Markierung (C2d, E-2: überfällig, heute fällig, 1–2 Tage; nicht darüber)', () => {
  const now = D('2026-10-20T10:00:00Z')
  beforeEach(() => { vi.setSystemTime(now); queries.getInvoices.mockReset() })

  const cases: Array<[string, string, boolean]> = [
    ['gestern (überfällig)', '2026-10-19T00:00:00Z', true],
    ['heute (heute fällig)', '2026-10-20T00:00:00Z', true],
    ['morgen (+1)', '2026-10-21T00:00:00Z', true],
    ['übermorgen (+2)', '2026-10-22T00:00:00Z', true],
    ['+3 Tage (außerhalb der bestehenden Schwelle)', '2026-10-23T00:00:00Z', false],
    ['+4 Tage', '2026-10-24T00:00:00Z', false],
  ]
  for (const [label, due, expected] of cases) {
    it(`Fälligkeit ${label}: ⚠ = ${expected}`, async () => {
      expect((await renderInvoices(D(due))).includes('⚠')).toBe(expected)
    })
  }
  it('Schwelle ist kalendertagfest: +2 / +3 Tage auch kurz vor Berliner Mitternacht', async () => {
    vi.setSystemTime(D('2026-10-20T21:59:59Z')) // Berlin 20.10. 23:59:59
    expect((await renderInvoices(D('2026-10-22T00:00:00Z'))).includes('⚠')).toBe(true)
    expect((await renderInvoices(D('2026-10-23T00:00:00Z'))).includes('⚠')).toBe(false)
    vi.setSystemTime(D('2026-10-20T22:00:00Z')) // Berlin 21.10. 00:00:00
    expect((await renderInvoices(D('2026-10-23T00:00:00Z'))).includes('⚠')).toBe(true)
    expect((await renderInvoices(D('2026-10-24T00:00:00Z'))).includes('⚠')).toBe(false)
  })
  it('bezahlt / storniert / Entwurf / ohne Fälligkeit nie markiert', async () => {
    for (const status of ['PAID', 'CANCELLED', 'DRAFT']) expect((await renderInvoices(D('2026-10-19T00:00:00Z'), status)).includes('⚠'), status).toBe(false)
    expect((await renderInvoices(null)).includes('⚠')).toBe(false)
  })
})
