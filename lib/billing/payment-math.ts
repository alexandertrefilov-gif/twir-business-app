// lib/billing/payment-math.ts
//
// REQ-029 P4-D: Exakte Geld-Arithmetik für Zahlungen, Restbeträge, Zahlungsstatus und Buchhaltungssummen.
//   - Rechnet ausschließlich mit decimal.js (MoneyDecimal, DEC-015); kein JavaScript-`number` in der Rechnung.
//   - Kein `number` in lib/billing (Guard tests/unit/billing/no-float.test.ts); die Ausgabegrenze liegt in lib/services/money-output.ts.
//   - Keine Datenbank, keine Seiteneffekte.

import { MoneyDecimal, toCentString } from './money'
import type { Money } from './money'
import { validateDecimalField } from './decimal-input'
import type { DecimalFieldSpec } from './decimal-input'

/** Prisma.Decimal / decimal.js (liefert Klartext über `toFixed()`) oder bereits ein Klartext-String. */
export type MoneyValue = string | { toFixed(): string }

/** Zahlungsbetrag: > 0, höchstens 2 Nachkommastellen (DB: Decimal(12,2)). */
export const PAYMENT_AMOUNT_SPEC: DecimalFieldSpec = {
  label: 'Zahlungsbetrag', maxScale: 2, min: '0', max: '99999999', minExclusive: true,
}

/** Mahngebühr: 0 bis 9999, höchstens 2 Nachkommastellen (DB: Decimal(10,2)). */
export const DUNNING_FEE_SPEC: DecimalFieldSpec = {
  label: 'Mahngebühr', maxScale: 2, min: '0', max: '9999',
}

export function toMoney(value: MoneyValue): Money {
  return new MoneyDecimal(typeof value === 'string' ? value.trim() : value.toFixed())
}

export function sumMoney(values: readonly MoneyValue[]): Money {
  return values.reduce<Money>((sum, value) => sum.plus(toMoney(value)), new MoneyDecimal(0))
}

/** Restbetrag = Brutto − bezahlt (kann bei Stornorechnungen negativ sein). */
export function remainingMoney(totalGross: MoneyValue, paid: MoneyValue): Money {
  return toMoney(totalGross).minus(toMoney(paid))
}

/** Zwei-Dezimalstellen-String ("12.50") aus einer geprüften Eingabe, sonst die verständliche Fehlermeldung. */
export function normalizeMoneyInput(
  value: unknown,
  spec: DecimalFieldSpec,
): { ok: true; value: string } | { ok: false; message: string } {
  const result = validateDecimalField(value, spec)
  if (!result.ok) return result
  return { ok: true, value: toCentString(new MoneyDecimal(result.value)) }
}

export type PaymentDerivedStatus = 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'SENT'

/**
 * Rechnungsstatus nach einer Änderung der Zahlungssumme (exakter Vergleich, keine Toleranz).
 *   bezahlt >= Brutto            → PAID
 *   0 < bezahlt < Brutto         → OVERDUE bleibt OVERDUE (Überfälligkeit geht durch Teilzahlung nicht verloren), sonst PARTIALLY_PAID
 *   bezahlt = 0                  → OVERDUE bleibt OVERDUE, sonst SENT
 */
export function derivePaymentStatus(
  totalGross: MoneyValue,
  paid:       MoneyValue,
  currentStatus: string,
): PaymentDerivedStatus {
  const total = toMoney(totalGross)
  const paidMoney = toMoney(paid)
  if (paidMoney.gte(total)) return 'PAID'
  if (currentStatus === 'OVERDUE') return 'OVERDUE'
  if (paidMoney.gt(0)) return 'PARTIALLY_PAID'
  return 'SENT'
}
