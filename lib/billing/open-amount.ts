// lib/billing/open-amount.ts
//
// REQ-029 P5-4 Schritt 3: Zentrale, reine Anzeige-Fachlogik für den aktuellen offenen Betrag und die
// Steuergruppen einer Rechnung. Ausschließlich Dezimalarithmetik (decimal.js), Beträge als Cent-Strings,
// kein `number`, keine Datenbank, keine Seiteneffekte (Guard: tests/unit/billing/no-float.test.ts).
//
// Fachliche Quellen (Owner-Entscheidung P5-4):
//   - Aktueller offener Betrag: Σ aktiver Zahlungszeilen (deletedAt IS NULL) – dieselbe Quelle wie addPayment und
//     Mahn-Policy. `invoice.paidAmount` ist nur Cache/Konsistenzwert und wird bei Abweichung NICHT stillschweigend
//     zur Wahrheit; ohne Zahlungszeilen (fehlende Leseberechtigung) dient der Cache als ausgewiesener Rückfall.
//   - Steuergruppen: roundCents(Σ gespeichertes Positions-Netto (BT-131) je Satz × Satz / 100) – Calculator-Semantik
//     (BT-117, einmal je Satz gerundet). Die einzeln gerundeten Positionssteuern werden NICHT summiert.
//   - Mahnung: bekommt den offenen Betrag als eingefrorenen Wert aus dem Snapshot (dunning-basis-v1), nicht von hier.

import { MoneyDecimal, roundCents, toCentString } from './money'
import type { Money } from './money'
import { sumMoney, toMoney, remainingMoney } from './payment-math'
import type { MoneyValue } from './payment-math'

export type OpenAmountSource = 'active-payments' | 'cache'

export type OpenAmount = {
  totalGross:    string
  /** Bezahlt laut Quelle (`source`). */
  paid:          string
  /** Brutto − bezahlt (negativ bei Überzahlung/Stornorechnung). */
  remaining:     string
  source:        OpenAmountSource
  /** Nur bei source = 'active-payments': Cache `paidAmount` weicht von Σ aktiver Zahlungen ab. */
  cacheDrift:    boolean
  /** Cache-Wert, wie gespeichert (Diagnose). */
  cachePaid:     string
}

/**
 * @param activePaymentAmounts Beträge der aktiven Zahlungszeilen; `null`, wenn sie nicht geladen wurden.
 */
export function resolveOpenAmount(
  totalGross:           MoneyValue,
  cachePaid:            MoneyValue,
  activePaymentAmounts: readonly MoneyValue[] | null,
): OpenAmount {
  const cache = toMoney(cachePaid)
  const source: OpenAmountSource = activePaymentAmounts === null ? 'cache' : 'active-payments'
  const paid = activePaymentAmounts === null ? cache : sumMoney(activePaymentAmounts)
  return {
    totalGross: toCentString(toMoney(totalGross)),
    paid:       toCentString(paid),
    remaining:  toCentString(remainingMoney(totalGross, paid)),
    source,
    cacheDrift: source === 'active-payments' && !paid.equals(cache),
    cachePaid:  toCentString(cache),
  }
}

/** true, wenn der Betrag echt größer als 0,00 ist (ohne Gleitkomma). */
export function isPositiveMoney(value: MoneyValue): boolean {
  return toMoney(value).greaterThan(0)
}

export type TaxGroupInput = {
  taxRate:   MoneyValue
  netAmount: MoneyValue
}

export type TaxGroup = {
  /** Steuersatz in Klartext ohne überflüssige Nullen ("19", "7", "7.5"). */
  rate: string
  /** Σ gespeichertes Positions-Netto der Gruppe (BT-116). */
  net:  string
  /** roundCents(net × rate / 100), einmal je Gruppe (BT-117). */
  tax:  string
}

/**
 * Steuergruppen aus den gespeicherten Positions-Nettobeträgen. Absteigend nach Steuersatz sortiert.
 * Gruppen ohne Steuerbetrag (0 %) werden nicht ausgegeben, wie bisher auf der Rechnungsseite.
 */
export function groupTaxFromStoredNet(items: readonly TaxGroupInput[]): TaxGroup[] {
  const groups = new Map<string, { rate: Money; net: Money }>()
  for (const item of items) {
    const rate = toMoney(item.taxRate)
    const key = rate.toFixed(2)
    const existing = groups.get(key)
    if (existing) existing.net = existing.net.plus(toMoney(item.netAmount))
    else groups.set(key, { rate, net: toMoney(item.netAmount) })
  }
  return [...groups.values()]
    .sort((a, b) => b.rate.comparedTo(a.rate))
    .map((group) => ({
      rate: group.rate.toFixed(),
      net:  toCentString(group.net),
      tax:  toCentString(roundCents(group.net.times(group.rate).dividedBy(100))),
    }))
    .filter((group) => !new MoneyDecimal(group.tax).isZero())
}
