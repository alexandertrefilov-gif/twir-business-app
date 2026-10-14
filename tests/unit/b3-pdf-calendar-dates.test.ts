// REQ-029 P5-6 B-3 / A3: Kalendertage in PDF-/Dokument-Daten dürfen nicht von der Prozess-Zeitzone abhängen.
// Gespeicherte fachliche Kalendertage (UTC-Mitternacht, Altwerte ggf. mit Uhrzeit) ergeben in jeder Zone denselben Tag.
// Echte Zeitpunkte (Instants) bleiben Instants und werden eindeutig in Europe/Berlin dargestellt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getInvoiceById: vi.fn(), getCompanySnapshot: vi.fn(), loadLogo: vi.fn(), getOfferById: vi.fn(), getOrderById: vi.fn(),
  getServiceReportById: vi.fn(), customerFindFirst: vi.fn(), orderFindFirst: vi.fn(), userFindFirst: vi.fn(), resolveRecipient: vi.fn(),
  cabinetDetail: vi.fn(), cabinetHistory: vi.fn(), cabinetPruef: vi.fn(), poFindFirst: vi.fn(),
}))
vi.mock('@/lib/services/invoice-query.service', () => ({ getInvoiceById: m.getInvoiceById }))
vi.mock('@/lib/services/settings.service', () => ({ getCompanySnapshot: m.getCompanySnapshot }))
vi.mock('@/lib/services/company-logo-rendering.service', () => ({ loadCompanyLogoForPdf: m.loadLogo }))
vi.mock('@/lib/services/offer.service', () => ({ getOfferById: m.getOfferById }))
vi.mock('@/lib/services/order.service', () => ({ getOrderById: m.getOrderById }))
vi.mock('@/lib/services/service-report.service', () => ({ getServiceReportById: m.getServiceReportById }))
vi.mock('@/lib/services/invoice.service', () => ({ resolveInvoiceRecipientSnapshot: m.resolveRecipient }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: { customerPurchaseOrder: { findFirst: m.poFindFirst }, customer: { findFirst: m.customerFindFirst }, order: { findFirst: m.orderFindFirst }, user: { findFirst: m.userFindFirst }, invoice: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/services/gga-cabinet.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/gga-cabinet.service')>()
  return { ...actual, getGgaCabinetDetail: m.cabinetDetail, getGgaCabinetAuditHistory: m.cabinetHistory, loadGgaCabinetPruefnachweise: m.cabinetPruef }
})

import { getInvoicePdfData, getInvoiceDraftPdfData } from '@/lib/services/invoice-pdf.service'
import { getOfferPdfData } from '@/lib/services/offer-pdf.service'
import { getOrderPdfData } from '@/lib/services/order-pdf.service'
import { getServiceReportPdfData, getServiceReportDraftPdfData } from '@/lib/services/service-report-pdf.service'
import { getGgaCabinetSchrankaktePdfData } from '@/lib/services/gga-cabinet-schrankakte.service'
import { FULL_ORDER_PDF_OPTIONS } from '@/lib/validators/order-pdf.schema'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'] as const
const originalTz = process.env.TZ
afterEach(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })

/** [Bezeichnung, gespeicherter Wert, erwarteter Kalendertag TT.MM.JJJJ] – Altwerte werden über UTC-Komponenten gelesen. */
const DATES: Array<[string, string, string]> = [
  ['normaler Tag', '2026-10-13T00:00:00Z', '13.10.2026'],
  ['Jahreswechsel (Silvester)', '2026-12-31T00:00:00Z', '31.12.2026'],
  ['Jahreswechsel (Neujahr)', '2027-01-01T00:00:00Z', '01.01.2027'],
  ['Monatswechsel', '2026-11-01T00:00:00Z', '01.11.2026'],
  ['Schaltjahr 29.02.', '2028-02-29T00:00:00Z', '29.02.2028'],
  ['Berliner Sommerzeit-Beginn', '2026-03-29T00:00:00Z', '29.03.2026'],
  ['Berliner Sommerzeit-Ende', '2026-10-25T00:00:00Z', '25.10.2026'],
  ['Altwert 17:42 Uhr', '2026-10-20T17:42:00Z', '20.10.2026'],
  ['Altwert 23:59:59 Uhr', '2026-10-20T23:59:59Z', '20.10.2026'],
  ['Altwert 00:00:01 Uhr', '2026-10-20T00:00:01Z', '20.10.2026'],
  ['Altwert 1 s vor Berlin-Mitternacht (Sommer)', '2026-10-19T21:59:59Z', '19.10.2026'],
  ['Altwert exakt Berlin-Mitternacht (Sommer)', '2026-10-19T22:00:00Z', '19.10.2026'],
  ['Altwert exakt Berlin-Mitternacht (Winter)', '2026-12-09T23:00:00Z', '09.12.2026'],
]

const dec = (n: number) => ({ toNumber: () => n })
const company = { companyName: 'TWIR GmbH', logoScale: 1, logoStorageKey: null, logoPath: null }

beforeEach(() => {
  vi.clearAllMocks()
  m.getCompanySnapshot.mockResolvedValue(company)
  m.loadLogo.mockResolvedValue(undefined)
  m.poFindFirst.mockResolvedValue(null)
})

const customer = { name: 'Kunde AG', street: 'Weg', houseNumber: '1', postalCode: '70000', city: 'Stuttgart', vatId: null, contacts: [], country: 'DE' }
const invItem = { position: 1, description: 'Arbeit', quantity: dec(1), unit: 'Std', unitPrice: dec(100), discountRate: null, taxRate: dec(19), netAmount: dec(100), grossAmount: dec(119), notes: null, taxAmount: dec(19) }

describe.each(ZONES)('PDF-Kalendertage in Zone %s', (zone) => {
  beforeEach(() => { process.env.TZ = zone })

  it.each(DATES)('Rechnung (final): %s', async (_label, stored, expected) => {
    const d = new Date(stored)
    m.getInvoiceById.mockResolvedValue({
      invoiceNumber: 'RE-1', invoiceDate: d, dueDate: d, deliveryDate: d, order: { orderNumber: 'AU-1' }, introText: null, outroText: null,
      companySnapshot: null, customerSnapshot: null, customer, items: [invItem], totalNet: dec(100), totalTax: dec(19), totalGross: dec(119),
    })
    const data = await getInvoicePdfData('i1')
    expect([data.invoiceDate, data.dueDate, data.deliveryDate]).toEqual([expected, expected, expected])
  })

  it.each(DATES)('Rechnung (Entwurfsvorschau): %s', async (_label, stored, expected) => {
    const d = new Date(stored)
    m.customerFindFirst.mockResolvedValue({ id: 'c1', ...customer })
    m.resolveRecipient.mockResolvedValue({ name: 'Kunde AG' })
    const data = await getInvoiceDraftPdfData({
      customerId: 'c1', invoiceDate: d, dueDate: d, deliveryDate: d, introText: null, outroText: null, invoiceRecipientSource: 'CUSTOMER',
      items: [{ position: 1, description: 'Arbeit', quantity: 1, unit: 'Std', unitPrice: 100, taxRate: 19, discountRate: 0 }],
    } as never)
    expect([data.invoiceDate, data.dueDate, data.deliveryDate]).toEqual([expected, expected, expected])
  })

  it.each(DATES)('Angebot: %s', async (_label, stored, expected) => {
    const d = new Date(stored)
    m.getOfferById.mockResolvedValue({
      offerNumber: 'AN-1', offerDate: d, validUntil: d, title: 'T', introText: null, outroText: null, companySnapshot: null, customerSnapshot: null,
      customer, items: [invItem], totalNet: dec(100), totalTax: dec(19), totalGross: dec(119),
    })
    const data = await getOfferPdfData('o1')
    expect([data.offerDate, data.validUntil]).toEqual([expected, expected])
  })

  it.each(DATES)('Auftrag: %s', async (_label, stored, expected) => {
    const d = new Date(stored)
    m.getOrderById.mockResolvedValue({
      orderNumber: 'AU-1', orderDate: d, startDate: d, endDate: d, title: 'T', description: null, offer: null, companySnapshot: null, customerSnapshot: null,
      customer, items: [invItem], totalNet: dec(100), totalTax: dec(19), totalGross: dec(119),
    })
    const data = await getOrderPdfData('a1', FULL_ORDER_PDF_OPTIONS)
    expect([data.orderDate, data.startDate, data.endDate]).toEqual([expected, expected, expected])
  })

  // Integration WF-1A + B-3: Kundenbestellungsdatum ist ein Kalendertag und darf nicht von der Prozess-Zeitzone abhängen.
  it.each(DATES)('Auftrag, Kundenbestelldatum: %s', async (_label, stored, expected) => {
    const d = new Date(stored)
    m.poFindFirst.mockResolvedValue({ orderNumber: 'PO-1', orderDate: d })
    m.getOrderById.mockResolvedValue({
      orderNumber: 'AU-1', orderDate: d, startDate: d, endDate: d, title: 'T', description: null, offer: null, offerId: null, companySnapshot: null, customerSnapshot: null,
      customer, items: [invItem], totalNet: dec(100), totalTax: dec(19), totalGross: dec(119),
    })
    const data = await getOrderPdfData('a1', FULL_ORDER_PDF_OPTIONS)
    expect(data.customerOrderDate).toBe(expected)
  })

  it.each(DATES)('Leistungsnachweis (final): %s', async (_label, stored, expected) => {
    const d = new Date(stored)
    m.getServiceReportById.mockResolvedValue({
      reportNumber: 'LN-1', reportDate: d, title: 'T', description: null, companySnapshot: null, customerSnapshot: null,
      order: { orderNumber: 'AU-1', title: 'T', offer: null, customer, customerSnapshot: null }, createdBy: { firstName: 'A', lastName: 'B' },
      items: [{ position: 1, type: 'hours', description: 'x', quantity: dec(1), unit: 'Std', unitPrice: dec(100), netAmount: dec(100), notes: null }], totalNet: dec(100),
    })
    expect((await getServiceReportPdfData('r1', 'u1', 'ADMIN' as never)).reportDate).toBe(expected)
  })

  it.each(DATES)('Leistungsnachweis (Entwurfsvorschau): %s', async (_label, stored, expected) => {
    const d = new Date(stored)
    m.orderFindFirst.mockResolvedValue({ orderNumber: 'AU-1', title: 'T', customerSnapshot: null, customer, offer: null })
    m.userFindFirst.mockResolvedValue({ firstName: 'A', lastName: 'B' })
    const data = await getServiceReportDraftPdfData({
      orderId: 'a1', reportDate: d, title: 'T', description: null,
      items: [{ position: 1, type: 'hours', description: 'x', quantity: 1, unit: 'Std', unitPrice: 100, notes: null }],
    } as never, 'u1', 'ADMIN' as never)
    expect(data.reportDate).toBe(expected)
  })
})

// ── Schrankakte: Kalendertage (Bestandsaufnahme, Prüfung, Maßnahmenfrist, Prüfnachweis) und Instants (Historie, Erstellung) ──
function cabinetFixture(day: Date, instant: Date) {
  const status = {
    lifecycleStage: 'PLANUNG', bestandsaufnahmeAbgeschlossen: true, montagefortschritt: null, betriebsstatus: 'OK', betriebsstatusTageBisFaellig: null,
  }
  return {
    kennung: 'K-1', bezeichnung: 'Schrank', project: { name: 'P', projectNumber: 'P-1' }, status, checklistItems: [], approvals: [], blockers: [],
    tasks: [{ title: 'Maßnahme', status: 'TODO', dueDate: day, stage: { code: 'UMSETZUNG' }, responsibleMembership: null }],
    documents: [{ originalName: 'f.pdf', documentKind: 'Foto', visibility: 'INTERNAL', createdAt: instant, uploadedBy: { firstName: 'A', lastName: 'B' } }],
    bestandsaufnahmeAm: day, letztePruefungAm: day, exAssessmentStatus: 'OFFEN',
  }
}
function sectionValue(data: { sections: Array<{ key: string; rows: Array<{ label: string; value: string }> }> }, key: string, label: string) {
  return data.sections.find((s) => s.key === key)?.rows.find((r) => r.label.startsWith(label))?.value ?? ''
}

describe.each(ZONES)('Schrankakte-Daten in Zone %s', (zone) => {
  beforeEach(() => { process.env.TZ = zone })

  it.each(DATES)('Kalendertage: %s', async (_label, stored, expected) => {
    const d = new Date(stored)
    m.cabinetDetail.mockResolvedValue(cabinetFixture(d, new Date('2026-10-13T10:00:00Z')))
    m.cabinetHistory.mockResolvedValue([])
    m.cabinetPruef.mockResolvedValue([{ pruefart: 'LUEFTUNG', ergebnis: 'BESTANDEN', pruefdatum: d, documentId: null, ausfuehrendeStelle: null, bemerkung: null, createdAt: new Date('2026-10-13T10:00:00Z') }])
    const data = await getGgaCabinetSchrankaktePdfData('c1')
    expect(sectionValue(data as never, 'D', 'Durchgeführt am')).toBe(expected)
    expect(sectionValue(data as never, 'J', 'Letzte Prüfung')).toBe(expected)
    expect(sectionValue(data as never, 'G', 'Maßnahme')).toContain(`fällig ${expected}`)
  })

  it('Instants (Historie, Dokument-Upload) werden unabhängig von der Prozess-Zeitzone in Europe/Berlin dargestellt', async () => {
    // 13.10.2026 22:30 UTC = 14.10.2026 00:30 Berlin (Sommerzeit)
    const instant = new Date('2026-10-13T22:30:00Z')
    m.cabinetDetail.mockResolvedValue(cabinetFixture(new Date('2026-10-13T00:00:00Z'), instant))
    m.cabinetHistory.mockResolvedValue([{ id: 'h1', createdAt: instant, entityType: 'gga_cabinet', action: 'UPDATE', user: null, userEmail: 'x@y.z' }])
    m.cabinetPruef.mockResolvedValue([])
    const data = await getGgaCabinetSchrankaktePdfData('c1')
    expect(data.historyRows[0].at).toBe('14.10.2026 00:30')
    expect(sectionValue(data as never, 'M', 'f.pdf')).toContain('am 14.10.2026')
  })

  it('„Erstellt am“ der Schrankakte ist der Berliner Zeitpunkt der gefälschten Systemzeit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-12-31T23:30:00Z')) // Berlin: 01.01.2027 00:30
      m.cabinetDetail.mockResolvedValue(cabinetFixture(new Date('2026-10-13T00:00:00Z'), new Date('2026-10-13T10:00:00Z')))
      m.cabinetHistory.mockResolvedValue([]); m.cabinetPruef.mockResolvedValue([])
      expect((await getGgaCabinetSchrankaktePdfData('c1')).generatedAt).toBe('01.01.2027 00:30')
    } finally { vi.useRealTimers() }
  })
})
