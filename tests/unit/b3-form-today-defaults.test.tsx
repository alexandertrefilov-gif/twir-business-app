// REQ-029 P5-6 B-3 / C3: „Heute“-Vorbelegungen in Formularen sind der Kalendertag in Europe/Berlin
// (nicht der UTC-Tag und nicht der Kalendertag der Browser-/Prozess-Zeitzone); Fristen (+14/+30 Tage) zählen Kalendertage.
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.stubGlobal('React', React)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/', useSearchParams: () => new URLSearchParams(),
}))

import { InvoiceForm } from '@/components/invoices/InvoiceForm'
import { OrderForm } from '@/components/orders/OrderForm'
import { OfferForm } from '@/components/offers/OfferForm'
import { ServiceReportForm } from '@/components/service-reports/ServiceReportForm'
import { PaymentForm } from '@/components/payments/PaymentForm'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'] as const
const originalTz = process.env.TZ
afterEach(() => { vi.useRealTimers(); if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })

/** [Bezeichnung, Systemzeit (echter Zeitpunkt), Berliner Heute, +14 Tage, +30 Tage] */
const CASES: Array<[string, string, string, string, string]> = [
  ['Berlin 00:30 (UTC-Tag noch der Vortag)', '2026-10-12T22:30:00Z', '2026-10-13', '2026-10-27', '2026-11-12'],
  ['Berlin 23:30', '2026-10-13T21:30:00Z', '2026-10-13', '2026-10-27', '2026-11-12'],
  ['Berlin 00:00:00 exakt (Sommerzeit)', '2026-10-12T22:00:00Z', '2026-10-13', '2026-10-27', '2026-11-12'],
  ['Berlin 23:59:59 (Sommerzeit)', '2026-10-13T21:59:59Z', '2026-10-13', '2026-10-27', '2026-11-12'],
  ['Berlin 00:30 (Winterzeit)', '2026-12-09T23:30:00Z', '2026-12-10', '2026-12-24', '2027-01-09'],
  ['Jahreswechsel: Berlin 00:30 Neujahr', '2026-12-31T23:30:00Z', '2027-01-01', '2027-01-15', '2027-01-31'],
  ['Jahreswechsel: Berlin 23:30 Silvester', '2026-12-31T22:30:00Z', '2026-12-31', '2027-01-14', '2027-01-30'],
  ['Schaltjahr: +14 trifft 29.02.', '2028-02-15T12:00:00Z', '2028-02-15', '2028-02-29', '2028-03-16'],
  ['Sommerzeit-Ende (25.10.2026) liegt im Fristfenster', '2026-10-24T22:30:00Z', '2026-10-25', '2026-11-08', '2026-11-24'],
  ['Sommerzeit-Beginn (29.03.2026) liegt im Fristfenster', '2026-03-20T12:00:00Z', '2026-03-20', '2026-04-03', '2026-04-19'],
  ['Monatswechsel', '2026-01-31T12:00:00Z', '2026-01-31', '2026-02-14', '2026-03-02'],
]

function inputValue(html: string, name: string): string | null {
  const tag = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))
  if (!tag) return null
  const value = tag[0].match(/ value="([^"]*)"/)
  return value ? value[1] : ''
}
const noopAction = async () => ({})

describe.each(ZONES)('„Heute“-Defaults in Zone %s', (zone) => {
  beforeEach(() => { process.env.TZ = zone; vi.useFakeTimers({ toFake: ['Date'] }) })

  it.each(CASES)('Rechnung: %s', (_l, now, today, plus14) => {
    vi.setSystemTime(new Date(now))
    const html = renderToStaticMarkup(<InvoiceForm mode="create" customers={[]} orders={[]} action={noopAction} />)
    expect(inputValue(html, 'invoiceDate')).toBe(today)
    expect(inputValue(html, 'dueDate')).toBe(plus14)
  })

  it.each(CASES)('Auftrag: %s', (_l, now, today) => {
    vi.setSystemTime(new Date(now))
    const html = renderToStaticMarkup(<OrderForm mode="create" customers={[]} action={noopAction} />)
    expect(inputValue(html, 'orderDate')).toBe(today)
  })

  it.each(CASES)('Angebot: %s', (_l, now, today, _p14, plus30) => {
    vi.setSystemTime(new Date(now))
    const html = renderToStaticMarkup(<OfferForm mode="create" customers={[]} action={noopAction} />)
    expect(inputValue(html, 'offerDate')).toBe(today)
    expect(inputValue(html, 'validUntil')).toBe(plus30)
  })

  it.each(CASES)('Leistungsnachweis: %s', (_l, now, today) => {
    vi.setSystemTime(new Date(now))
    const html = renderToStaticMarkup(<ServiceReportForm mode="create" orders={[]} action={noopAction} />)
    expect(inputValue(html, 'reportDate')).toBe(today)
  })

  it.each(CASES)('Zahlung: %s', (_l, now, today) => {
    vi.setSystemTime(new Date(now))
    const html = renderToStaticMarkup(<PaymentForm invoiceId="i1" totalGross="100.00" paidAmount="0.00" remainingAmount="100.00" action={noopAction} />)
    expect(inputValue(html, 'paymentDate')).toBe(today)
  })

  it('übergebene Defaults (z. B. bestehendes Datum beim Bearbeiten) bleiben unverändert', () => {
    vi.setSystemTime(new Date('2026-10-12T22:30:00Z'))
    const html = renderToStaticMarkup(<InvoiceForm mode="edit" customers={[]} orders={[]} action={noopAction}
      defaults={{ invoiceDate: '2026-01-05', dueDate: '2026-01-19', deliveryDate: '2026-01-04' }} />)
    expect([inputValue(html, 'invoiceDate'), inputValue(html, 'dueDate'), inputValue(html, 'deliveryDate')]).toEqual(['2026-01-05', '2026-01-19', '2026-01-04'])
  })
})
