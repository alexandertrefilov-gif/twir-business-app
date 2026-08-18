import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { RoleName } from '@/types/enums'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth/options', () => ({ authOptions: {} }))
vi.mock('@/lib/services/offer-pdf.service', () => ({
  getOfferPdfData: vi.fn().mockResolvedValue({
    offerNumber: 'AN-2026-0001',
  }),
}))
vi.mock('@/lib/pdf-templates/offer.template', () => ({
  renderOfferPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-preview')),
}))

import { getOfferPdfData } from '@/lib/services/offer-pdf.service'
import { GET } from '@/app/api/offers/[id]/preview/route'

const mockedGetServerSession = vi.mocked(getServerSession)
const mockedGetOfferPdfData = vi.mocked(getOfferPdfData)

function sessionFor(role: RoleName) {
  return {
    user: {
      id: `${role.toLowerCase()}-id`,
      email: `${role.toLowerCase()}@example.com`,
      role,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  }
}

function preview() {
  return GET(
    new Request('http://localhost/api/offers/offer-1/preview'),
    { params: Promise.resolve({ id: 'offer-1' }) },
  )
}

describe('Angebot-PDF-Vorschau', () => {
  beforeEach(() => vi.clearAllMocks())

  it('liefert berechtigten Rollen die echte PDF inline aus', async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(RoleName.OFFICE))

    const response = await preview()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="AN-2026-0001.pdf"',
    )
    expect(mockedGetOfferPdfData).toHaveBeenCalledWith('offer-1')
  })

  it('verweigert EMPLOYEE ohne offer:read die Vorschau vor dem Datenzugriff', async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(RoleName.EMPLOYEE))

    const response = await preview()

    expect(response.status).toBe(403)
    expect(mockedGetOfferPdfData).not.toHaveBeenCalled()
  })

  it('verweigert nicht angemeldeten Benutzern die Vorschau', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const response = await preview()

    expect(response.status).toBe(401)
    expect(mockedGetOfferPdfData).not.toHaveBeenCalled()
  })
})
