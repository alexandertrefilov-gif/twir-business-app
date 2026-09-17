import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/auth/permissions', () => ({
  Action: { UPDATE: 'update', CREATE: 'create' },
  Resource: { ORDER: 'order', DOCUMENT: 'document' },
  requirePermission: mocks.requirePermission,
  toHttpError: (error: unknown) => ({ status: (error as { statusCode?: number }).statusCode ?? 500, message: error instanceof Error ? error.message : 'Fehler' }),
}))
vi.mock('@/lib/services/external-confirmation.service', () => ({ saveExternalConfirmation: mocks.save }))

import { POST } from '@/app/api/document-confirmations/[entityType]/[id]/route'

describe('gemeinsame Kundenbestätigungsroute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ userId: 'user-1', userEmail: 'office@example.test', role: 'OFFICE' })
    mocks.save.mockResolvedValue('document-1')
  })

  it('ordnet order genau dem Zielobjekt zu', async () => {
    const data = new FormData()
    data.set('file', new File(['%PDF-1.7'], 'Bestätigung.pdf', { type: 'application/pdf' }))
    data.set('confirmationType', 'SIGNED_DOCUMENT')
    const response = await POST(new NextRequest('http://localhost/api/document-confirmations/order/target-1', { method: 'POST', body: data }), {
      params: Promise.resolve({ entityType: 'order', id: 'target-1' }),
    })
    expect(response.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledOnce()
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ owner: 'order', id: 'target-1', file: expect.objectContaining({ originalName: 'Bestätigung.pdf' }) }))
    expect(mocks.requirePermission).toHaveBeenCalledTimes(2)
  })

  it('lehnt leere Uploads vor dem Service ab', async () => {
    const response = await POST(new NextRequest('http://localhost/api/document-confirmations/order/order-1', { method: 'POST', body: new FormData() }), {
      params: Promise.resolve({ entityType: 'order', id: 'order-1' }),
    })
    expect(response.status).toBe(422)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it.each(['EMAIL', 'VERBAL', 'CUSTOMER_PURCHASE_ORDER', 'NOT_REQUIRED'])('speichert %s ohne leeren Document-Upload', async confirmationType => {
    const data = new FormData()
    data.set('confirmationType', confirmationType)
    data.set('confirmedAt', '2026-09-10')
    data.set('confirmationNote', 'Vom Projektleiter dokumentiert')
    const response = await POST(new NextRequest('http://localhost/api/document-confirmations/order/order-1', { method: 'POST', body: data }), {
      params: Promise.resolve({ entityType: 'order', id: 'order-1' }),
    })
    expect(response.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'order', id: 'order-1', confirmationType, file: undefined,
      confirmationNote: 'Vom Projektleiter dokumentiert',
    }))
    expect(mocks.requirePermission).toHaveBeenCalledOnce()
  })

  it('lehnt SIGNED_DOCUMENT ohne Datei ab', async () => {
    const data = new FormData()
    data.set('confirmationType', 'SIGNED_DOCUMENT')
    const response = await POST(new NextRequest('http://localhost/api/document-confirmations/order/order-1', { method: 'POST', body: data }), {
      params: Promise.resolve({ entityType: 'order', id: 'order-1' }),
    })
    expect(response.status).toBe(422)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('lehnt einen unbekannten Dokumenttyp ab', async () => {
    const response = await POST(new NextRequest('http://localhost/api/document-confirmations/invoice/invoice-1', { method: 'POST', body: new FormData() }), {
      params: Promise.resolve({ entityType: 'invoice', id: 'invoice-1' }),
    })
    expect(response.status).toBe(404)
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
