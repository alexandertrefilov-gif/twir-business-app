import { describe, expect, it } from 'vitest'
import { formatOfferNumber } from '@/lib/services/number-sequence.service'

describe('Angebotsnummer', () => {
  it('formatiert Jahr, Monat und zweistellige laufende Nummer', () => {
    expect(formatOfferNumber(new Date(2026, 6, 1), 'AN', 1)).toBe('AN 260701')
    expect(formatOfferNumber(new Date(2026, 10, 30), 'AN', 9)).toBe('AN 261109')
  })

  it('führt nach 99 ohne Kollision dreistellig weiter', () => {
    expect(formatOfferNumber(new Date(2026, 6, 1), 'AN', 100)).toBe('AN 2607100')
  })
})
