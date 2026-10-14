// REQ-029 P4-D: Zahlungsservice mit exakter Dezimalrechnung, Zahlungssumme aus Buchungszeilen, OVERDUE-Erhalt.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  invFindUnique: vi.fn(), invUpdate: vi.fn(),
  payAggregate: vi.fn(), payCreate: vi.fn(), payFindUnique: vi.fn(), payUpdate: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => {
  const tx = () => ({
    $queryRaw: m.queryRaw,
    invoice: { findUnique: m.invFindUnique, update: m.invUpdate },
    payment: { aggregate: m.payAggregate, create: m.payCreate, findUnique: m.payFindUnique, update: m.payUpdate },
  })
  return { prisma: { $transaction: async (cb: (t: unknown) => Promise<unknown>) => { m.transaction(); return cb(tx()) }, invoice: { findUnique: m.invFindUnique } } }
})
vi.mock('@/lib/services/audit.service', () => ({ buildAuditLogCreate: m.audit }))

import { addPayment, getInvoicePaymentState, removePayment } from '@/lib/services/payment.service'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const dec = (v: string) => ({ toFixed: () => v, toNumber: () => Number(v) })
const date = new Date(2026, 9, 9)
const pay = (amount: string | number, extra: Record<string, unknown> = {}) =>
  ({ invoiceId: 'inv-1', amount, paymentDate: date, ...extra }) as any
const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1', status: 'SENT', totalGross: dec('119.00'), paidAmount: dec('0.00'), invoiceNumber: 'RE-1', ...over,
})
const activeSum = (v: string | null) => m.payAggregate.mockResolvedValue({ _sum: { amount: v === null ? null : dec(v) } })

beforeEach(() => {
  vi.clearAllMocks()
  m.queryRaw.mockResolvedValue([{ id: 'inv-1' }])
  m.invFindUnique.mockResolvedValue(invoice())
  m.payCreate.mockResolvedValue({ id: 'pay-1' })
  activeSum(null)
})

describe('P4-D addPayment', () => {
  it('Teilzahlung: speichert Betrag und paidAmount als Zwei-Stellen-String, Status PARTIALLY_PAID, Audit mit Strings', async () => {
    await expect(addPayment(pay('40'), 'u1', 'u@x.test')).resolves.toBe('pay-1')
    expect(m.payCreate.mock.calls[0][0].data.amount).toBe('40.00')
    expect(m.invUpdate).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { paidAmount: '40.00', status: 'PARTIALLY_PAID' } })
    expect(m.audit.mock.calls[0][1]).toMatchObject({ action: 'PAYMENT_ADDED', newValue: { amount: '40.00', newPaidAmount: '40.00', newStatus: 'PARTIALLY_PAID' } })
  })

  it('akzeptiert eine Zahl von älteren Aufrufern exakt (19.9 → 19.90)', async () => {
    await addPayment(pay(19.9), 'u1', 'u@x.test')
    expect(m.payCreate.mock.calls[0][0].data.amount).toBe('19.90')
  })

  it.each(['0', '-5', '10.005', 'abc', '', 0.1 + 0.2])('lehnt Betrag %j ab, bevor eine Transaktion beginnt', async (amount) => {
    await expect(addPayment(pay(amount as any), 'u1', 'u@x.test')).rejects.toThrow(/Zahlungsbetrag/)
    expect(m.transaction).not.toHaveBeenCalled()
    expect(m.payCreate).not.toHaveBeenCalled()
  })

  it('Float-Falle: 0.10 + 0.20 auf Rechnung 0.30 → PAID', async () => {
    m.invFindUnique.mockResolvedValue(invoice({ totalGross: dec('0.30') }))
    activeSum('0.10')
    await addPayment(pay('0.20'), 'u1', 'u@x.test')
    expect(m.invUpdate.mock.calls[0][0].data).toEqual({ paidAmount: '0.30', status: 'PAID' })
  })

  it('Restbetrag genau: 1 Cent darüber wird abgelehnt (mit Restbetrag in der Meldung), genau der Rest ergibt PAID', async () => {
    activeSum('100.00')
    await expect(addPayment(pay('19.01'), 'u1', 'u@x.test')).rejects.toThrow(/übersteigt den Restbetrag \(19\.00 €\)/)
    expect(m.payCreate).not.toHaveBeenCalled()
    await addPayment(pay('19.00'), 'u1', 'u@x.test')
    expect(m.invUpdate.mock.calls[0][0].data).toEqual({ paidAmount: '119.00', status: 'PAID' })
  })

  it('rechnet mit der Summe der aktiven Zahlungszeilen, nicht mit dem Cache paidAmount', async () => {
    m.invFindUnique.mockResolvedValue(invoice({ paidAmount: dec('119.00') })) // veralteter Cache
    activeSum('0.00')
    await addPayment(pay('50'), 'u1', 'u@x.test')
    expect(m.invUpdate.mock.calls[0][0].data).toEqual({ paidAmount: '50.00', status: 'PARTIALLY_PAID' })
  })

  it('Teilzahlung auf überfällige Rechnung: OVERDUE bleibt erhalten', async () => {
    m.invFindUnique.mockResolvedValue(invoice({ status: 'OVERDUE' }))
    await addPayment(pay('50'), 'u1', 'u@x.test')
    expect(m.invUpdate.mock.calls[0][0].data).toEqual({ paidAmount: '50.00', status: 'OVERDUE' })
  })

  it('Vollzahlung auf überfällige Rechnung → PAID', async () => {
    m.invFindUnique.mockResolvedValue(invoice({ status: 'OVERDUE' }))
    await addPayment(pay('119.00'), 'u1', 'u@x.test')
    expect(m.invUpdate.mock.calls[0][0].data).toEqual({ paidAmount: '119.00', status: 'PAID' })
  })

  it.each([['DRAFT', /Entwürfe/], ['CANCELLED', /Stornierte/], ['PAID', /vollständig bezahlt/]])('Status %s erhält keine Zahlung', async (status, message) => {
    m.invFindUnique.mockResolvedValue(invoice({ status }))
    await expect(addPayment(pay('10'), 'u1', 'u@x.test')).rejects.toThrow(message)
    expect(m.payCreate).not.toHaveBeenCalled()
  })

  it('sperrt die Rechnungszeile und meldet eine unbekannte Rechnung', async () => {
    m.queryRaw.mockResolvedValue([])
    await expect(addPayment(pay('10'), 'u1', 'u@x.test')).rejects.toThrow(/Rechnung nicht gefunden/)
  })
})

describe('P4-D removePayment', () => {
  const setup = (status: string, remaining: string | null, amount = '40.00') => {
    m.payFindUnique
      .mockResolvedValueOnce({ invoiceId: 'inv-1' })
      .mockResolvedValueOnce({ id: 'pay-1', amount: dec(amount), deletedAt: null, invoiceId: 'inv-1', invoice: { status, totalGross: dec('119.00'), invoiceNumber: 'RE-1' } })
    activeSum(remaining)
  }

  it('letzte Zahlung entfernt: paidAmount 0.00, PARTIALLY_PAID → SENT; Audit mit Betragsstrings', async () => {
    setup('PARTIALLY_PAID', null)
    await removePayment('pay-1', 'Fehlbuchung', 'u1', 'u@x.test')
    expect(m.invUpdate).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { paidAmount: '0.00', status: 'SENT' } })
    expect(m.audit.mock.calls[0][1]).toMatchObject({
      action: 'PAYMENT_REMOVED', oldValue: { paymentId: 'pay-1', amount: '40.00' },
      newValue: { newPaidAmount: '0.00', newStatus: 'SENT' }, metadata: { reason: 'Fehlbuchung' },
    })
  })

  it('überfällige Rechnung ohne Zahlung bleibt OVERDUE', async () => {
    setup('OVERDUE', null)
    await removePayment('pay-1', 'x', 'u1', 'u@x.test')
    expect(m.invUpdate.mock.calls[0][0].data).toEqual({ paidAmount: '0.00', status: 'OVERDUE' })
  })

  it('verbleibende Teilzahlung: PAID → PARTIALLY_PAID mit exakter Restsumme', async () => {
    setup('PAID', '79.00')
    await removePayment('pay-1', 'x', 'u1', 'u@x.test')
    expect(m.invUpdate.mock.calls[0][0].data).toEqual({ paidAmount: '79.00', status: 'PARTIALLY_PAID' })
  })

  it('bereits entfernte oder unbekannte Zahlung → nicht gefunden, keine Änderung', async () => {
    m.payFindUnique.mockResolvedValueOnce({ invoiceId: 'inv-1' }).mockResolvedValueOnce({ id: 'pay-1', amount: dec('1.00'), deletedAt: new Date(), invoiceId: 'inv-1', invoice: { status: 'SENT', totalGross: dec('1.00'), invoiceNumber: 'RE-1' } })
    await expect(removePayment('pay-1', 'x', 'u1', 'u@x.test')).rejects.toThrow(/Zahlung nicht gefunden/)
    expect(m.invUpdate).not.toHaveBeenCalled()
  })
})

describe('P4-D Ausgabegrenze und Quelltextschutz', () => {
  it('getInvoicePaymentState liefert cent-genaue Zahlen und exakten Restbetrag', async () => {
    m.invFindUnique.mockResolvedValue({
      totalGross: dec('0.30'), paidAmount: dec('0.10'), status: 'PARTIALLY_PAID',
      payments: [{ id: 'p1', amount: dec('0.10'), paymentDate: date, method: null, reference: null, notes: null, createdAt: date }],
    })
    const state = await getInvoicePaymentState('inv-1')
    expect(state).toMatchObject({ totalGross: 0.3, paidAmount: 0.1, remainingAmount: 0.2 })
    expect(state.payments[0].amount).toBe(0.1)
  })

  it('payment.service und Server-Action rechnen nicht mehr mit Float (toNumber/Math.round/parseFloat)', () => {
    const service = read('lib/services/payment.service.ts')
    expect(service).not.toMatch(/\.toNumber\(\)|Math\.round|parseFloat/)
    expect(read('app/(dashboard)/payments/actions.ts')).not.toContain('parseFloat')
    const accounting = read('lib/services/accounting.service.ts')
    expect(accounting).not.toMatch(/Math\.round|=> sum \+ /)
    const query = read('lib/services/invoice-query.service.ts')
    expect(query).not.toMatch(/Math\.round|\.toNumber\(\)/)
  })
})
