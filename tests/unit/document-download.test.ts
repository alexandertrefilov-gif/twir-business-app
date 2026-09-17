import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getDocumentById: vi.fn(),
  readFile: vi.fn(),
  companySettingFindFirst: vi.fn(),
}))

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}))

vi.mock('@/lib/services/document.service', () => ({
  getDocumentById: mocks.getDocumentById,
}))

vi.mock('fs/promises', () => ({
  default: { readFile: mocks.readFile },
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: { companySetting: { findFirst: mocks.companySettingFindFirst } },
}))

import { GET } from '@/app/api/documents/[id]/download/route'

describe('Dokumentdownload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STORAGE_LOCAL_PATH = '/tmp/twir-test-documents'
  })

  it('liefert gespeicherte Binärdaten mit den bestehenden Download-Headern', async () => {
    const file = Buffer.from([0, 1, 2, 127, 128, 255])
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.test', role: 'ADMIN' },
    })
    mocks.getDocumentById.mockResolvedValue({
      storagePath: 'document.pdf',
      mimeType: 'application/pdf',
      originalName: 'Prüfung.pdf',
      lifecycle: 'UPLOAD',
      customerPurchaseOrderId: null,
      invoiceId: null,
      type: 'UPLOAD',
    })
    mocks.readFile.mockResolvedValue(file)

    const response = await GET(
      new NextRequest('http://localhost/api/documents/document-1/download'),
      { params: Promise.resolve({ id: 'document-1' }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-length')).toBe(String(file.length))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-disposition')).toContain('attachment;')
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''Pr%C3%BCfung.pdf")
    expect(Buffer.from(await response.arrayBuffer())).toEqual(file)
  })

  it('kann PDF-Bestellungen nach derselben Berechtigungsprüfung inline öffnen', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.test', role: 'ADMIN' } })
    mocks.getDocumentById.mockResolvedValue({ storagePath: 'order.pdf', mimeType: 'application/pdf', originalName: 'Bestellung.pdf', lifecycle: 'UPLOAD', customerPurchaseOrderId: null })
    mocks.readFile.mockResolvedValue(Buffer.from('%PDF'))
    const response = await GET(new NextRequest('http://localhost/api/documents/document-1/download?disposition=inline'), { params: Promise.resolve({ id: 'document-1' }) })
    expect(response.headers.get('content-disposition')).toContain('inline;')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('verweigert Rechnungsdokumente ohne accounting:read trotz document:read', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1', email: 'pm@example.test', role: 'PROJECT_MANAGER' } })
    mocks.getDocumentById.mockResolvedValue({ storagePath: 'invoice.pdf', mimeType: 'application/pdf', originalName: 'Rechnung.pdf', lifecycle: 'UPLOAD', invoiceId: 'invoice-1', type: 'INVOICE_PDF' })
    const response = await GET(new NextRequest('http://localhost/api/documents/document-1/download'), { params: Promise.resolve({ id: 'document-1' }) })
    expect(response.status).toBe(403)
    expect(mocks.readFile).not.toHaveBeenCalled()
  })

  it('liefert normale Projektdokumente mit document:read weiterhin aus', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1', email: 'pm@example.test', role: 'PROJECT_MANAGER' } })
    mocks.getDocumentById.mockResolvedValue({ storagePath: 'offer.pdf', mimeType: 'application/pdf', originalName: 'Angebot.pdf', lifecycle: 'UPLOAD', invoiceId: null, type: 'OFFER_PDF' })
    mocks.readFile.mockResolvedValue(Buffer.from('%PDF'))
    const response = await GET(new NextRequest('http://localhost/api/documents/document-1/download'), { params: Promise.resolve({ id: 'document-1' }) })
    expect(response.status).toBe(200)
  })

  it('liest für unangemeldete Benutzer keine Dokument- oder Dateidaten', async () => {
    mocks.getServerSession.mockResolvedValue(null)

    const response = await GET(
      new NextRequest('http://localhost/api/documents/document-1/download'),
      { params: Promise.resolve({ id: 'document-1' }) },
    )

    expect(response.status).toBe(401)
    expect(mocks.getDocumentById).not.toHaveBeenCalled()
    expect(mocks.readFile).not.toHaveBeenCalled()
  })
})
