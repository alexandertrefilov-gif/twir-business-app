import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { RoleName } from '@/types/enums'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth/options', () => ({ authOptions: {} }))
vi.mock('@/lib/services/invoice-pdf.service', () => ({
  getInvoiceDraftPdfData: vi.fn().mockResolvedValue({ invoiceNumber: null }),
}))
vi.mock('@/lib/pdf-templates/invoice.template', () => ({
  renderInvoicePdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-invoice-preview')),
}))

import { getInvoiceDraftPdfData } from '@/lib/services/invoice-pdf.service'
import { renderInvoicePdf } from '@/lib/pdf-templates/invoice.template'
import { POST } from '@/app/api/invoices/preview/route'

const session = { user: { id: 'user-1', email: 'user@example.com', role: RoleName.ACCOUNTING }, expires: '2099-01-01' }
const draft = {
  customerId: '11111111-1111-4111-8111-111111111111', invoiceRecipientSource: 'CUSTOMER',
  invoiceDate: '2026-09-01', items: [{ position: 1, description: 'Beratung', quantity: 2, unit: 'Std.', unitPrice: 100, taxRate: 19 }],
}
const request = (body: unknown) => POST(new Request('http://localhost/api/invoices/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

describe('Rechnungs-Entwurfsvorschau', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rendert einen ungespeicherten Entwurf als PDF', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const response = await request(draft)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(getInvoiceDraftPdfData).toHaveBeenCalledWith(expect.objectContaining({ customerId: draft.customerId }), undefined)
    expect(renderInvoicePdf).toHaveBeenCalledWith({ invoiceNumber: null })
  })

  it('validiert den Entwurf vor dem Rendern', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const response = await request({ ...draft, items: [] })
    expect(response.status).toBe(400)
    expect(getInvoiceDraftPdfData).not.toHaveBeenCalled()
  })

  it('verweigert unangemeldete Vorschauen', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const response = await request(draft)
    expect(response.status).toBe(401)
    expect(getInvoiceDraftPdfData).not.toHaveBeenCalled()
  })

  it('verwendet für vorhandene Entwürfe die Update-Berechtigung', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const invoiceId = '22222222-2222-4222-8222-222222222222'
    const response = await request({ ...draft, invoiceId })
    expect(response.status).toBe(200)
    expect(getInvoiceDraftPdfData).toHaveBeenCalledWith(expect.any(Object), invoiceId)
  })
})
