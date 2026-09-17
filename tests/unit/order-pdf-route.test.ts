import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { RoleName } from '@/types/enums'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth/options', () => ({ authOptions: {} }))
vi.mock('@/lib/services/order-pdf.service', () => ({
  getOrderPdfData: vi.fn().mockResolvedValue({ orderNumber: 'AU-2026-0001' }),
}))
vi.mock('@/lib/pdf-templates/order.template', () => ({
  renderOrderPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-order')),
}))

import { getOrderPdfData } from '@/lib/services/order-pdf.service'
import { GET } from '@/app/api/orders/[id]/pdf/route'

const session = { user: { id: 'user-1', email: 'user@example.com', role: RoleName.EMPLOYEE }, expires: '2099-01-01' }

function request(query = '') {
  return GET(new Request(`http://localhost/api/orders/order-1/pdf${query}`), { params: Promise.resolve({ id: 'order-1' }) })
}

describe('Auftrags-PDF-Route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('erlaubt order:read und verwendet standardmäßig das preisfreie Preset', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('inline')
    expect(vi.mocked(getOrderPdfData)).toHaveBeenCalledWith('order-1', expect.objectContaining({
      showUnitPrices: false,
      showTotalPrices: false,
      showTax: false,
      showSummaries: false,
    }))
  })

  it('nutzt für Vorschau und Download dieselbe Datenpipeline', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const query = '?showUnitPrices=true&showTotalPrices=true&showTax=true&showSummaries=true'
    const preview = await request(query)
    const download = await request(`${query}&download=true`)
    expect(preview.headers.get('content-disposition')).toContain('inline')
    expect(download.headers.get('content-disposition')).toContain('attachment')
    expect(vi.mocked(getOrderPdfData).mock.calls[0]).toEqual(vi.mocked(getOrderPdfData).mock.calls[1])
  })

  it('verweigert nicht angemeldeten Benutzern den Datenzugriff', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const response = await request()
    expect(response.status).toBe(401)
    expect(getOrderPdfData).not.toHaveBeenCalled()
  })

  it('weist manipulierte Konfigurationswerte serverseitig zurück', async () => {
    vi.mocked(getServerSession).mockResolvedValue(session)
    const response = await request('?showUnitPrices=maybe')
    expect(response.status).toBe(400)
    expect(getOrderPdfData).not.toHaveBeenCalled()
  })
})
