import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  writeFile: vi.fn(), writeAuditLog: vi.fn(), renderDocx: vi.fn(),
  getOrderPdfData: vi.fn(), renderOrderPdf: vi.fn(),
  documentFindFirst: vi.fn(), documentCreate: vi.fn(), documentUpdate: vi.fn(), documentUpdateMany: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    companySetting: { findFirst: vi.fn().mockResolvedValue({ documentArchiveEnabled: true, documentArchivePath: '/archive', documentArchiveJsonEnabled: false }) },
    order: { findUnique: vi.fn().mockResolvedValue({
      id: 'order-1', orderNumber: 'AU-1', orderDate: new Date('2026-10-01'), customerId: 'c1', title: 'T', status: 'OPEN', completedAt: null,
      customer: { number: 'KD-1', name: 'Kunde' }, offer: null,
    }) },
    document: { findFirst: m.documentFindFirst, create: m.documentCreate, update: m.documentUpdate, updateMany: m.documentUpdateMany },
  },
}))
vi.mock('@/lib/services/audit.service', () => ({ writeAuditLog: m.writeAuditLog }))
vi.mock('@/lib/services/offer-pdf.service', () => ({ getOfferPdfData: vi.fn() }))
vi.mock('@/lib/pdf-templates/offer.template', () => ({ renderOfferPdf: vi.fn() }))
vi.mock('@/lib/documents/document-docx', () => ({ renderBusinessDocumentDocx: m.renderDocx }))
vi.mock('@/lib/services/order-pdf.service', () => ({ getOrderPdfData: m.getOrderPdfData }))
vi.mock('@/lib/pdf-templates/order.template', () => ({ renderOrderPdf: m.renderOrderPdf }))
vi.mock('@/lib/services/service-report-pdf.service', () => ({ getServiceReportPdfData: vi.fn() }))
vi.mock('@/lib/services/invoice-pdf.service', () => ({ getInvoicePdfData: vi.fn() }))
vi.mock('@/lib/pdf-templates/service-report.template', () => ({ renderServiceReportPdf: vi.fn() }))
vi.mock('@/lib/pdf-templates/invoice.template', () => ({ renderInvoicePdf: vi.fn() }))
vi.mock('@/lib/documents/archive-storage', () => ({ LocalFilesystemArchiveStorage: class { writeFile = m.writeFile } }))

import { archiveBusinessDocument } from '@/lib/documents/document-archive.service'
import { FULL_ORDER_PDF_OPTIONS } from '@/lib/validators/order-pdf.schema'

const actor = { userId: 'u1', userEmail: 'u@example.com', role: 'ADMIN' as const }

beforeEach(() => {
  vi.clearAllMocks()
  m.existing = null
  m.documentFindFirst.mockImplementation(async () => m.existing)
  m.documentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `d-${data.format}`, ...data }))
  m.documentUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data)
  m.getOrderPdfData.mockResolvedValue({ orderNumber: 'AU-1' })
  m.renderOrderPdf.mockResolvedValue(Buffer.from('%PDF-1'))
  m.renderDocx.mockResolvedValue(Buffer.from('PK'))
  m.writeFile.mockResolvedValue(undefined)
  m.writeAuditLog.mockResolvedValue(undefined)
})

describe('WF-1A Auftragsarchiv', () => {
  it('beschriftet das neue Auftragsdokument als Auftragsbestätigung', async () => {
    const result = await archiveBusinessDocument('order', 'order-1', 'FINAL', actor)
    expect(result.status).toBe('archived')
    expect(m.getOrderPdfData).toHaveBeenCalledWith('order-1', FULL_ORDER_PDF_OPTIONS)
    expect(m.renderDocx.mock.calls[0][1]).toBe('Auftragsbestätigung')
    expect(m.writeFile).toHaveBeenCalledTimes(2)
    for (const call of m.writeFile.mock.calls) expect(call[2]).toBe('exclusive')
  })

  it('behält Dateinamen auf Basis der Auftragsnummer (keine Umbenennung)', async () => {
    await archiveBusinessDocument('order', 'order-1', 'FINAL', actor)
    for (const call of m.writeFile.mock.calls) expect(String(call[0])).toContain('AU-1')
    for (const call of m.writeFile.mock.calls) expect(String(call[0])).not.toContain('Auftragsbest')
  })

  it('überschreibt ein bereits archiviertes FINAL-Dokument nicht', async () => {
    m.existing = { id: 'old', archiveStatus: 'ARCHIVED', storagePath: 'x/AU-1_FINAL.pdf' }
    const result = await archiveBusinessDocument('order', 'order-1', 'FINAL', actor)
    expect(result).toEqual({ status: 'archived', documents: [] })
    expect(m.writeFile).not.toHaveBeenCalled()
    expect(m.documentUpdate).not.toHaveBeenCalled()
    expect(m.renderDocx).not.toHaveBeenCalled()
  })
})
