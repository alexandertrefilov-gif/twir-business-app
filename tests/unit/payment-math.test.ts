// REQ-029 P4-D: exakte Geld-Arithmetik für Zahlungen/Buchhaltung (lib/billing/payment-math) und Zahlungs-Schema.
import { describe, expect, it } from 'vitest'
import {
  DUNNING_FEE_SPEC, PAYMENT_AMOUNT_SPEC, derivePaymentStatus, normalizeMoneyInput,
  remainingMoney, sumMoney, toMoney,
} from '@/lib/billing/payment-math'
import { moneyToNumber, sumCentNumbers } from '@/lib/services/money-output'
import { PaymentCreateSchema } from '@/lib/validators/payment.schema'

const dec = (v: string) => ({ toFixed: () => v })

describe('P4-D Summen und Restbeträge ohne Float-Fehler', () => {
  it('0.10 + 0.20 = 0.30 exakt', () => {
    expect(sumMoney(['0.10', '0.20']).toFixed(2)).toBe('0.30')
    expect(0.1 + 0.2).not.toBe(0.3) // Beleg: genau diesen Fehler verhindert die Dezimalrechnung
  })
  it('1000 × 0.01 = 10.00', () => {
    expect(sumMoney(Array.from({ length: 1000 }, () => '0.01')).toFixed(2)).toBe('10.00')
  })
  it('akzeptiert Prisma-Decimal-ähnliche Werte (toFixed)', () => {
    expect(sumMoney([dec('19.99'), dec('0.01')]).toFixed(2)).toBe('20.00')
    expect(remainingMoney(dec('119.00'), dec('40.01')).toFixed(2)).toBe('78.99')
  })
  it('Restbetrag kann negativ sein (Stornorechnung)', () => {
    expect(remainingMoney('-119.00', '0').toFixed(2)).toBe('-119.00')
  })
  it('moneyToNumber/sumCentNumbers liefern cent-genaue Zahlen an der Ausgabegrenze', () => {
    expect(moneyToNumber(toMoney('1234.50'))).toBe(1234.5)
    expect(moneyToNumber(toMoney('-0.00'))).toBe(0)
    expect(sumCentNumbers([0.1, 0.2, 0.3, 0.4])).toBe(1)
    expect(sumCentNumbers([])).toBe(0)
  })
})

describe('P4-D Zahlungsbetrag: streng, ohne stille Rundung', () => {
  it.each([['12.5', '12.50'], ['12', '12.00'], ['0.01', '0.01'], ['99999999', '99999999.00']])('akzeptiert %s → %s', (input, expected) => {
    expect(normalizeMoneyInput(input, PAYMENT_AMOUNT_SPEC)).toEqual({ ok: true, value: expected })
  })
  it('akzeptiert eine Zahl von älteren Aufrufern und liefert zwei Nachkommastellen', () => {
    expect(normalizeMoneyInput(19.9, PAYMENT_AMOUNT_SPEC)).toEqual({ ok: true, value: '19.90' })
  })
  it.each(['0', '0.00', '-5', '10.005', '1e3', '12,50', '', '   ', 'abc', '100000000'])('lehnt %j ab', (input) => {
    expect(normalizeMoneyInput(input, PAYMENT_AMOUNT_SPEC).ok).toBe(false)
  })
  it('lehnt JS-Zahlen mit Float-Rest, NaN und Infinity ab', () => {
    expect(normalizeMoneyInput(0.1 + 0.2, PAYMENT_AMOUNT_SPEC).ok).toBe(false)
    expect(normalizeMoneyInput(Number.NaN, PAYMENT_AMOUNT_SPEC).ok).toBe(false)
    expect(normalizeMoneyInput(Number.POSITIVE_INFINITY, PAYMENT_AMOUNT_SPEC).ok).toBe(false)
  })
  it('Fehlermeldung nennt Nachkommastellen und rundet nicht', () => {
    const result = normalizeMoneyInput('10.005', PAYMENT_AMOUNT_SPEC)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('höchstens 2 Nachkommastellen')
  })
  it('Mahngebühr: 0 erlaubt, 10000 und negative Werte nicht', () => {
    expect(normalizeMoneyInput('0', DUNNING_FEE_SPEC)).toEqual({ ok: true, value: '0.00' })
    expect(normalizeMoneyInput(5, DUNNING_FEE_SPEC)).toEqual({ ok: true, value: '5.00' })
    expect(normalizeMoneyInput('10000', DUNNING_FEE_SPEC).ok).toBe(false)
    expect(normalizeMoneyInput('-1', DUNNING_FEE_SPEC).ok).toBe(false)
    expect(normalizeMoneyInput('2.555', DUNNING_FEE_SPEC).ok).toBe(false)
  })
})

describe('P4-D Zahlungsstatus (exakt)', () => {
  it('0.10 + 0.20 gegen 0.30 → PAID (mit Float wäre es PARTIALLY_PAID)', () => {
    expect(derivePaymentStatus('0.30', sumMoney(['0.10', '0.20']).toFixed(2), 'SENT')).toBe('PAID')
  })
  it.each([
    ['119.00', '119.00', 'SENT', 'PAID'],
    ['119.00', '119.01', 'SENT', 'PAID'],
    ['119.00', '118.99', 'SENT', 'PARTIALLY_PAID'],
    ['119.00', '0.01', 'FINALIZED', 'PARTIALLY_PAID'],
    ['119.00', '0', 'SENT', 'SENT'],
    ['119.00', '0', 'PARTIALLY_PAID', 'SENT'],
    ['119.00', '0', 'PAID', 'SENT'],
    ['119.00', '0', 'OVERDUE', 'OVERDUE'],
    ['119.00', '50.00', 'OVERDUE', 'OVERDUE'],
    ['119.00', '119.00', 'OVERDUE', 'PAID'],
    ['0.00', '0.00', 'SENT', 'PAID'],
  ])('Brutto %s, bezahlt %s, Status %s → %s', (gross, paid, current, expected) => {
    expect(derivePaymentStatus(gross, paid, current)).toBe(expected)
  })
})

describe('P4-D PaymentCreateSchema', () => {
  const base = { invoiceId: '00000000-0000-4000-8000-000000000001', paymentDate: '2026-10-09' }
  it('liefert den Betrag als kanonischen Zwei-Stellen-String', () => {
    expect(PaymentCreateSchema.parse({ ...base, amount: '19.9' }).amount).toBe('19.90')
    expect(PaymentCreateSchema.parse({ ...base, amount: 12 }).amount).toBe('12.00')
  })
  it('lehnt ungültige Beträge mit verständlicher Meldung ab', () => {
    for (const amount of ['0', '-1', '1.005', '12,50', null, undefined]) {
      const result = PaymentCreateSchema.safeParse({ ...base, amount })
      expect(result.success, String(amount)).toBe(false)
      if (!result.success) expect(result.error.flatten().fieldErrors.amount?.[0]).toMatch(/Zahlungsbetrag/)
    }
  })
})
