import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getArchiveStorage: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', () => ({
  Action: { READ: 'read' },
  Resource: { DOCUMENT: 'document', ACCOUNTING: 'accounting' },
  requirePermission: mocks.requirePermission,
  toHttpError: (error: unknown) => ({ status: (error as { statusCode?: number }).statusCode ?? 500, message: error instanceof Error ? error.message : 'Fehler' }),
}))

vi.mock('@/lib/documents/archive-explorer.service', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/documents/archive-explorer.service')>()
  return { ...original, getArchiveStorage: mocks.getArchiveStorage }
})

import { GET } from '@/app/api/document-archive/file/route'

describe('Archiv-Explorer-Dateiroute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ userId: 'user-1', role: 'ADMIN' })
    mocks.getArchiveStorage.mockResolvedValue({ stat: mocks.stat, readFile: mocks.readFile })
  })

  it('serves a PDF inline through the protected archive storage', async () => {
    mocks.stat.mockResolvedValue({ kind: 'file', fileType: 'pdf', size: 8 })
    mocks.readFile.mockResolvedValue(Buffer.from('%PDF-1.7'))
    const response = await GET(new NextRequest('http://localhost/api/document-archive/file?path=2026%2FAN-1.pdf&disposition=inline'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toContain('inline')
    expect(mocks.readFile).toHaveBeenCalledWith('2026/AN-1.pdf')
  })

  it('forces DOCX files to download with a readable filename', async () => {
    mocks.stat.mockResolvedValue({ kind: 'file', fileType: 'docx', size: 2 })
    mocks.readFile.mockResolvedValue(Buffer.from('PK'))
    const response = await GET(new NextRequest('http://localhost/api/document-archive/file?path=Pr%C3%BCfung.docx&disposition=inline'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('attachment')
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''Pr%C3%BCfung.docx")
  })

  it('rejects traversal before accessing archive storage', async () => {
    const response = await GET(new NextRequest('http://localhost/api/document-archive/file?path=..%2Fsecret.pdf'))
    expect(response.status).toBe(400)
    expect(mocks.getArchiveStorage).not.toHaveBeenCalled()
  })

  it('does not access storage when document permission is denied', async () => {
    const error = Object.assign(new Error('Zugriff verweigert'), { statusCode: 403 })
    mocks.requirePermission.mockRejectedValue(error)
    const response = await GET(new NextRequest('http://localhost/api/document-archive/file?path=2026%2Ffile.pdf'))
    expect(response.status).toBe(403)
    expect(mocks.getArchiveStorage).not.toHaveBeenCalled()
  })

  it('requires accounting:read before serving archived invoice files', async () => {
    const error = Object.assign(new Error('Zugriff verweigert'), { statusCode: 403 })
    mocks.requirePermission
      .mockResolvedValueOnce({ userId: 'user-1', role: 'PROJECT_MANAGER' })
      .mockRejectedValueOnce(error)
    const response = await GET(new NextRequest('http://localhost/api/document-archive/file?path=2026%2FKunde%2FVorgang%2F05_Rechnung%2FRE-1.pdf'))
    expect(response.status).toBe(403)
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(1, 'document', 'read')
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(2, 'accounting', 'read')
    expect(mocks.getArchiveStorage).not.toHaveBeenCalled()
  })
})
