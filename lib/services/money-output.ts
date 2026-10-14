// lib/services/money-output.ts
//
// REQ-029 P4-D: Ausgabegrenze für Geldbeträge. Gerechnet wird ausschließlich mit lib/billing (Dezimal);
// erst hier entsteht – für UI und Berichtstypen – ein `number` aus einem exakten Cent-String.
// Bewusst NICHT in lib/billing (dort sind Number(...)/Math.* per Guard verboten).

import { toCentString } from '@/lib/billing/money'
import type { Money } from '@/lib/billing/money'
import { sumMoney } from '@/lib/billing/payment-math'

/** Cent-genaue Zahl aus einem Money-Wert (Zwei-Dezimalstellen-String → number). */
export function moneyToNumber(value: Money): number {
  return Number(toCentString(value))
}

/** Summe von Cent-Beträgen, die bereits als `number` vorliegen (nur Berichtszeilen), exakt addiert. */
export function sumCentNumbers(values: readonly number[]): number {
  return moneyToNumber(sumMoney(values.map((value) => value.toFixed(2))))
}
