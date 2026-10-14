// lib/billing/format.ts
// Reine String-Formatierung für Anzeigewerte (de-DE). Keine Rechenlogik, keine Floats.

import { MoneyDecimal } from './money'

/** "1234.5" → "1.234,50". Nur für die Anzeige bereits berechneter Werte. */
export function formatDecimalDe(value: string, scale = 2): string {
  const parsed = new MoneyDecimal(value)
  const fixed = parsed.toFixed(scale)
  // "-0.00" (z. B. aus -0.004) wird ohne Vorzeichen angezeigt
  const negative = fixed.startsWith('-') && /[1-9]/.test(fixed)
  const [integerPart, fraction] = fixed.replace('-', '').split('.')
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${grouped}${fraction ? `,${fraction}` : ''}`
}
