import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getDocumentById: vi.fn(),
  readFile: vi.fn(),
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

import { GET } from '@/app/api/documents/[id]/download/route'

describe('Dokumentdownload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STORAGE_LOCAL_PATH = '/tmp/twir-test-documents'
  })

  it('liefert gespeicherte Binärdaten mit den bestehenden Download-Headern', async () => {
    const file = Buffer.from([0, 1, 2, 127, 128, 255])
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.test' },
    })
    mocks.getDocumentById.mockResolvedValue({
      storagePath: 'document.pdf',
      mimeType: 'application/pdf',
      originalName: 'Prüfung.pdf',
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
    expect(response.headers.get('content-disposition'))
      .toBe('attachment; filename="Pr%C3%BCfung.pdf"')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(file)
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
