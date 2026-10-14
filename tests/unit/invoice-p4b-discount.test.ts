// REQ-029 P4-B: Positionsrabatt durchgängig – Schema → Service/Calculator → Speicherung → Vorschau/PDF → Übernahme.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { customerFindUnique, invoiceCreate, transaction, auditMock } = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  invoiceCreate: vi.fn(),
  transaction: vi.fn(),
  auditMock: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => {
  const tx = { invoice: { create: invoiceCreate }, $queryRaw: vi.fn() }
  transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx))
  return { prisma: { customer: { findUnique: customerFindUnique }, $transaction: transaction } }
})
vi.mock('@/lib/services/number-sequence.service', () => ({ nextNumber: vi.fn() }))
vi.mock('@/lib/services/audit.service', () => ({ buildAuditLogCreate: auditMock }))

import { createInvoiceDraft } from '@/lib/services/invoice.service'
import { calculateInvoiceForPersistence, findStaleCalculation } from '@/lib/services/invoice-calculation.service'
import { InvoiceDraftSchema } from '@/lib/validators/invoice.schema'
import { renderInvoicePdf, type InvoicePdfData } from '@/lib/pdf-templates/invoice.template'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const dec = (value: string) => ({ toFixed: () => value })

describe('P4-B: Speicherung mit Rabatt über die zentrale Berechnung', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    customerFindUnique.mockResolvedValue({ id: 'c-1', name: 'Kunde', deletedAt: null, vatId: null, taxNumber: null })
    invoiceCreate.mockResolvedValue({ id: 'inv-1' })
    transaction.mockImplementation(async (callback: (t: unknown) => Promise<unknown>) => callback({ invoice: { create: invoiceCreate }, $queryRaw: vi.fn() }))
  })

  it('createInvoiceDraft speichert Rabattsatz und rabattiertes Netto/Steuer/Brutto (eine Rundung)', async () => {
    await createInvoiceDraft({
      customerId: 'c-1', invoiceRecipientSource: 'CUSTOMER', invoiceDate: new Date('2026-10-09'),
      items: [
        { position: 1, description: 'A', quantity: 2, unitPrice: 10, taxRate: 19, discountRate: '10' },
        { position: 2, description: 'B', quantity: 1, unitPrice: 1.15, taxRate: 19, discountRate: 30 },
      ],
    }, 'u-1', 'u@example.test')

    const data = invoiceCreate.mock.calls[0][0].data
    expect(data.items.create[0]).toMatchObject({ discountRate: '10.00', netAmount: '18.00', taxAmount: '3.42', grossAmount: '21.42' })
    expect(data.items.create[1]).toMatchObject({ discountRate: '30.00', netAmount: '0.81' })
    expect(data.totalNet).toBe('18.81')
    expect(data.totalTax).toBe('3.57') // 18,81 × 19 % = 3,5739 → einmal gerundet
    expect(data.totalGross).toBe('22.38')
  })

  it('Rabatt 100 % ergibt Netto 0,00', () => {
    const calc = calculateInvoiceForPersistence([{ quantity: 3, unitPrice: 25, taxRate: 19, discountRate: '100.00' }])
    expect(calc.lines[0].netAmount).toBe('0.00')
    expect([calc.totalNet, calc.totalTax, calc.totalGross]).toEqual(['0.00', '0.00', '0.00'])
  })

  it('Gegenprüfung der Finalisierung akzeptiert einen rabattierten, aktuell gespeicherten Entwurf', () => {
    const item = {
      position: 1, quantity: dec('2.000'), unitPrice: dec('10.00'), taxRate: dec('19.00'), discountRate: dec('10.00'),
      netAmount: dec('18.00'), taxAmount: dec('3.42'), grossAmount: dec('21.42'),
    }
    expect(findStaleCalculation({ totalNet: dec('18.00'), totalTax: dec('3.42'), totalGross: dec('21.42'), items: [item] })).toBeNull()
    // derselbe Entwurf mit Beträgen OHNE Rabatt (Altlogik) wird erkannt
    const old = { ...item, netAmount: dec('20.00'), taxAmount: dec('3.80'), grossAmount: dec('23.80') }
    expect(findStaleCalculation({ totalNet: dec('20.00'), totalTax: dec('3.80'), totalGross: dec('23.80'), items: [old] })).toMatch(/weicht/)
  })

  it('Schema und Service liefern für denselben Rabatt denselben kanonischen Wert', () => {
    const parsed = InvoiceDraftSchema.parse({
      customerId: '3f2c1d7a-8a54-4c63-9a53-0b7d5f4a1e11', invoiceDate: '2026-10-09',
      items: [{ position: 1, description: 'A', quantity: '1', unitPrice: '10', taxRate: 19, discountRate: '2.5' }],
    })
    expect(parsed.items[0].discountRate).toBe('2.50')
  })
})

describe('P4-B: Rechnungs-PDF mit Rabattspalte', () => {
  const base: InvoicePdfData = {
    invoiceNumber: 'RE2026-0002', invoiceDate: '09.10.2026',
    company: { companyName: 'TWIR', legalForm: 'GmbH', street: 'Wächtergasse', houseNumber: '10', postalCode: '71706', city: 'Markgröningen' },
    customer: { name: 'Kunde AG', street: 'Weg', houseNumber: '1', postalCode: '70000', city: 'Stuttgart' },
    items: [{ position: 1, description: 'Montage', quantity: 2, unit: 'Std.', unitPrice: 10, discountRate: 10, taxRate: 19, netAmount: 18, grossAmount: 21.42 }],
    totalNet: 18, totalTax: 3.42, totalGross: 21.42,
  }
  it('rendert mit und ohne Rabatt eine gültige PDF-Datei', async () => {
    expect((await renderInvoicePdf(base)).subarray(0, 4).toString()).toBe('%PDF')
    const noDiscount = { ...base, items: [{ ...base.items[0], discountRate: 0 }] }
    expect((await renderInvoicePdf(noDiscount)).subarray(0, 4).toString()).toBe('%PDF')
    const legacy = { ...base, items: [{ ...base.items[0], discountRate: undefined }] }
    expect((await renderInvoicePdf(legacy)).subarray(0, 4).toString()).toBe('%PDF')
  })

  it('Rabattspalte erscheint nur bei Rabatt > 0; Daten stammen aus Server-/Speicherwerten', () => {
    const template = read('lib/pdf-templates/invoice.template.tsx')
    expect(template).toContain("(item.discountRate ?? 0) > 0")
    expect(template).toContain('hasDiscount &&')
    const pdfService = read('lib/services/invoice-pdf.service.ts')
    expect(pdfService).toContain('discountRate: item.discountRate ? item.discountRate.toNumber() : 0')
    expect(pdfService).toContain('discountRate: Number(item.discountRate ?? 0)')
  })
})

describe('P4-B: Formular, Detail, Bearbeiten, Übernahme', () => {
  it('Formular: Rabattfeld, serverseitig dieselbe Prüfgrenze, Vorschau mit Rabatt, Versand im itemsJson', () => {
    const form = read('components/invoices/InvoiceForm.tsx')
    expect(form).toContain('DISCOUNT_SPEC')
    expect(form).toContain('discountRate: discount.value')
    expect(form).toContain("discountRate:r.discountRate.trim()||'0'")
    expect(form).toContain('Rabatt %')
    expect(form).not.toContain('Math.round')
  })

  it('Bearbeiten lädt den gespeicherten Rabatt (NULL → 0), Detailseite zeigt ihn nur bei Rabatt', () => {
    expect(read('app/(dashboard)/invoices/[id]/edit/page.tsx')).toContain('discountRate: (item.discountRate ?? 0).toString()')
    const detail = read('app/(dashboard)/invoices/[id]/page.tsx')
    expect(detail).toContain('hasDiscount')
    expect(detail).toContain('item.discountRate > 0')
  })

  it('Übernahme aus dem Leistungsnachweis blockiert nicht mehr wegen Rabatt', () => {
    const transfer = read('lib/billing/service-report-transfer.ts')
    expect(transfer).not.toContain('DISCOUNT_BLOCK_REASON_PREFIX')
    expect(transfer).toContain('discountRate')
  })

  it('E-Rechnungs-Datenmodell kennt den Positionsnachlass (BG-27), Rundungsableitung ausdrücklich offen', () => {
    const types = read('lib/export/e-rechnung.types.ts')
    expect(types).toContain('allowance?')
    expect(types).toContain('BT-136')
    expect(types).toContain('OFFEN')
  })
})
