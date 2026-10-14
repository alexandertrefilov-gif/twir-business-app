// REQ-029 P4-C: sichere Stornierung, manuelle Statuswechsel, Überfälligkeitslauf, Mahnung – mit Audit.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceStatus } from '@/types/enums'

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  invFindUnique: vi.fn(), invFindMany: vi.fn(), invCreate: vi.fn(), invUpdateMany: vi.fn(),
  paymentCount: vi.fn(), paymentAggregate: vi.fn(), auditFindMany: vi.fn(),
  dunFindMany: vi.fn(), dunCreate: vi.fn(),
  nextNumber: vi.fn(), audit: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => {
  const tx = () => ({
    $queryRaw: m.queryRaw,
    invoice: { findUnique: m.invFindUnique, create: m.invCreate, updateMany: m.invUpdateMany },
    payment: { count: m.paymentCount, aggregate: m.paymentAggregate },
    auditLog: { findMany: m.auditFindMany },
    dunningNotice: { findMany: m.dunFindMany, create: m.dunCreate },
  })
  return { prisma: { $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx()), invoice: { findMany: m.invFindMany } } }
})
vi.mock('@/lib/services/number-sequence.service', () => ({ nextNumber: m.nextNumber }))
vi.mock('@/lib/services/audit.service', () => ({ buildAuditLogCreate: m.audit }))

import { cancelInvoice, changeInvoiceStatus, MANUAL_INVOICE_TRANSITIONS } from '@/lib/services/invoice.service'
import { createDunningNotice, markOverdueInvoices, OVERDUE_JOB_ACTOR } from '@/lib/services/dunning.service'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const neg = (label: string) => ({ neg: () => `neg(${label})` })

function original(over: Record<string, unknown> = {}) {
  return {
    id: 'inv-1', status: 'SENT', type: 'STANDARD', invoiceNumber: 'RE-1', customerId: 'c-1', orderId: null,
    customerSnapshot: {}, companySnapshot: {}, cancelledByInvoiceId: null, buyerReference: null,
    paidAmount: { isZero: () => true },
    totalNet: neg('net'), totalTax: neg('tax'), totalGross: neg('gross'),
    items: [{ position: 1, description: 'A', quantity: 1, unit: 'Stk.', unitPrice: 10, discountRate: '0.00', taxRate: 19,
      netAmount: neg('n'), taxAmount: neg('t'), grossAmount: neg('g') }],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.queryRaw.mockResolvedValue([{ id: 'inv-1' }])
  m.paymentCount.mockResolvedValue(0)
  m.invCreate.mockResolvedValue({ id: 'storno-1' })
  m.invUpdateMany.mockResolvedValue({ count: 1 })
  m.nextNumber.mockResolvedValue('RE-2')
})

describe('P4-C cancelInvoice', () => {
  it('storniert eine versendete Rechnung unter Sperre; Original wird mit Statusbedingung markiert; Audit mit Storno-Nummer', async () => {
    m.invFindUnique.mockResolvedValue(original())
    await expect(cancelInvoice('inv-1', 'Fehler', 'u1', 'u@x.test')).resolves.toEqual({ cancellationInvoiceId: 'storno-1' })
    expect(m.queryRaw).toHaveBeenCalledTimes(1)
    expect(m.invUpdateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: 'SENT', cancelledByInvoiceId: null },
      data: { status: 'CANCELLED', cancelledByInvoiceId: 'storno-1' },
    })
    const audit = m.audit.mock.calls[0][1]
    expect(audit).toMatchObject({ action: 'CANCEL', entityId: 'inv-1', newValue: { cancellationNumber: 'RE-2' }, metadata: { reason: 'Fehler' } })
  })

  it('überfällige Rechnung OHNE Zahlungen ist stornierbar', async () => {
    m.invFindUnique.mockResolvedValue(original({ status: 'OVERDUE' }))
    await expect(cancelInvoice('inv-1', 'x', 'u1', 'u@x.test')).resolves.toBeDefined()
  })

  it('B4: eine Stornorechnung kann nicht erneut storniert werden – keine Nummer, keine Anlage', async () => {
    m.invFindUnique.mockResolvedValue(original({ status: 'FINALIZED', type: 'CANCELLATION' }))
    await expect(cancelInvoice('inv-1', 'x', 'u1', 'u@x.test')).rejects.toThrow(/Stornorechnung kann nicht storniert/)
    expect(m.nextNumber).not.toHaveBeenCalled(); expect(m.invCreate).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled()
  })

  it('bereits stornierte Rechnung wird abgewiesen', async () => {
    m.invFindUnique.mockResolvedValue(original({ cancelledByInvoiceId: 'storno-0' }))
    await expect(cancelInvoice('inv-1', 'x', 'u1', 'u@x.test')).rejects.toThrow(/bereits storniert/)
    expect(m.invCreate).not.toHaveBeenCalled()
  })

  it('B5: Rechnung mit Zahlungen wird nicht automatisch storniert (aktive Zahlung ODER paidAmount > 0)', async () => {
    m.invFindUnique.mockResolvedValue(original({ status: 'OVERDUE' }))
    m.paymentCount.mockResolvedValue(1)
    await expect(cancelInvoice('inv-1', 'x', 'u1', 'u@x.test')).rejects.toThrow(/Zahlungen/)
    m.paymentCount.mockResolvedValue(0)
    m.invFindUnique.mockResolvedValue(original({ status: 'OVERDUE', paidAmount: { isZero: () => false } }))
    await expect(cancelInvoice('inv-1', 'x', 'u1', 'u@x.test')).rejects.toThrow(/Zahlungen/)
    expect(m.nextNumber).not.toHaveBeenCalled(); expect(m.invCreate).not.toHaveBeenCalled(); expect(m.invUpdateMany).not.toHaveBeenCalled()
  })

  it('Zahlungsregel greift unabhängig vom Status: teilbezahlt/bezahlt MIT Zahlungen → Zahlungsmeldung, nicht Statusmeldung', async () => {
    for (const status of ['SENT', 'OVERDUE', 'PARTIALLY_PAID', 'PAID']) {
      m.paymentCount.mockResolvedValue(1)
      m.invFindUnique.mockResolvedValue(original({ status, paidAmount: { isZero: () => false } }))
      const error = await cancelInvoice('inv-1', 'x', 'u1', 'u@x.test').catch((e: Error) => e)
      expect((error as Error).message).toMatch(/erfasste Zahlungen/)
      expect((error as Error).message).not.toMatch(/kann nicht storniert werden/)
    }
    expect(m.nextNumber).not.toHaveBeenCalled(); expect(m.invCreate).not.toHaveBeenCalled(); expect(m.invUpdateMany).not.toHaveBeenCalled()
  })

  it('Status ohne erlaubten Übergang (Entwurf, teilbezahlt/bezahlt ohne erfasste Zahlungen) wird abgewiesen', async () => {
    for (const status of ['DRAFT', 'PARTIALLY_PAID', 'PAID']) {
      m.invFindUnique.mockResolvedValue(original({ status }))
      await expect(cancelInvoice('inv-1', 'x', 'u1', 'u@x.test')).rejects.toThrow(/kann nicht storniert werden/)
    }
    expect(m.invCreate).not.toHaveBeenCalled()
  })

  it('B3: wurde das Original zwischenzeitlich verändert (updateMany count 0) → ConflictError, nichts wird bestätigt', async () => {
    m.invFindUnique.mockResolvedValue(original())
    m.invUpdateMany.mockResolvedValue({ count: 0 })
    await expect(cancelInvoice('inv-1', 'x', 'u1', 'u@x.test')).rejects.toMatchObject({ name: 'ConflictError' })
    expect(m.audit).not.toHaveBeenCalled()
  })

  it('unbekannte Rechnung → NotFoundError', async () => {
    m.queryRaw.mockResolvedValue([])
    await expect(cancelInvoice('nope', 'x', 'u1', 'u@x.test')).rejects.toMatchObject({ name: 'NotFoundError' })
  })
})

describe('P4-C changeInvoiceStatus (manuell)', () => {
  const run = (from: string, to: string, type = 'STANDARD') => {
    m.invFindUnique.mockResolvedValue({ status: from, type })
    return changeInvoiceStatus('inv-1', to as InvoiceStatus, 'u1', 'u@x.test')
  }

  it('erlaubt nur FINALIZED→SENT und SENT→OVERDUE', () => {
    expect(MANUAL_INVOICE_TRANSITIONS).toEqual({ FINALIZED: ['SENT'], SENT: ['OVERDUE'] })
  })

  it('FINALIZED→SENT setzt sentAt, schreibt Audit mit alt/neu', async () => {
    await run('FINALIZED', 'SENT')
    const data = m.invUpdateMany.mock.calls[0][0]
    expect(data.where).toEqual({ id: 'inv-1', status: 'FINALIZED' })
    expect(data.data.status).toBe('SENT'); expect(data.data.sentAt).toBeInstanceOf(Date)
    expect(m.audit.mock.calls[0][1]).toMatchObject({ action: 'STATUS_CHANGE', oldValue: { status: 'FINALIZED' }, newValue: { status: 'SENT' } })
  })

  it('SENT→OVERDUE ok', async () => {
    await run('SENT', 'OVERDUE')
    expect(m.invUpdateMany.mock.calls[0][0].data).toEqual({ status: 'OVERDUE' })
  })

  it.each([
    ['SENT', 'PAID'], ['SENT', 'PARTIALLY_PAID'], ['SENT', 'CANCELLED'], ['FINALIZED', 'CANCELLED'], ['FINALIZED', 'PAID'],
    ['OVERDUE', 'PAID'], ['OVERDUE', 'CANCELLED'], ['PARTIALLY_PAID', 'OVERDUE'], ['PAID', 'SENT'], ['DRAFT', 'FINALIZED'],
  ])('B6: %s → %s ist manuell nicht erlaubt (ohne Schreibzugriff)', async (from, to) => {
    await expect(run(from, to)).rejects.toThrow(/manuell nicht erlaubt/)
    expect(m.invUpdateMany).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled()
  })

  it('Stornorechnung kann nicht überfällig werden, wohl aber versendet', async () => {
    await expect(run('SENT', 'OVERDUE', 'CANCELLATION')).rejects.toThrow(/Stornorechnung/)
    await expect(run('FINALIZED', 'SENT', 'CANCELLATION')).resolves.toBeUndefined()
  })

  it('zwischenzeitlich geändert (count 0) → ConflictError ohne Audit', async () => {
    m.invUpdateMany.mockResolvedValue({ count: 0 })
    await expect(run('SENT', 'OVERDUE')).rejects.toMatchObject({ name: 'ConflictError' })
    expect(m.audit).not.toHaveBeenCalled()
  })
})

describe('P4-C Überfälligkeitslauf', () => {
  const NOW = new Date('2026-10-09T10:00:00Z')
  const due = new Date('2026-10-01T00:00:00Z') // Fälligkeiten: Kalendertag als UTC-Mitternacht (wie z.coerce.date('JJJJ-MM-TT'))

  it('betrachtet nur SENT, keine Stornorechnungen', async () => {
    m.invFindMany.mockResolvedValue([])
    await expect(markOverdueInvoices(NOW)).resolves.toBe(0)
    const where = m.invFindMany.mock.calls[0][0].where
    expect(where.status).toBe('SENT'); expect(where.type).toEqual({ not: 'CANCELLATION' })
    expect(where.dueDate.lt).toBeInstanceOf(Date)
  })

  it('markiert mit Statusbedingung und schreibt je Rechnung einen Systemaudit (ohne Benutzer)', async () => {
    m.invFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    m.invFindUnique.mockResolvedValue({ status: 'SENT', type: 'STANDARD', dueDate: due })
    await expect(markOverdueInvoices(NOW)).resolves.toBe(2)
    expect(m.invUpdateMany).toHaveBeenCalledWith({ where: { id: 'a', status: 'SENT' }, data: { status: 'OVERDUE' } })
    expect(m.audit).toHaveBeenCalledTimes(2)
    expect(m.audit.mock.calls[0][1]).toMatchObject({
      userId: null, userEmail: OVERDUE_JOB_ACTOR, action: 'STATUS_CHANGE', entityId: 'a',
      oldValue: { status: 'SENT' }, newValue: { status: 'OVERDUE' }, metadata: { source: 'overdue-job', dueDate: '2026-10-01' },
    })
  })

  it('überspringt zwischenzeitlich geänderte oder noch nicht fällige Rechnungen (idempotent)', async () => {
    m.invFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    m.invFindUnique
      .mockResolvedValueOnce({ status: 'PAID', type: 'STANDARD', dueDate: due })
      .mockResolvedValueOnce({ status: 'SENT', type: 'STANDARD', dueDate: new Date('2026-10-20T00:00:00Z') })
      .mockResolvedValueOnce({ status: 'SENT', type: 'STANDARD', dueDate: due })
    await expect(markOverdueInvoices(NOW)).resolves.toBe(1)
    expect(m.audit).toHaveBeenCalledTimes(1)
  })

  it('Einzelfehler stoppen den Lauf nicht, werden aber am Ende gemeldet', async () => {
    m.invFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    m.invFindUnique.mockResolvedValue({ status: 'SENT', type: 'STANDARD', dueDate: due })
    m.invUpdateMany.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce({ count: 1 })
    await expect(markOverdueInvoices(NOW)).rejects.toThrow(/1 markiert, 1 Fehler.*db down/)
    expect(m.audit).toHaveBeenCalledTimes(1)
  })
})

describe('P4-C Mahnung → OVERDUE mit Audit (seit P5-3 über die zentrale Policy)', () => {
  const NOW     = new Date('2026-10-16T08:00:00.000Z') // Berlin: 16.10.2026
  const SENT_AT = new Date('2026-10-01T08:00:00.000Z')
  const dispatchAudit = {
    id: 'aud-1', entityType: 'invoice', entityId: 'inv-1', action: 'STATUS_CHANGE', userId: 'u0',
    oldValue: { status: 'FINALIZED' }, newValue: { status: 'SENT' }, createdAt: new Date(SENT_AT.getTime() + 5),
  }
  const input = (level: number) => ({ invoiceId: 'inv-1', level, dueDate: new Date('2026-10-30') }) as never
  const run = (level: number) => createDunningNotice(input(level), 'u1', 'u@x.test', NOW)
  beforeEach(() => {
    m.dunCreate.mockResolvedValue({ id: 'dun-1' })
    m.paymentAggregate.mockResolvedValue({ _sum: { amount: null } })
    m.auditFindMany.mockResolvedValue([dispatchAudit])
  })
  const withInvoice = (status: string, highest = 0) => {
    m.invFindUnique.mockResolvedValue({
      id: 'inv-1', status, type: 'STANDARD', invoiceNumber: 'RE-1',
      sentAt: SENT_AT, dueDate: new Date('2026-10-15'), totalGross: '100.00',
    })
    m.dunFindMany.mockResolvedValue(highest ? [{ id: 'dun-0', level: highest, sentAt: new Date('2026-10-10T09:00:00.000Z') }] : [])
  }

  it('Stufe 2 auf SENT: OVERDUE mit Statusbedingung und STATUS_CHANGE-Audit (Akteur = Benutzer, Quelle = dunning)', async () => {
    withInvoice('SENT', 1)
    await run(2)
    expect(m.invUpdateMany).toHaveBeenCalledWith({ where: { id: 'inv-1', status: 'SENT' }, data: { status: 'OVERDUE' } })
    const statusAudit = m.audit.mock.calls.map(c => c[1]).find(a => a.action === 'STATUS_CHANGE')
    expect(statusAudit).toMatchObject({ userId: 'u1', entityType: 'invoice', entityId: 'inv-1', oldValue: { status: 'SENT' }, newValue: { status: 'OVERDUE' }, metadata: { source: 'dunning', level: 2 } })
  })

  it('Stufe 1 und bereits OVERDUE (Stufe 2) ändern den Status nicht', async () => {
    withInvoice('SENT'); await run(1)
    withInvoice('OVERDUE', 1); await run(2)
    expect(m.invUpdateMany).not.toHaveBeenCalled()
  })

  it('noch nicht versendet (FINALIZED) wird abgewiesen: keine Mahnung, kein Statuswechsel, kein Audit', async () => {
    withInvoice('FINALIZED', 1)
    await expect(run(2)).rejects.toMatchObject({ name: 'BusinessRuleError' })
    expect(m.dunCreate).not.toHaveBeenCalled()
    expect(m.invUpdateMany).not.toHaveBeenCalled()
    expect(m.audit).not.toHaveBeenCalled()
  })

  it('zwischenzeitlich geänderter Status → ConflictError', async () => {
    withInvoice('SENT', 1)
    m.invUpdateMany.mockResolvedValue({ count: 0 })
    await expect(run(2)).rejects.toMatchObject({ name: 'ConflictError' })
  })
})

describe('P4-C Quelltext-Garantien', () => {
  it('Server-Action ändert den Status nicht mehr selbst', () => {
    const actions = read('app/(dashboard)/invoices/actions.ts')
    expect(actions).toContain('changeInvoiceStatus(invoiceId, toStatus, userId, userEmail)')
    expect(actions).not.toContain('invoice.updateMany')
    expect(actions).not.toContain('isInvoiceTransitionAllowed')
  })
  it('Service: Sperre in Storno, manuellem Statuswechsel, Mahnung und Überfälligkeitslauf', () => {
    expect(read('lib/services/invoice.service.ts').split('FOR UPDATE').length - 1).toBeGreaterThanOrEqual(6)
    expect(read('lib/services/dunning.service.ts').split('FOR UPDATE').length - 1).toBeGreaterThanOrEqual(2)
    expect(read('lib/services/dunning.service.ts')).not.toMatch(/invoice\.updateMany\(\{\s*where:\s*\{\s*dueDate/)
  })
})
