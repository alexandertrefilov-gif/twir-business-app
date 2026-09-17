import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArchiveEntry } from '@/lib/documents/archive-storage'

const mocks = vi.hoisted(() => ({
  offerStatus: 'DRAFT',
  offerAreaName: 'GGA Lagerplanung' as string | null,
  renderVersion: 'v1',
  records: new Map<string, Record<string, unknown>>(),
  writeFile: vi.fn(),
  writeAuditLog: vi.fn(),
  getOfferPdfData: vi.fn(),
  renderOfferPdf: vi.fn(),
  renderDocx: vi.fn(),
  companySettingFindFirst: vi.fn(),
  offerFindUnique: vi.fn(),
  documentFindFirst: vi.fn(),
  documentCreate: vi.fn(),
  documentUpdate: vi.fn(),
  documentUpdateMany: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    companySetting: { findFirst: mocks.companySettingFindFirst},
    offer: { findUnique: mocks.offerFindUnique },
    document: {
      findFirst: mocks.documentFindFirst,
      create: mocks.documentCreate,
      update: mocks.documentUpdate,
      updateMany: mocks.documentUpdateMany,
    },
  },
}))
vi.mock('@/lib/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/services/offer-pdf.service', () => ({ getOfferPdfData: mocks.getOfferPdfData }))
vi.mock('@/lib/pdf-templates/offer.template', () => ({ renderOfferPdf: mocks.renderOfferPdf }))
vi.mock('@/lib/documents/document-docx', () => ({ renderBusinessDocumentDocx: mocks.renderDocx }))
vi.mock('@/lib/services/order-pdf.service', () => ({ getOrderPdfData: vi.fn() }))
vi.mock('@/lib/services/service-report-pdf.service', () => ({ getServiceReportPdfData: vi.fn() }))
vi.mock('@/lib/services/invoice-pdf.service', () => ({ getInvoicePdfData: vi.fn() }))
vi.mock('@/lib/pdf-templates/order.template', () => ({ renderOrderPdf: vi.fn() }))
vi.mock('@/lib/pdf-templates/service-report.template', () => ({ renderServiceReportPdf: vi.fn() }))
vi.mock('@/lib/pdf-templates/invoice.template', () => ({ renderInvoicePdf: vi.fn() }))
vi.mock('@/lib/documents/archive-storage', () => ({
  LocalFilesystemArchiveStorage: class {
    writeFile = mocks.writeFile
  },
}))

import { archiveBusinessDocument, offerArchiveLifecycleError } from '@/lib/documents/document-archive.service'
import { isUserVisibleArchiveEntry } from '@/lib/documents/archive-explorer.service'

const actor = { userId: 'user-1', userEmail: 'test@example.com', role: 'ADMIN' as const }

function recordKey(input: { lifecycle?: unknown; format?: unknown }) {
  return `${String(input.lifecycle)}-${String(input.format)}`
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.offerStatus = 'DRAFT'
  mocks.offerAreaName = 'GGA Lagerplanung'
  mocks.renderVersion = 'v1'
  mocks.records.clear()
  mocks.companySettingFindFirst.mockResolvedValue({
    documentArchiveEnabled: true,
    documentArchivePath: '/archive',
    documentArchiveJsonEnabled: false,
  })
  mocks.offerFindUnique.mockImplementation(async () => ({
    id: 'offer-1', offerNumber: 'AN-260904', offerDate: new Date('2026-09-04'),
    customerId: 'customer-1', areaName: mocks.offerAreaName, title: 'Koordination / Fachbauleitung', status: mocks.offerStatus,
    documents: [],
    sentAt: mocks.offerStatus === 'DRAFT' ? null : new Date('2026-09-04'),
    customer: { number: 'KD-1', name: 'Kunde' },
  }))
  mocks.getOfferPdfData.mockImplementation(async () => ({ version: mocks.renderVersion }))
  mocks.renderOfferPdf.mockImplementation(async () => Buffer.from(`PDF-${mocks.renderVersion}`))
  mocks.renderDocx.mockImplementation(async () => Buffer.from(`PK-DOCX-${mocks.renderVersion}`))
  mocks.documentFindFirst.mockImplementation(async ({ where }: { where: { lifecycle: string; format: string } }) =>
    mocks.records.get(recordKey(where)) ?? null)
  mocks.documentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const record = { id: `document-${mocks.records.size + 1}`, ...data }
    mocks.records.set(recordKey(data), record)
    return record
  })
  mocks.documentUpdate.mockImplementation(async ({ where, data }: {
    where: { id: string }
    data: Record<string, unknown>
  }) => {
    const entry = [...mocks.records.entries()].find(([, record]) => record.id === where.id)
    if (!entry) throw new Error('Testdokument fehlt')
    const updated = { ...entry[1], ...data }
    mocks.records.set(entry[0], updated)
    return updated
  })
  mocks.documentUpdateMany.mockResolvedValue({ count: 0 })
  mocks.writeFile.mockResolvedValue(undefined)
  mocks.writeAuditLog.mockResolvedValue(undefined)
})

describe('Angebotsarchiv-Lebenszyklus', () => {
  it('erzeugt beim neuen Entwurf ausschließlich ersetzbare ENTWURF-Dateien', async () => {
    const result = await archiveBusinessDocument('offer', 'offer-1', 'DRAFT', actor)
    const paths = mocks.writeFile.mock.calls.map(([path]) => String(path))
    expect(result.status).toBe('archived')
    expect(paths).toEqual(expect.arrayContaining([
      expect.stringContaining('AN-260904_ENTWURF.pdf'),
      expect.stringContaining('AN-260904_ENTWURF.docx'),
    ]))
    expect(paths).toHaveLength(2)
    expect(paths.every((archivePath) => archivePath.includes('GGA-Lagerplanung'))).toBe(true)
    expect(paths.every((archivePath) => !archivePath.includes('Koordination-Fachbauleitung'))).toBe(true)
    expect(paths.every((path) => !path.includes('_FINAL.'))).toBe(true)
    expect(mocks.writeFile.mock.calls.every(([, , mode]) => mode === 'replace')).toBe(true)
  })

  it('verwendet für bestehende Angebote ohne Bereich kontrolliert den bisherigen Betreff', async () => {
    mocks.offerAreaName = null
    await archiveBusinessDocument('offer', 'offer-1', 'DRAFT', actor)
    const paths = mocks.writeFile.mock.calls.map(([archivePath]) => String(archivePath))
    expect(paths.every((archivePath) => archivePath.includes('Koordination-Fachbauleitung'))).toBe(true)
  })

  it('ersetzt beim Speichern die bestehenden Entwürfe, ohne FINAL oder Versionen anzulegen', async () => {
    await archiveBusinessDocument('offer', 'offer-1', 'DRAFT', actor)
    const recordCount = mocks.records.size
    mocks.writeFile.mockClear()
    mocks.renderVersion = 'v2'
    await archiveBusinessDocument('offer', 'offer-1', 'DRAFT', actor)

    expect(mocks.records.size).toBe(recordCount)
    expect(mocks.documentCreate).toHaveBeenCalledTimes(2)
    expect(mocks.writeFile).toHaveBeenCalledTimes(2)
    expect(mocks.writeFile.mock.calls.every(([path, , mode]) =>
      String(path).includes('_ENTWURF.') && mode === 'replace')).toBe(true)
    expect(mocks.writeFile.mock.calls.some(([, contents]) =>
      Buffer.from(contents).toString().includes('v2'))).toBe(true)
  })

  it('erzeugt FINAL erst nach dem fachlichen Übergang auf SENT', async () => {
    expect(offerArchiveLifecycleError('DRAFT', 'FINAL')).toContain('Angebotsentwurf')
    const rejected = await archiveBusinessDocument('offer', 'offer-1', 'FINAL', actor)
    expect(rejected).toMatchObject({ status: 'failed' })
    expect(mocks.writeFile).not.toHaveBeenCalled()

    mocks.offerStatus = 'SENT'
    const finalized = await archiveBusinessDocument('offer', 'offer-1', 'FINAL', actor)
    const paths = mocks.writeFile.mock.calls.map(([path]) => String(path))
    expect(finalized.status).toBe('archived')
    expect(paths).toEqual(expect.arrayContaining([
      expect.stringContaining('AN-260904_FINAL.pdf'),
      expect.stringContaining('AN-260904_FINAL.docx'),
    ]))
    expect(mocks.writeFile.mock.calls.every(([, , mode]) => mode === 'exclusive')).toBe(true)
  })

  it('überschreibt FINAL weder durch normales Speichern noch durch erneute Finalarchivierung', async () => {
    mocks.offerStatus = 'SENT'
    await archiveBusinessDocument('offer', 'offer-1', 'FINAL', actor)
    const finalWrites = mocks.writeFile.mock.calls.length

    const draftAttempt = await archiveBusinessDocument('offer', 'offer-1', 'DRAFT', actor)
    expect(draftAttempt).toMatchObject({ status: 'failed' })
    expect(mocks.writeFile).toHaveBeenCalledTimes(finalWrites)

    const repeatedFinal = await archiveBusinessDocument('offer', 'offer-1', 'FINAL', actor)
    expect(repeatedFinal).toEqual({ status: 'archived', documents: [] })
    expect(mocks.writeFile).toHaveBeenCalledTimes(finalWrites)
  })
})

describe('sichtbare Archivdateien', () => {
  const entry = (fileType: ArchiveEntry['fileType'], kind: ArchiveEntry['kind'] = 'file') => ({ kind, fileType })

  it('blendet technische JSON-Sidecars aus, lässt sie aber als Archivdateien bestehen', () => {
    expect(isUserVisibleArchiveEntry(entry('pdf'))).toBe(true)
    expect(isUserVisibleArchiveEntry(entry('docx'))).toBe(true)
    expect(isUserVisibleArchiveEntry(entry('json'))).toBe(false)
    expect(isUserVisibleArchiveEntry(entry('other', 'directory'))).toBe(true)
  })
})
