import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { RoleName } from '@/types/enums'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth/options', () => ({ authOptions: {} }))
vi.mock('@/lib/services/service-report-pdf.service', () => ({
  getServiceReportPdfData: vi.fn().mockResolvedValue({ reportNumber: 'LN-2026-0001' }),
}))
vi.mock('@/lib/pdf-templates/service-report.template', () => ({
  renderServiceReportPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-service-report')),
}))

import { getServiceReportPdfData } from '@/lib/services/service-report-pdf.service'
import { GET } from '@/app/api/services/[id]/pdf/route'

const session = { user: { id: 'user-1', email: 'user@example.com', role: RoleName.EMPLOYEE }, expires: '2099-01-01' }
const request = (query = '') => GET(new Request(`http://localhost/api/services/report-1/pdf${query}`), { params: Promise.resolve({ id: 'report-1' }) })

describe('Leistungsnachweis-PDF-Route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('nutzt für Vorschau und Download dieselbe berechtigte Datenpipeline', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const preview = await request()
    const download = await request('?download=true')
    expect(preview.headers.get('content-disposition')).toContain('inline')
    expect(download.headers.get('content-disposition')).toContain('attachment')
    expect(vi.mocked(getServiceReportPdfData).mock.calls[0]).toEqual(vi.mocked(getServiceReportPdfData).mock.calls[1])
    expect(getServiceReportPdfData).toHaveBeenCalledWith('report-1', 'user-1', RoleName.EMPLOYEE)
  })

  it('verweigert nicht angemeldeten Benutzern den Zugriff', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const response = await request()
    expect(response.status).toBe(401)
    expect(getServiceReportPdfData).not.toHaveBeenCalled()
  })
})
