import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { RoleName } from '@/types/enums'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth/options', () => ({ authOptions: {} }))
vi.mock('@/lib/services/service-report-pdf.service', () => ({
  getServiceReportDraftPdfData: vi.fn().mockResolvedValue({ reportNumber: 'Vorschau' }),
}))
vi.mock('@/lib/pdf-templates/service-report.template', () => ({
  renderServiceReportPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-service-report-preview')),
}))

import { Action, Resource } from '@/lib/auth/permissions'
import { renderServiceReportPdf } from '@/lib/pdf-templates/service-report.template'
import { getServiceReportDraftPdfData } from '@/lib/services/service-report-pdf.service'
import { POST } from '@/app/api/services/preview/route'

const session = { user: { id: 'user-1', email: 'user@example.com', role: RoleName.OFFICE }, expires: '2099-01-01' }
const orderId = '11111111-1111-4111-8111-111111111111'
const reportId = '22222222-2222-4222-8222-222222222222'
const draft = {
  orderId,
  title: 'Leistungsnachweis',
  description: 'A. Leistungsumfang\n\nE. Verschwiegenheitspflicht',
  reportDate: '2026-08-20',
  items: [{ position: 1, type: 'hours', description: 'Montage', quantity: 2, unit: 'Std.', unitPrice: 90, discountRate: 0, taxRate: 19, notes: null }],
}

function request(body: unknown) {
  return POST(new Request('http://localhost/api/services/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('Leistungsnachweis-Entwurfsvorschau', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rendert Neuanlagen mit dem finalen PDF-Renderer ohne Speicherung', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const response = await request(draft)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(getServiceReportDraftPdfData).toHaveBeenCalledWith(
      expect.objectContaining({ orderId, title: draft.title, description: draft.description }),
      'user-1',
      RoleName.OFFICE,
      undefined,
    )
    expect(renderServiceReportPdf).toHaveBeenCalledWith({ reportNumber: 'Vorschau' })
  })

  it('verwendet bei Bearbeitung UPDATE und den vorhandenen Nachweis-Snapshot', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const response = await request({ ...draft, reportId })

    expect(response.status).toBe(200)
    expect(getServiceReportDraftPdfData).toHaveBeenCalledWith(
      expect.any(Object), 'user-1', RoleName.OFFICE, reportId,
    )
  })

  it('validiert alle Inhalte vor dem Rendern', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const response = await request({ ...draft, reportDate: 'kein-datum' })

    expect(response.status).toBe(400)
    expect(getServiceReportDraftPdfData).not.toHaveBeenCalled()
    expect(renderServiceReportPdf).not.toHaveBeenCalled()
  })

  it('rendert eine Vorschau ohne optionale Positionskarte', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const response = await request({ ...draft, items: [] })

    expect(response.status).toBe(200)
    expect(getServiceReportDraftPdfData).toHaveBeenCalledWith(
      expect.objectContaining({ items: [] }),
      'user-1',
      RoleName.OFFICE,
      undefined,
    )
  })

  it('verweigert unangemeldete Vorschauen vor der Inhaltsvalidierung', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const response = await request({})

    expect(response.status).toBe(401)
    expect(getServiceReportDraftPdfData).not.toHaveBeenCalled()
  })

  it('dokumentiert die getrennten Berechtigungen für Neu und Bearbeiten', () => {
    expect(Resource.SERVICE_REPORT).toBe('service_report')
    expect(Action.CREATE).toBe('create')
    expect(Action.UPDATE).toBe('update')
  })
})
