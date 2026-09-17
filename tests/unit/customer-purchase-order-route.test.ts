import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  saveCustomerPurchaseOrder: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', () => ({
  Action: { UPDATE: 'update', CREATE: 'create' },
  Resource: { OFFER: 'offer', DOCUMENT: 'document' },
  requirePermission: mocks.requirePermission,
  toHttpError: (error: unknown) => ({ status: (error as { statusCode?: number }).statusCode ?? 500, message: error instanceof Error ? error.message : 'Fehler' }),
}))
vi.mock('@/lib/services/customer-purchase-order.service', () => ({ saveCustomerPurchaseOrder: mocks.saveCustomerPurchaseOrder }))

import { POST } from '@/app/api/offers/[id]/customer-purchase-order/route'

const actor = { userId: 'user-1', userEmail: 'office@example.test', role: 'OFFICE' }

function request(formData: FormData, accept = false) {
  return new NextRequest(`http://localhost/api/offers/offer-1/customer-purchase-order${accept ? '?accept=1' : ''}`, { method: 'POST', body: formData })
}

describe('Kundenbestellungs-Uploadroute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(actor)
    mocks.saveCustomerPurchaseOrder.mockResolvedValue('purchase-order-1')
  })

  it('nimmt ein Angebot ohne Datei an und verwendet die bestehende Statusfunktion genau einmal', async () => {
    const response = await POST(request(new FormData(), true), { params: Promise.resolve({ id: 'offer-1' }) })
    expect(response.status).toBe(200)
    expect(mocks.saveCustomerPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({ offerId: 'offer-1', file: undefined, actor }))
    expect(mocks.saveCustomerPurchaseOrder).toHaveBeenCalledOnce()
    expect(mocks.saveCustomerPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({ acceptOffer: true }))
  })

  it('übergibt eine PDF-Anlage ausschließlich an das angegebene Angebot', async () => {
    const form = new FormData()
    form.set('orderNumber', '4500123456')
    form.set('file', new File(['%PDF-1.7'], 'Bestellung.pdf', { type: 'application/pdf' }))
    const response = await POST(request(form), { params: Promise.resolve({ id: 'offer-42' }) })
    expect(response.status).toBe(200)
    expect(mocks.saveCustomerPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({
      offerId: 'offer-42', orderNumber: '4500123456',
      file: expect.objectContaining({ originalName: 'Bestellung.pdf', mimeType: 'application/pdf' }),
    }))
    expect(mocks.saveCustomerPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({ acceptOffer: false }))
    expect(mocks.requirePermission).toHaveBeenCalledTimes(2)
  })

  it('beendet die Anfrage vor Storage-Zugriff, wenn die Berechtigung fehlt', async () => {
    mocks.requirePermission.mockRejectedValue(Object.assign(new Error('Zugriff verweigert'), { statusCode: 403 }))
    const response = await POST(request(new FormData()), { params: Promise.resolve({ id: 'offer-1' }) })
    expect(response.status).toBe(403)
    expect(mocks.saveCustomerPurchaseOrder).not.toHaveBeenCalled()
  })

  it('meldet einen kombinierten Uploadfehler ohne einen zweiten Statusaufruf', async () => {
    mocks.saveCustomerPurchaseOrder.mockRejectedValue(Object.assign(new Error('Dateiinhalt ungültig'), { statusCode: 422 }))
    const form = new FormData()
    form.set('file', new File(['not a pdf'], 'Bestellung.pdf', { type: 'application/pdf' }))
    const response = await POST(request(form, true), { params: Promise.resolve({ id: 'offer-1' }) })
    expect(response.status).toBe(422)
    expect(mocks.saveCustomerPurchaseOrder).toHaveBeenCalledOnce()
    expect(mocks.saveCustomerPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({ acceptOffer: true }))
  })
})
