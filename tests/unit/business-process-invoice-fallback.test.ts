import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleName } from '@/types/enums'

const { orderFindFirst, offerFindFirst, serviceReportFindUnique } = vi.hoisted(() => ({
  orderFindFirst: vi.fn(),
  offerFindFirst: vi.fn(),
  serviceReportFindUnique: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    order: { findFirst: orderFindFirst },
    offer: { findFirst: offerFindFirst },
    serviceReport: { findUnique: serviceReportFindUnique },
    invoice: { findUnique: vi.fn() },
  },
}))

import {
  getBusinessProcessForInvoice,
  getBusinessProcessForOffer,
  getBusinessProcessForServiceReport,
} from '@/lib/services/business-process.service'

describe('Rechnungs-Workflow bei fehlender historischer Auftragskette', () => {
  beforeEach(() => vi.clearAllMocks())

  it('zeigt die Rechnung weiter an, wenn der optionale Auftrag nicht mehr verfügbar ist', async () => {
    orderFindFirst.mockResolvedValue(null)
    const process = await getBusinessProcessForInvoice('invoice-1', 'user-1', RoleName.ACCOUNTING, {
      id: 'invoice-1',
      invoiceNumber: 'RE2026-0001',
      status: 'FINALIZED',
      type: 'STANDARD',
      orderId: 'missing-order',
    })

    expect(process).toEqual({
      project: null,
      offer: null,
      order: null,
      serviceReports: [],
      invoices: [{ id: 'invoice-1', number: 'RE2026-0001', status: 'FINALIZED', type: 'STANDARD' }],
    })
  })

  it('verschluckt keine technischen Datenbankfehler', async () => {
    orderFindFirst.mockRejectedValue(new Error('database unavailable'))
    await expect(getBusinessProcessForInvoice('invoice-1', 'user-1', RoleName.ACCOUNTING, {
      id: 'invoice-1', invoiceNumber: null, status: 'DRAFT', type: 'STANDARD', orderId: 'order-1',
    })).rejects.toThrow('database unavailable')
  })

  it('hält einen Leistungsnachweis bei fehlender Auftragskette lesbar', async () => {
    serviceReportFindUnique.mockResolvedValue({ id: 'report-1', reportNumber: 'LN2026-0001', orderId: 'missing-order', status: 'FINALIZED', sentAt: null, confirmedAt: null, documents: [] })
    orderFindFirst.mockResolvedValue(null)
    const process = await getBusinessProcessForServiceReport('report-1', 'user-1', RoleName.ACCOUNTING)
    expect(process.serviceReports).toEqual([{ id: 'report-1', number: 'LN2026-0001', status: 'FINALIZED', sentAt: null, confirmedAt: null, confirmationDocuments: [] }])
    expect(process.order).toBeNull()
  })

  it('hält ein Angebot bei fehlendem Folgeauftrag lesbar', async () => {
    offerFindFirst.mockResolvedValue({ id: 'offer-1', offerNumber: 'AN 260901', status: 'ACCEPTED', order: { id: 'missing-order' } })
    orderFindFirst.mockResolvedValue(null)
    const process = await getBusinessProcessForOffer('offer-1', 'user-1', RoleName.ACCOUNTING)
    expect(process.offer).toEqual({ id: 'offer-1', number: 'AN 260901', status: 'ACCEPTED' })
    expect(process.order).toBeNull()
  })
})
