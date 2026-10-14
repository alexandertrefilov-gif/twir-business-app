import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceStatus } from '@/types/enums'

const { invoiceFindUnique, txInvoiceFindUnique, queryRaw } = vi.hoisted(() => ({
  invoiceFindUnique: vi.fn(),
  txInvoiceFindUnique: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    invoice: { findUnique: invoiceFindUnique },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => callback({
      $queryRaw: queryRaw,
      invoice: { findUnique: txInvoiceFindUnique },
    })),
  },
}))
vi.mock('@/lib/services/number-sequence.service', () => ({ nextNumber: vi.fn() }))
vi.mock('@/lib/services/audit.service', () => ({ buildAuditLogCreate: vi.fn() }))

import {
  calculateInvoiceForPersistence,
  findStaleCalculation,
  STALE_CALCULATION_HINT,
} from '@/lib/services/invoice-calculation.service'
import { updateInvoiceDraft } from '@/lib/services/invoice.service'
import { BusinessRuleError, NotFoundError } from '@/lib/auth/permissions'

const dec = (value: string) => ({ toFixed: () => value })
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('P4-A: zentrale Rechenquelle (Wrapper um lib/billing)', () => {
  it('einzelne Position 19 %', () => {
    const calc = calculateInvoiceForPersistence([{ quantity: 2, unitPrice: 10, taxRate: 19 }])
    expect(calc.calcVersion).toBe('twir-calc-1')
    expect(calc.lines[0]).toEqual({ netAmount: '20.00', taxAmount: '3.80', grossAmount: '23.80' })
    expect([calc.totalNet, calc.totalTax, calc.totalGross]).toEqual(['20.00', '3.80', '23.80'])
  })

  it('Steuer je Satz einmal gerundet: 3 × 0,50 € @19 % → Steuersumme 0,29 (Altlogik: 0,30)', () => {
    const calc = calculateInvoiceForPersistence([1, 2, 3].map(() => ({ quantity: 1, unitPrice: '0.50', taxRate: 19 })))
    expect(calc.totalNet).toBe('1.50')
    expect(calc.totalTax).toBe('0.29')
    expect(calc.totalGross).toBe('1.79')
    // Positionssteuer ist abgeleitet/informativ (D3): Σ kann von totalTax abweichen
    expect(calc.lines.map((l) => l.taxAmount)).toEqual(['0.10', '0.10', '0.10'])
  })

  it('gemischte Steuersätze 19 / 7 / 0', () => {
    const calc = calculateInvoiceForPersistence([
      { quantity: 1, unitPrice: 100, taxRate: 19 },
      { quantity: 1, unitPrice: 100, taxRate: 7 },
      { quantity: 1, unitPrice: 100, taxRate: 0 },
    ])
    expect([calc.totalNet, calc.totalTax, calc.totalGross]).toEqual(['300.00', '26.00', '326.00'])
  })

  it('Positionsnetto kaufmännisch gerundet (HALF_UP): 0,005 × 1,00 → 0,01', () => {
    expect(calculateInvoiceForPersistence([{ quantity: '0.005', unitPrice: '1.00', taxRate: 0 }]).lines[0].netAmount).toBe('0.01')
  })

  it('Rabatt wird in der Rechnung berücksichtigt', () => {
    const calc = calculateInvoiceForPersistence([{ quantity: 2, unitPrice: 10, taxRate: 19, discountRate: 10 }])
    expect(calc.lines[0].netAmount).toBe('18.00')
  })

  it('Zahl, String und Decimal-Objekt liefern identische Ergebnisse', () => {
    const a = calculateInvoiceForPersistence([{ quantity: 1.5, unitPrice: 19.99, taxRate: 19 }])
    const b = calculateInvoiceForPersistence([{ quantity: '1.5', unitPrice: '19.99', taxRate: '19' }])
    const c = calculateInvoiceForPersistence([{ quantity: dec('1.500'), unitPrice: dec('19.99'), taxRate: dec('19.00') }])
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })

  it('ungültige Werte und Einzelpreis mit mehr als 2 Nachkommastellen → BusinessRuleError', () => {
    expect(() => calculateInvoiceForPersistence([{ quantity: 'abc', unitPrice: 1, taxRate: 19 }])).toThrow(BusinessRuleError)
    expect(() => calculateInvoiceForPersistence([{ quantity: 1, unitPrice: '1.005', taxRate: 19 }])).toThrow(BusinessRuleError)
  })
})

describe('P4-A: Gegenprüfung bei Finalisierung (findStaleCalculation)', () => {
  const current = () => ({
    totalNet: dec('20.00'), totalTax: dec('3.80'), totalGross: dec('23.80'),
    items: [{
      position: 1, quantity: dec('2.000'), unitPrice: dec('10.00'), taxRate: dec('19.00'), discountRate: dec('0.00'),
      netAmount: dec('20.00'), taxAmount: dec('3.80'), grossAmount: dec('23.80'),
    }],
  })

  it('aktueller Entwurf → null', () => {
    expect(findStaleCalculation(current())).toBeNull()
  })

  it('Altbestand mit NULL-Rabatt wird blockiert', () => {
    const invoice = current()
    ;(invoice.items[0] as { discountRate: unknown }).discountRate = null
    expect(findStaleCalculation(invoice)).toMatch(/Altbestand/)
  })

  it('abweichende Summen oder Positionswerte werden erkannt', () => {
    expect(findStaleCalculation({ ...current(), totalTax: dec('3.81') })).toMatch(/Steuersumme/)
    expect(findStaleCalculation({ ...current(), totalNet: dec('20.01') })).toMatch(/Nettosumme/)
    const item = { ...current().items[0], grossAmount: dec('23.81') }
    expect(findStaleCalculation({ ...current(), items: [item] })).toMatch(/Position 1.*Brutto/)
  })

  it('Hinweistext vorhanden', () => {
    expect(STALE_CALCULATION_HINT).toMatch(/erneut speichern/)
  })
})

describe('P4-A: updateInvoiceDraft – Sperre und Statusprüfung', () => {
  const input = {
    customerId: 'c1', invoiceDate: new Date('2026-10-09'), items: [
      { position: 1, description: 'x', quantity: 1, unitPrice: 10, taxRate: 19 },
    ],
  } as never

  beforeEach(() => {
    vi.clearAllMocks()
    queryRaw.mockResolvedValue([{ id: 'inv-1' }])
  })

  it('finalisierte Rechnung wird unter Sperre abgewiesen', async () => {
    txInvoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.FINALIZED, buyerReference: null })
    await expect(updateInvoiceDraft('inv-1', input, 'u1', 'u@x.test')).rejects.toThrow(/Nur Rechnungsentwürfe/)
    expect(queryRaw).toHaveBeenCalledTimes(1)
  })

  it('unbekannte Rechnung → NotFoundError', async () => {
    queryRaw.mockResolvedValue([])
    await expect(updateInvoiceDraft('nope', input, 'u1', 'u@x.test')).rejects.toThrow(NotFoundError)
  })

  it('P4-B: ungültiger Rabatt wird vor jeder Datenbankarbeit abgewiesen', async () => {
    const bad = { ...(input as object), items: [{ position: 1, description: 'x', quantity: 1, unitPrice: 10, taxRate: 19, discountRate: 100.5 }] } as never
    await expect(updateInvoiceDraft('inv-1', bad, 'u1', 'u@x.test')).rejects.toThrow(/Position 1: Rabatt/)
    expect(queryRaw).not.toHaveBeenCalled()
  })
})

describe('P4-A: Quelltext-Garantien', () => {
  it('Server-Action und Vorschau rechnen nicht mehr selbst', () => {
    const actions = read('app/(dashboard)/invoices/actions.ts')
    expect(actions).not.toContain('Math.round')
    expect(actions).not.toContain('calculateTotals')
    expect(read('lib/services/invoice-pdf.service.ts')).toContain('calculateInvoiceForPersistence')
    expect(read('lib/services/invoice-pdf.service.ts')).not.toContain('Math.round')
  })

  it('Service: Sperre und Statusbedingung beim Bearbeiten, Löschen; Prüfung bei Finalisierung', () => {
    const service = read('lib/services/invoice.service.ts')
    expect(service.split('FOR UPDATE').length - 1).toBeGreaterThanOrEqual(2)
    expect(service).toContain('status: InvoiceStatus.DRAFT }')
    expect(service).toContain('findStaleCalculation(invoice)')
    expect(service).toContain('calcVersion')
  })
})
