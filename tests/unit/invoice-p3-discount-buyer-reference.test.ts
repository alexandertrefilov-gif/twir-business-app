// REQ-029 P3: Datenmodell M1/M2 – Rabattsperre, Käuferreferenz, Migrationsdateien.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceStatus } from '@/types/enums'

const {
  customerFindUnique, invoiceFindUnique, invoiceCreate, invoiceUpdate, invoiceUpdateMany,
  queryRaw, transaction, nextNumberMock, auditMock,
} = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceCreate: vi.fn(),
  invoiceUpdate: vi.fn(),
  invoiceUpdateMany: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  nextNumberMock: vi.fn(),
  auditMock: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => {
  const tx = {
    invoice: { findUnique: invoiceFindUnique, create: invoiceCreate, update: invoiceUpdate, updateMany: invoiceUpdateMany },
    $queryRaw: queryRaw,
  }
  transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx))
  return { prisma: { customer: { findUnique: customerFindUnique }, $transaction: transaction } }
})
vi.mock('@/lib/services/number-sequence.service', () => ({ nextNumber: nextNumberMock }))
vi.mock('@/lib/services/audit.service', () => ({ buildAuditLogCreate: auditMock }))

import {
  cancelInvoice,
  createInvoiceDraft,
  normalizeBuyerReference,
  normalizeInvoiceItemDiscount,
  updateInvoiceBuyerReference,
} from '@/lib/services/invoice.service'
import { InvoiceDraftSchema } from '@/lib/validators/invoice.schema'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

function baseDraft(overrides: Record<string, unknown> = {}, item: Record<string, unknown> = {}) {
  return {
    customerId: '3f2c1d7a-8a54-4c63-9a53-0b7d5f4a1e11',
    invoiceDate: '2026-10-08',
    items: [{ position: 1, description: 'Montage', quantity: '2', unit: 'Std.', unitPrice: '10.50', taxRate: 19, ...item }],
    ...overrides,
  }
}

describe('P4-B Schema: Positionsrabatt (0–100 %, höchstens 2 Nachkommastellen)', () => {
  it('ohne Angabe → ausdrücklich 0.00 (nie undefined/null)', () => {
    const parsed = InvoiceDraftSchema.safeParse(baseDraft())
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.items[0].discountRate).toBe('0.00')
  })

  it.each([['0', '0.00'], ['0.0', '0.00'], ['0.00', '0.00'], [0, '0.00'], ['000.00', '0.00'],
    ['0.01', '0.01'], ['5', '5.00'], [5, '5.00'], ['12.5', '12.50'], ['100', '100.00'], [100, '100.00'], ['99.99', '99.99']])(
    'akzeptiert %s und normalisiert auf %s', (value, expected) => {
      const parsed = InvoiceDraftSchema.safeParse(baseDraft({}, { discountRate: value }))
      expect(parsed.success).toBe(true)
      if (parsed.success) expect(parsed.data.items[0].discountRate).toBe(expected)
    })

  it.each(['-1', '100.01', '1.234', 'abc', '1e2', '5,5'])('lehnt ungültigen Rabatt %s ab (kein stilles Runden)', (value) => {
    const parsed = InvoiceDraftSchema.safeParse(baseDraft({}, { discountRate: value }))
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues[0].message).toContain('Position 1:')
  })

  it('meldet die richtige Positionsnummer', () => {
    const parsed = InvoiceDraftSchema.safeParse(baseDraft({
      items: [
        { position: 1, description: 'A', quantity: '1', unitPrice: '1', taxRate: 19 },
        { position: 2, description: 'B', quantity: '1', unitPrice: '1', taxRate: 19, discountRate: '100.5' },
      ],
    }))
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues[0].message).toContain('Position 2:')
  })
})

describe('P3 Schema: Käuferreferenz', () => {
  it('nicht übermittelt → undefined (bestehender Wert bleibt)', () => {
    const parsed = InvoiceDraftSchema.safeParse(baseDraft())
    expect(parsed.success && parsed.data.buyerReference).toBeUndefined()
  })
  it('leer/Whitespace → null, sonst getrimmt', () => {
    const empty = InvoiceDraftSchema.safeParse(baseDraft({ buyerReference: '   ' }))
    expect(empty.success && empty.data.buyerReference).toBeNull()
    const set = InvoiceDraftSchema.safeParse(baseDraft({ buyerReference: '  REF-1  ' }))
    expect(set.success && set.data.buyerReference).toBe('REF-1')
  })
  it('255 Zeichen ok, 256 abgelehnt', () => {
    expect(InvoiceDraftSchema.safeParse(baseDraft({ buyerReference: 'a'.repeat(255) })).success).toBe(true)
    const tooLong = InvoiceDraftSchema.safeParse(baseDraft({ buyerReference: 'a'.repeat(256) }))
    expect(tooLong.success).toBe(false)
  })
  it('lehnt Steuer-/Zeilenumbruchzeichen und Nicht-Strings ab', () => {
    expect(InvoiceDraftSchema.safeParse(baseDraft({ buyerReference: 'a\nb' })).success).toBe(false)
    expect(InvoiceDraftSchema.safeParse(baseDraft({ buyerReference: 12345 })).success).toBe(false)
  })
})

describe('P3 Service-Normalisierung', () => {
  it('Rabatt: fehlend → 0.00; gültige Werte kanonisch; ungültig → BusinessRuleError mit Position', () => {
    expect(normalizeInvoiceItemDiscount(undefined)).toBe('0.00')
    expect(normalizeInvoiceItemDiscount(null)).toBe('0.00')
    expect(normalizeInvoiceItemDiscount('')).toBe('0.00')
    expect(normalizeInvoiceItemDiscount(0)).toBe('0.00')
    expect(normalizeInvoiceItemDiscount('7.5')).toBe('7.50')
    expect(normalizeInvoiceItemDiscount(100)).toBe('100.00')
    expect(normalizeInvoiceItemDiscount({ toFixed: () => '12.50' })).toBe('12.50')
    expect(() => normalizeInvoiceItemDiscount('100.01', 3)).toThrow(/^Position 3: Rabatt darf höchstens 100/)
    expect(() => normalizeInvoiceItemDiscount('-0.01')).toThrow(/Rabatt/)
    expect(() => normalizeInvoiceItemDiscount('1.234')).toThrow(/Nachkommastellen/)
    expect(() => normalizeInvoiceItemDiscount(Number.NaN)).toThrow(/Rabatt/)
    expect(() => normalizeInvoiceItemDiscount({})).toThrow(/ungültig/)
  })
  it('Käuferreferenz: undefined/null/leer/trim/Länge', () => {
    expect(normalizeBuyerReference(undefined)).toBeUndefined()
    expect(normalizeBuyerReference(null)).toBeNull()
    expect(normalizeBuyerReference('  ')).toBeNull()
    expect(normalizeBuyerReference(' X ')).toBe('X')
    expect(normalizeBuyerReference('a'.repeat(255))).toHaveLength(255)
    expect(() => normalizeBuyerReference('a'.repeat(256))).toThrow(/255/)
    expect(() => normalizeBuyerReference('a\tb')).toThrow()
    expect(() => normalizeBuyerReference(5)).toThrow(/ungültig/)
  })
})

describe('P3 Service: Schreibwege', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation(async (callback: (t: unknown) => Promise<unknown>) => callback({
      invoice: { findUnique: invoiceFindUnique, create: invoiceCreate, update: invoiceUpdate, updateMany: invoiceUpdateMany },
      payment: { count: vi.fn().mockResolvedValue(0) },
      $queryRaw: queryRaw,
    }))
  })

  const draftInput = (item: Record<string, unknown> = {}) => ({
    customerId: 'c-1',
    invoiceRecipientSource: 'CUSTOMER' as const,
    invoiceDate: new Date('2026-10-08'),
    items: [{ position: 1, description: 'Montage', quantity: 2, unitPrice: 10.5, taxRate: 19, ...item }],
  })

  it('createInvoiceDraft: ungültiger Rabatt wird abgelehnt, bevor irgendetwas geschrieben wird', async () => {
    customerFindUnique.mockResolvedValue({ id: 'c-1', deletedAt: null })
    await expect(createInvoiceDraft(draftInput({ discountRate: '100.01' }), 'u-1', 'u@example.test'))
      .rejects.toThrow(/Position 1: Rabatt/)
    expect(transaction).not.toHaveBeenCalled()
    expect(invoiceCreate).not.toHaveBeenCalled()
  })

  it('createInvoiceDraft: zu lange Käuferreferenz wird abgelehnt, ohne Schreibzugriff', async () => {
    customerFindUnique.mockResolvedValue({ id: 'c-1', deletedAt: null })
    await expect(createInvoiceDraft({ ...draftInput(), buyerReference: 'x'.repeat(256) }, 'u-1', 'u@example.test'))
      .rejects.toThrow(/255/)
    expect(invoiceCreate).not.toHaveBeenCalled()
  })

  const decimalLike = (label: string) => ({ neg: () => `neg(${label})` })
  function original(overrides: Record<string, unknown> = {}) {
    return {
      id: 'inv-1', status: InvoiceStatus.FINALIZED, invoiceNumber: 'RE-1', customerId: 'c-1', orderId: null,
      customerSnapshot: {}, companySnapshot: {},
      totalNet: decimalLike('net'), totalTax: decimalLike('tax'), totalGross: decimalLike('gross'),
      buyerReference: 'REF-ALT', type: 'STANDARD', cancelledByInvoiceId: null, paidAmount: { isZero: () => true },
      items: [
        { position: 1, description: 'Alt', quantity: 1, unit: 'Stk.', unitPrice: 10, discountRate: null, taxRate: 19,
          netAmount: decimalLike('n1'), taxAmount: decimalLike('t1'), grossAmount: decimalLike('g1') },
        { position: 2, description: 'Neu', quantity: 1, unit: 'Stk.', unitPrice: 10, discountRate: '0.00', taxRate: 19,
          netAmount: decimalLike('n2'), taxAmount: decimalLike('t2'), grossAmount: decimalLike('g2') },
      ],
      ...overrides,
    }
  }

  it('cancelInvoice: Storno übernimmt Käuferreferenz und Rabattsatz unverändert (NULL bleibt NULL)', async () => {
    invoiceFindUnique.mockResolvedValue(original())
    nextNumberMock.mockResolvedValue('RE-2')
    invoiceCreate.mockResolvedValue({ id: 'storno-1' })
    queryRaw.mockResolvedValue([{ id: 'inv-1' }])
    invoiceUpdateMany.mockResolvedValue({ count: 1 })

    await cancelInvoice('inv-1', 'Fehler', 'u-1', 'u@example.test')

    const data = invoiceCreate.mock.calls[0][0].data
    expect(data.buyerReference).toBe('REF-ALT')
    expect(data.items.create[0].discountRate).toBeNull()
    expect(data.items.create[1].discountRate).toBe('0.00')
    // Beträge weiterhin negiert, Originalpositionen unverändert
    expect(data.items.create[0].netAmount).toBe('neg(n1)')
  })

  it('updateInvoiceBuyerReference: Entwurf wird geändert und auditiert', async () => {
    queryRaw.mockResolvedValue([{ id: 'inv-1' }])
    invoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.DRAFT, buyerReference: null })
    invoiceUpdateMany.mockResolvedValue({ count: 1 })

    await updateInvoiceBuyerReference('inv-1', '  04011000-1234512345-06  ', 'u-1', 'u@example.test')

    expect(invoiceUpdateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: InvoiceStatus.DRAFT },
      data: { buyerReference: '04011000-1234512345-06' },
    })
    expect(auditMock).toHaveBeenCalledTimes(1)
    expect(auditMock.mock.calls[0][1]).toMatchObject({
      entityType: 'invoice', entityId: 'inv-1',
      oldValue: { buyerReference: null }, newValue: { buyerReference: '04011000-1234512345-06' },
    })
  })

  it.each([
    InvoiceStatus.FINALIZED, InvoiceStatus.SENT, InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED, InvoiceStatus.CORRECTED,
  ])('updateInvoiceBuyerReference: Status %s ist unveränderlich (kein Schreibzugriff, kein Audit)', async (status) => {
    queryRaw.mockResolvedValue([{ id: 'inv-1' }])
    invoiceFindUnique.mockResolvedValue({ status, buyerReference: 'REF' })
    await expect(updateInvoiceBuyerReference('inv-1', 'NEU', 'u-1', 'u@example.test'))
      .rejects.toThrow(/nach der Finalisierung nicht mehr geändert/)
    expect(invoiceUpdateMany).not.toHaveBeenCalled()
    expect(auditMock).not.toHaveBeenCalled()
  })

  it('updateInvoiceBuyerReference: unveränderter Wert erzeugt weder Update noch Audit', async () => {
    queryRaw.mockResolvedValue([{ id: 'inv-1' }])
    invoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.DRAFT, buyerReference: 'REF' })
    await updateInvoiceBuyerReference('inv-1', 'REF', 'u-1', 'u@example.test')
    expect(invoiceUpdateMany).not.toHaveBeenCalled()
    expect(auditMock).not.toHaveBeenCalled()
  })

  it('updateInvoiceBuyerReference: parallele Finalisierung (count 0) → Konflikt, kein Audit', async () => {
    queryRaw.mockResolvedValue([{ id: 'inv-1' }])
    invoiceFindUnique.mockResolvedValue({ status: InvoiceStatus.DRAFT, buyerReference: null })
    invoiceUpdateMany.mockResolvedValue({ count: 0 })
    await expect(updateInvoiceBuyerReference('inv-1', 'REF', 'u-1', 'u@example.test')).rejects.toThrow(/zwischenzeitlich/)
    expect(auditMock).not.toHaveBeenCalled()
  })

  it('updateInvoiceBuyerReference: unbekannte Rechnung → NotFound', async () => {
    queryRaw.mockResolvedValue([])
    await expect(updateInvoiceBuyerReference('x', 'REF', 'u-1', 'u@example.test')).rejects.toThrow(/nicht gefunden/)
  })
})

describe('P3 Dateien: Schema-Zeilen und Migrationen', () => {
  const m1 = 'prisma/migrations/20261008120000_invoice_item_discount_rate/migration.sql'
  const m2 = 'prisma/migrations/20261008121000_invoice_buyer_reference/migration.sql'
  const sqlOnly = (file: string) => read(file).replace(/--.*$/gm, '')

  it('schema.prisma enthält genau die zwei freigegebenen Felder', () => {
    const schema = read('prisma/schema.prisma')
    expect(schema).toMatch(/discountRate\s+Decimal\?\s+@map\("discount_rate"\)\s+@db\.Decimal\(5, 2\)/)
    expect(schema).toMatch(/buyerReference\s+String\?\s+@map\("buyer_reference"\)/)
    expect(schema.match(/@map\("discount_rate"\)/g)?.length).toBe(2) // ServiceReportItem (bestehend) + InvoiceItem (neu)
    expect(schema.match(/@map\("buyer_reference"\)/g)?.length).toBe(1)
  })

  it('M1: additiv, nullable, CHECK 0–100, keine Datenänderung', () => {
    const sql = sqlOnly(m1)
    expect(sql).toContain('ALTER TABLE "invoice_items"')
    expect(sql).toContain('ADD COLUMN "discount_rate" DECIMAL(5,2);')
    expect(sql).not.toMatch(/NOT NULL|DEFAULT/i)
    expect(sql).toContain('CHECK ("discount_rate" IS NULL OR ("discount_rate" >= 0 AND "discount_rate" <= 100))')
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE|DROP|TRUNCATE|RENAME)\b/i)
  })

  it('M2: additiv, nullable, CHECK 1–255 gespeicherte Länge und nicht nur Leerraum, keine Datenänderung', () => {
    const sql = sqlOnly(m2)
    expect(sql).toContain('ALTER TABLE "invoices"')
    expect(sql).toContain('ADD COLUMN "buyer_reference" TEXT;')
    expect(sql).not.toMatch(/NOT NULL|DEFAULT/i)
    expect(sql).toContain('char_length("buyer_reference") BETWEEN 1 AND 255')
    expect(sql).toContain('char_length(btrim("buyer_reference", E\' \\t\\r\\n\')) >= 1')
    // gespeicherte Länge wird direkt begrenzt, nicht nur die getrimmte Länge
    expect(sql).not.toContain('char_length(btrim("buyer_reference")) BETWEEN')
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE|DROP|TRUNCATE|RENAME)\b/i)
  })

  it('Migrationsreihenfolge: neue Ordner liegen nach allen bestehenden; Namen eindeutig', () => {
    const dirs = readdirSync(resolve(process.cwd(), 'prisma/migrations')).filter((n) => /^\d{14}_/.test(n)).sort()
    const i1 = dirs.indexOf('20261008120000_invoice_item_discount_rate')
    const i2 = dirs.indexOf('20261008121000_invoice_buyer_reference')
    expect(i1).toBeGreaterThan(-1)
    expect(i2).toBe(i1 + 1)
    expect(dirs[dirs.length - 1]).toBe('20261008121000_invoice_buyer_reference')
    expect(existsSync(resolve(process.cwd(), m1))).toBe(true)
  })

  it('alle Schreibwege auf InvoiceItem nutzen die Rabattsperre; Kopien übernehmen die Felder', () => {
    const service = read('lib/services/invoice.service.ts')
    const actions = read('app/(dashboard)/invoices/actions.ts')
    // P4-A: Anlegen UND Bearbeiten laufen im Service (je eine Rabattsperre); die Action rechnet/schreibt nicht mehr selbst.
    const gateCalls = service.split('normalizeInvoiceItemDiscount(item.discountRate, index + 1)').length - 1
    expect(gateCalls).toBe(2)
    const rateWrites = service.split('discountRate: discountRates[index]').length - 1
    expect(rateWrites).toBeGreaterThanOrEqual(4)
    expect(service).toContain('export async function updateInvoiceDraft(')
    expect(actions).toContain('updateInvoiceDraft(')
    expect(actions).not.toContain('invoiceItem.createMany')
    expect(service).toContain('discountRate: item.discountRate')
    expect(service).toContain('buyerReference:      original.buyerReference')
    // Fehlendes Formularfeld löscht keine Käuferreferenz
    expect(actions).toContain("formData.has('buyerReference')")
  })

  it('kein neues UI-Feld; Berechnung seit P4-A ausschließlich über den zentralen Rechendienst', () => {
    expect(read('components/invoices/InvoiceForm.tsx')).not.toContain('buyerReference')
    const service = read('lib/services/invoice.service.ts')
    expect(service).toContain('invoice-calculation.service')
    expect(service).not.toContain('calculateTotals')
  })
})
