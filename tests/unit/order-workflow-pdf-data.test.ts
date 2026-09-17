import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPLOYEE_ORDER_PDF_OPTIONS, FULL_ORDER_PDF_OPTIONS } from '@/lib/validators/order-pdf.schema'

vi.mock('@/lib/services/order.service', () => ({ getOrderById: vi.fn() }))
vi.mock('@/lib/services/settings.service', () => ({ getCompanySnapshot: vi.fn() }))
vi.mock('@/lib/services/company-logo-rendering.service', () => ({ loadCompanyLogoForPdf: vi.fn() }))

import { getOrderById } from '@/lib/services/order.service'
import { getCompanySnapshot } from '@/lib/services/settings.service'
import { loadCompanyLogoForPdf } from '@/lib/services/company-logo-rendering.service'
import { getOrderPdfData } from '@/lib/services/order-pdf.service'

const decimal = (value: number) => ({ toNumber: () => value })

describe('Auftragsworkflow und PDF-Daten', () => {
  beforeEach(() => {
    vi.mocked(getOrderById).mockResolvedValue({
      id: 'order-1', orderNumber: 'AU-1', orderDate: new Date('2026-08-19'),
      title: 'Montage', description: 'Ausführung', startDate: null, endDate: null,
      customerSnapshot: null, offer: { offerNumber: 'AN-1' },
      customer: { name: 'Kunde AG', street: 'Weg', houseNumber: '1', postalCode: '70000', city: 'Stuttgart', contacts: [] },
      items: [{ position: 1, description: 'Arbeit', quantity: decimal(2), unit: 'Std.', unitPrice: decimal(100), netAmount: decimal(200), taxRate: decimal(19), notes: 'intern' }],
      totalNet: decimal(200), totalTax: decimal(38), totalGross: decimal(238),
    } as never)
    vi.mocked(getCompanySnapshot).mockResolvedValue({ companyName: 'TWIR GmbH', logoPath: null } as never)
    vi.mocked(loadCompanyLogoForPdf).mockResolvedValue(undefined)
  })

  it('entfernt kaufmännische Werte schon aus den serverseitigen Mitarbeiterdaten', async () => {
    const data = await getOrderPdfData('order-1', EMPLOYEE_ORDER_PDF_OPTIONS)
    expect(data.items[0]).not.toHaveProperty('unitPrice')
    expect(data.items[0]).not.toHaveProperty('netAmount')
    expect(data.items[0]).not.toHaveProperty('taxRate')
    expect(data.items[0]).not.toHaveProperty('notes')
    expect(data).not.toHaveProperty('totalNet')
    expect(data).not.toHaveProperty('totalTax')
    expect(data).not.toHaveProperty('totalGross')
  })

  it('liefert kaufmännische Werte nur bei expliziter Vollversion', async () => {
    const data = await getOrderPdfData('order-1', FULL_ORDER_PDF_OPTIONS)
    expect(data.items[0]).toMatchObject({ unitPrice: 100, netAmount: 200, taxRate: 19, notes: 'intern' })
    expect(data).toMatchObject({ totalNet: 200, totalTax: 38, totalGross: 238 })
  })

  it('verknüpft vorhandene und fehlende Prozessdokumente statusabhängig', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    expect(source).toContain('stage.documents.map')
    expect(source).toContain('Leistungsnachweis erstellen')
    expect(source).toContain('process.invoices.length === 0')
    expect(source).toContain('process.serviceReports.length === 1')
    expect(source).toContain('<OrderPdfDialog orderId={documentId} />')
  })
})
