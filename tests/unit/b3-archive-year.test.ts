// REQ-029 P5-6 B-3 / A4: Das Archivjahr eines fachlichen Kalendertags darf nicht von der Prozess-Zeitzone abhängen.
// - Kalendertag-Felder (offerDate, orderDate, invoiceDate): Jahr über die UTC-Kalenderkomponenten (auch bei Altwerten mit Uhrzeit).
// - Echter Zeitpunkt (Kunde.createdAt): Jahr des Berliner Geschäftstags.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  settings: vi.fn(), offerFind: vi.fn(), orderFind: vi.fn(), reportFind: vi.fn(), invoiceFind: vi.fn(),
  docFindFirst: vi.fn(), docCreate: vi.fn(), docUpdate: vi.fn(), docUpdateMany: vi.fn(), ensureDirectory: vi.fn(), writeFile: vi.fn(),
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    companySetting: { findFirst: m.settings },
    offer: { findUnique: m.offerFind }, order: { findUnique: m.orderFind }, serviceReport: { findUnique: m.reportFind }, invoice: { findUnique: m.invoiceFind },
    document: { findFirst: m.docFindFirst, create: m.docCreate, update: m.docUpdate, updateMany: m.docUpdateMany },
  },
}))
vi.mock('@/lib/services/audit.service', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/services/offer-pdf.service', () => ({ getOfferPdfData: vi.fn(async () => ({})) }))
vi.mock('@/lib/services/order-pdf.service', () => ({ getOrderPdfData: vi.fn(async () => ({})) }))
vi.mock('@/lib/services/service-report-pdf.service', () => ({ getServiceReportPdfData: vi.fn(async () => ({})) }))
vi.mock('@/lib/services/invoice-pdf.service', () => ({ getInvoicePdfData: vi.fn(async () => ({})) }))
vi.mock('@/lib/pdf-templates/offer.template', () => ({ renderOfferPdf: vi.fn(async () => Buffer.from('p')) }))
vi.mock('@/lib/pdf-templates/order.template', () => ({ renderOrderPdf: vi.fn(async () => Buffer.from('p')) }))
vi.mock('@/lib/pdf-templates/service-report.template', () => ({ renderServiceReportPdf: vi.fn(async () => Buffer.from('p')) }))
vi.mock('@/lib/pdf-templates/invoice.template', () => ({ renderInvoicePdf: vi.fn(async () => Buffer.from('p')) }))
vi.mock('@/lib/documents/document-docx', () => ({ renderBusinessDocumentDocx: vi.fn(async () => Buffer.from('d')) }))
vi.mock('@/lib/documents/archive-storage', () => ({
  LocalFilesystemArchiveStorage: class { ensureDirectory = m.ensureDirectory; writeFile = m.writeFile },
}))

import { archiveBusinessDocument } from '@/lib/documents/document-archive.service'
import { ensureCustomerArchiveDirectory } from '@/lib/documents/customer-archive.service'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'] as const
const originalTz = process.env.TZ
afterEach(() => { vi.useRealTimers(); if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })

const actor = { userId: 'u1', userEmail: 'u@x.y', role: 'ADMIN' as never }
const customerRow = { number: 'KD-1', name: 'Kunde' }

/** [Bezeichnung, gespeicherter Kalendertag, erwartetes Archivjahr] */
const CALENDAR_YEARS: Array<[string, string, number]> = [
  ['Silvester', '2026-12-31T00:00:00Z', 2026],
  ['Neujahr', '2027-01-01T00:00:00Z', 2027],
  ['Schaltjahr 29.02.', '2028-02-29T00:00:00Z', 2028],
  ['Altwert Silvester 23:30 UTC', '2026-12-31T23:30:00Z', 2026],
  ['Altwert Silvester 23:59:59 UTC', '2026-12-31T23:59:59Z', 2026],
  ['Altwert Neujahr 00:30 UTC', '2027-01-01T00:30:00Z', 2027],
  ['Altwert Silvester 22:30 UTC (Berlin 23:30)', '2026-12-31T22:30:00Z', 2026],
]
/** [Bezeichnung, echter Zeitpunkt, erwartetes Berliner Geschäftsjahr] */
const INSTANT_YEARS: Array<[string, string, number]> = [
  ['Berlin 23:59:59 Silvester', '2026-12-31T22:59:59Z', 2026],
  ['Berlin 00:00:00 Neujahr', '2026-12-31T23:00:00Z', 2027],
  ['Neujahr 00:00 UTC (Berlin 01:00)', '2027-01-01T00:00:00Z', 2027],
  ['Mitte des Jahres', '2026-06-30T12:00:00Z', 2026],
  ['Sommerzeit: 31.12. 22:00 UTC ist noch 2026 in Berlin (CET)', '2026-12-31T22:00:00Z', 2026],
]

beforeEach(() => {
  vi.clearAllMocks()
  m.settings.mockResolvedValue({ documentArchiveEnabled: true, documentArchivePath: '/archive', documentArchiveJsonEnabled: false })
  m.docFindFirst.mockResolvedValue(null)
  m.docCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `d-${String(data.format)}`, ...data }))
  m.docUpdate.mockResolvedValue({}); m.docUpdateMany.mockResolvedValue({}); m.writeFile.mockResolvedValue(undefined); m.ensureDirectory.mockResolvedValue(undefined)
})

function archivedYear(): number {
  const first = m.docCreate.mock.calls[0]?.[0]?.data?.storagePath as string | undefined
  if (!first) throw new Error('kein Dokument angelegt')
  return Number(first.split('/')[0])
}

function rowFor(kind: string, stored: string) {
  const d = new Date(stored)
  const base = { id: 'x1', customerId: 'c1', customer: customerRow, areaName: 'Bereich', title: 'T', status: 'DRAFT', documents: [] }
  if (kind === 'offer') m.offerFind.mockResolvedValue({ ...base, offerNumber: 'AN-1', offerDate: d, sentAt: null })
  if (kind === 'order') m.orderFind.mockResolvedValue({ ...base, orderNumber: 'AU-1', orderDate: d, offer: null, completedAt: null })
  if (kind === 'serviceReport') m.reportFind.mockResolvedValue({ ...base, reportNumber: 'LN-1', orderId: 'o1', finalizedAt: null,
    order: { ...base, orderDate: d, offer: null, customerId: 'c1', customer: customerRow } })
  if (kind === 'invoice') m.invoiceFind.mockResolvedValue({ ...base, invoiceNumber: 'RE-1', invoiceDate: d, order: null, finalizedAt: null })
}

describe.each(ZONES)('Archivjahr in Zone %s', (zone) => {
  beforeEach(() => { process.env.TZ = zone })

  for (const kind of ['offer', 'order', 'serviceReport', 'invoice'] as const) {
    it.each(CALENDAR_YEARS)(`${kind}: %s`, async (_label, stored, year) => {
      rowFor(kind, stored)
      const result = await archiveBusinessDocument(kind, 'x1', 'DRAFT', actor)
      expect(result.status).toBe('archived')
      expect(archivedYear()).toBe(year)
    })
  }

  it.each(INSTANT_YEARS)('Kundenarchiv (createdAt = echter Zeitpunkt): %s', async (_label, instant, year) => {
    const result = await ensureCustomerArchiveDirectory({ number: 'KD-1', name: 'Kunde', createdAt: new Date(instant) })
    expect(result.status).toBe('created')
    expect(Number(m.ensureDirectory.mock.calls[0][0].split('/')[0])).toBe(year)
  })

  it('Kundenarchiv ohne createdAt nutzt den Berliner Geschäftstag der Systemzeit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z')) // Berlin 01.01.2027 00:30
    await ensureCustomerArchiveDirectory({ number: 'KD-1', name: 'Kunde' })
    expect(Number(m.ensureDirectory.mock.calls[0][0].split('/')[0])).toBe(2027)
  })
})
