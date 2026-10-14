// REQ-029 P5-6 B-3 / D1 + D2: Web-Darstellung fachlicher Kalendertage (immer derselbe Tag in jeder Zone, Altwerte mit Uhrzeit
// über UTC-Komponenten) und eindeutige Trennung von echten Zeitpunkten (Europe/Berlin).
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.stubGlobal('React', React)

const q = vi.hoisted(() => ({ getInvoices: vi.fn(), getPaymentJournal: vi.fn(), listProjects: vi.fn(), getServiceReports: vi.fn(), getDashboardStats: vi.fn(), session: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams(), notFound: vi.fn(),
}))
vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()
  return { ...actual, requirePagePermission: vi.fn(async () => ({ userId: 'u', role: 'ADMIN' })), hasPermission: vi.fn(async () => false) }
})
vi.mock('@/lib/services/invoice-query.service', () => ({ getInvoices: q.getInvoices }))
vi.mock('@/lib/services/payment.service', () => ({ getPaymentJournal: q.getPaymentJournal }))
vi.mock('@/lib/services/project.service', () => ({ listProjects: q.listProjects }))
vi.mock('@/lib/services/service-report.service', () => ({ getServiceReports: q.getServiceReports }))
vi.mock('@/lib/services/dashboard.service', () => ({ getDashboardStats: q.getDashboardStats }))
vi.mock('next-auth', () => ({ getServerSession: q.session }))
vi.mock('@/lib/auth/options', () => ({ authOptions: {} }))
vi.mock('@/lib/security/test-delete', () => ({ isTestDeleteEnabled: () => false }))
vi.mock('@/components/shared/RecordDeleteButton', () => ({ RecordDeleteButton: () => null }))
vi.mock('@/components/projects/ProjectRowDeleteAction', () => ({ ProjectRowDeleteAction: () => null }))
vi.mock('@/app/(dashboard)/payments/actions', () => ({ removePaymentAction: vi.fn(), createDunningAction: vi.fn(), markDunningNoticeSentAction: vi.fn() }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ ConfirmDialog: ({ trigger }: { trigger: React.ReactNode }) => React.createElement('span', null, trigger) }))
vi.mock('@/components/shared/FormSubmitButton', () => ({ FormSubmitButton: () => null }))
vi.mock('@/lib/services/dunning.service', () => ({ DUNNING_LEVELS: { 1: { label: 'Erinnerung', defaultFee: null, dueDays: 7 } } }))

import { OfferTable } from '@/components/offers/OfferTable'
import { OrderTable } from '@/components/orders/OrderTable'
import { PaymentJournal } from '@/components/payments/PaymentJournal'
import { InvoiceDocumentHeader } from '@/components/invoices/InvoiceDocumentHeader'
import { DunningPanel } from '@/components/payments/DunningPanel'
import { formatDate as accountingFormatDate } from '@/components/accounting/AccountingTableHelpers'
import InvoicesPage from '@/app/(dashboard)/invoices/page'
import PaymentsPage from '@/app/(dashboard)/payments/page'
import ProjectsPage from '@/app/(dashboard)/projects/page'
import ServicesPage from '@/app/(dashboard)/services/page'
import DashboardPage from '@/app/(dashboard)/intern/dashboard/page'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'] as const
const originalTz = process.env.TZ
afterEach(() => { vi.useRealTimers(); if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })

/** [Bezeichnung, gespeicherter Kalendertag, TT.MM.JJJJ, „TT. Monat JJJJ“] */
const DATES: Array<[string, string, string, string]> = [
  ['normaler Tag', '2026-10-13T00:00:00Z', '13.10.2026', '13. Oktober 2026'],
  ['Jahreswechsel Silvester', '2026-12-31T00:00:00Z', '31.12.2026', '31. Dezember 2026'],
  ['Jahreswechsel Neujahr', '2027-01-01T00:00:00Z', '01.01.2027', '01. Januar 2027'],
  ['Monatswechsel', '2026-11-01T00:00:00Z', '01.11.2026', '01. November 2026'],
  ['Schaltjahr', '2028-02-29T00:00:00Z', '29.02.2028', '29. Februar 2028'],
  ['Berliner Sommerzeit-Beginn', '2026-03-29T00:00:00Z', '29.03.2026', '29. März 2026'],
  ['Berliner Sommerzeit-Ende', '2026-10-25T00:00:00Z', '25.10.2026', '25. Oktober 2026'],
  ['Altwert 17:42 Uhr', '2026-10-20T17:42:00Z', '20.10.2026', '20. Oktober 2026'],
  ['Altwert 23:59:59 Uhr', '2026-10-20T23:59:59Z', '20.10.2026', '20. Oktober 2026'],
  ['Altwert exakt Berlin-Mitternacht (Sommer)', '2026-10-19T22:00:00Z', '19.10.2026', '19. Oktober 2026'],
  ['Altwert exakt Berlin-Mitternacht (Winter)', '2026-12-09T23:00:00Z', '09.12.2026', '09. Dezember 2026'],
]
/** Bestehendes de-DE-Kurzformat ohne führende Nullen (Intl.DateTimeFormat('de-DE')): 01.01.2027 → 1.1.2027 – wird bewusst beibehalten. */
const unpad = (value: string) => value.split('.').map((part) => String(Number(part))).join('.')
const text = (html: string) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|')
/** Anzahl der Zellen, die genau `value` zeigen (Trennzeichen per Lookaround, damit direkt benachbarte Zellen mitzählen). */
const cells = (t: string, value: string) => (t.match(new RegExp(`(?<=\\|)${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\|)`, 'g')) ?? []).length

beforeEach(() => { vi.clearAllMocks() })

describe.each(ZONES)('Kalendertag-Anzeige in Zone %s', (zone) => {
  beforeEach(() => { process.env.TZ = zone })

  it.each(DATES)('OfferTable (offerDate, validUntil): %s', (_l, stored, short) => {
    const row = { id: 'o1', offerNumber: 'AN 1', status: 'SENT', title: null, customerId: 'c1', customerName: 'K', offerDate: new Date(stored), validUntil: new Date(stored),
      totalNet: 1, totalGross: 1, itemCount: 1, createdAt: new Date('2026-01-01T00:00:00Z') }
    const html = renderToStaticMarkup(<OfferTable offers={[row as never]} total={1} page={1} totalPages={1} search="" statusFilter="" canDelete={false} canDeleteAllStatuses={false} canCopy={false} />)
    expect(text(html).split(short).length - 1).toBeGreaterThanOrEqual(2)
  })

  it.each(DATES)('OrderTable (orderDate): %s', (_l, stored, short) => {
    const row = { id: 'a1', orderNumber: 'AU-1', status: 'OPEN', title: 'T', customerId: 'c1', customerName: 'K', offerNumber: null, orderDate: new Date(stored),
      startDate: null, endDate: null, totalGross: 1, serviceReportCount: 0, createdAt: new Date('2026-01-01T00:00:00Z') }
    const html = renderToStaticMarkup(<OrderTable orders={[row as never]} total={1} page={1} totalPages={1} search="" statusFilter="" canDelete={false} />)
    expect(text(html)).toContain(`|${short}|`)
  })

  it.each(DATES)('PaymentJournal (paymentDate): %s', (_l, stored, short) => {
    const html = renderToStaticMarkup(<PaymentJournal payments={[{ id: 'p1', amount: 10, paymentDate: new Date(stored), method: null, reference: null, notes: null, createdAt: new Date() }]}
      paidAmount="10.00" remainingAmount="0.00" invoiceStatus="PAID" canDelete={false} />)
    expect(text(html)).toContain(`|${short}|`)
  })

  it.each(DATES)('InvoiceDocumentHeader (Leistungsdatum): %s', (_l, stored, _s, long) => {
    const html = renderToStaticMarkup(<InvoiceDocumentHeader title="R" serviceReport={{ id: 's1', reportNumber: 'LN-1', reportDate: new Date(stored) }} />)
    // de-DE-Langform mit zweistelligem Tag (day: '2-digit'): „13. Oktober 2026“, „01. Januar 2027“
    expect(text(html)).toContain(`|${long}|`)
  })

  it.each(DATES)('DunningPanel (Fälligkeit = Kalendertag): %s', (_l, stored, short) => {
    const notice = { id: 'n1', invoiceId: 'i1', level: 1, levelLabel: 'Erinnerung', sentAt: null, dueDate: new Date(stored), fee: null, pdfPath: null, createdAt: new Date() }
    const html = renderToStaticMarkup(<DunningPanel invoiceId="i1" notices={[notice as never]} canManage={false} eligibility={null} canMarkSent={false} />)
    expect(text(html)).toContain(`Fällig: ${short}`)
  })

  it('DunningPanel: „Versendet“ ist ein echter Zeitpunkt und erscheint als Berliner Tag (13.10. 22:30 UTC → 14.10.26)', () => {
    const notice = { id: 'n1', invoiceId: 'i1', level: 1, levelLabel: 'Erinnerung', sentAt: new Date('2026-10-13T22:30:00Z'), dueDate: new Date('2026-10-20T00:00:00Z'), fee: null, pdfPath: null, createdAt: new Date() }
    const html = renderToStaticMarkup(<DunningPanel invoiceId="i1" notices={[notice as never]} canManage={false} eligibility={null} canMarkSent={false} />)
    expect(text(html)).toContain('Versendet 14.10.26')
  })

  it.each(DATES)('Buchhaltung formatDate (Kalendertag): %s', (_l, stored, short) => {
    expect(accountingFormatDate(new Date(stored))).toBe(unpad(short))
  })

  it.each(DATES)('Rechnungsliste (invoiceDate, dueDate): %s', async (_l, stored, short) => {
    q.getInvoices.mockResolvedValue({ invoices: [{ id: 'i1', invoiceNumber: 'RE-1', customerId: 'c1', customerName: 'K', invoiceDate: new Date(stored), dueDate: new Date(stored), status: 'PAID', totalGross: 1, remainingAmount: 0 }], total: 1, page: 1, totalPages: 1 })
    const html = renderToStaticMarkup((await InvoicesPage({ searchParams: Promise.resolve({}) })) as React.ReactElement)
    expect(cells(text(html), short)).toBeGreaterThanOrEqual(2)
  })

  it.each(DATES)('Zahlungsjournal-Seite (paymentDate): %s', async (_l, stored, short) => {
    q.getPaymentJournal.mockResolvedValue({ entries: [{ id: 'p1', paymentDate: new Date(stored), invoiceId: 'i1', invoiceNumber: 'RE-1', customerName: 'K', method: null, reference: null, amount: 5 }], total: 1, totalAmount: 5 })
    const html = renderToStaticMarkup((await PaymentsPage({ searchParams: Promise.resolve({}) })) as React.ReactElement)
    expect(text(html)).toContain(`|${short}|`)
  })

  it.each(DATES)('Projektliste (plannedStart/plannedEnd): %s', async (_l, stored, short) => {
    q.listProjects.mockResolvedValue([{ id: 'p1', projectNumber: 'P-1', name: 'Projekt', customer: { name: 'K' }, leadUser: null, status: 'ACTIVE', plannedStart: new Date(stored), plannedEnd: new Date(stored), collaborationProject: null }])
    const html = renderToStaticMarkup((await ProjectsPage({ searchParams: Promise.resolve({}) })) as React.ReactElement)
    expect(cells(text(html), unpad(short))).toBeGreaterThanOrEqual(2)
  })

  it.each(DATES)('Leistungsliste (reportDate): %s', async (_l, stored, short) => {
    q.getServiceReports.mockResolvedValue({ reports: [{ id: 'r1', reportNumber: 'LN-1', title: 'T', orderId: 'a1', orderNumber: 'AU-1', customerName: 'K', reportDate: new Date(stored), createdByName: 'X', itemCount: 1 }], total: 1, page: 1, totalPages: 1 })
    const html = renderToStaticMarkup((await ServicesPage({ searchParams: Promise.resolve({}) })) as React.ReactElement)
    expect(text(html)).toContain(`|${short}|`)
  })
})

describe.each(ZONES)('Dashboard „heute“ in Zone %s', (zone) => {
  beforeEach(() => {
    process.env.TZ = zone
    vi.useFakeTimers({ toFake: ['Date'] })
    q.session.mockResolvedValue({ user: { name: 'Max Muster' } })
    q.getDashboardStats.mockResolvedValue({ openOffers: 0, openOrders: 0, draftInvoices: 0, overdueInvoices: 0, totalCustomers: 0, recentActivity: [], monthlyInvoicedGross: 0 })
  })
  const CASES: Array<[string, string, string, string]> = [
    ['Berlin 00:30 am 13.10. (UTC noch 12.10.)', '2026-10-12T22:30:00Z', 'Dienstag, 13. Oktober 2026', 'Monat Oktober'],
    ['Berlin 23:30 am 13.10.', '2026-10-13T21:30:00Z', 'Dienstag, 13. Oktober 2026', 'Monat Oktober'],
    ['Jahreswechsel: Berlin 00:30 am 01.01.2027', '2026-12-31T23:30:00Z', 'Freitag, 1. Januar 2027', 'Monat Januar'],
    ['Monatswechsel: Berlin 00:30 am 01.11.', '2026-10-31T23:30:00Z', 'Sonntag, 1. November 2026', 'Monat November'],
  ]
  it.each(CASES)('%s', async (_l, now, dateText, monthText) => {
    vi.setSystemTime(new Date(now))
    const html = text(renderToStaticMarkup((await DashboardPage()) as React.ReactElement))
    expect(html).toContain(dateText)
    expect(html).toContain(monthText)
  })
})
