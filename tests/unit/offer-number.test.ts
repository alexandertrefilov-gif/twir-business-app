import { describe, expect, it } from 'vitest'
import { formatOfferNumber } from '@/lib/services/number-sequence.service'
import { parseOfferNumber } from '@/lib/services/offer.service'
import { OfferNumberChangeSchema } from '@/lib/validators/offer.schema'
import { offerDisplayName, offerNumberForDisplay } from '@/lib/offers/offer-display'

describe('Angebotsnummer', () => {
  it('formatiert Jahr, Monat und zweistellige laufende Nummer', () => {
    expect(formatOfferNumber(new Date(2026, 6, 1), 'AN', 1)).toBe('AN 260701')
    expect(formatOfferNumber(new Date(2026, 10, 30), 'AN', 9)).toBe('AN 261109')
  })

  it('führt nach 99 ohne Kollision dreistellig weiter', () => {
    expect(formatOfferNumber(new Date(2026, 6, 1), 'AN', 100)).toBe('AN 2607100')
  })

  it.each([
    ['AN 260701', 'AN', { period: 202607, sequence: 1 }],
    ['AN 2611100', 'AN', { period: 202611, sequence: 100 }],
    ['A+ 260715', 'A+', { period: 202607, sequence: 15 }],
  ])('erkennt eine gültige manuelle Nummer %s', (value, prefix, expected) => {
    expect(parseOfferNumber(value, prefix)).toEqual(expected)
  })

  it.each([
    '',
    'AN260701',
    'AN 20260701',
    'AN 261301',
    'RE 260701',
    'AN 260700',
    'AN 26071',
  ])('weist das ungültige Format %j zurück', (value) => {
    expect(parseOfferNumber(value, 'AN')).toBeNull()
  })

  it('trimmt den Eingabewert vor der serverseitigen Verarbeitung', () => {
    expect(OfferNumberChangeSchema.parse({ offerNumber: '  AN 260701  ' })).toEqual({
      offerNumber: 'AN 260701',
    })
  })

  it('normalisiert nur die sichtbare Legacy-Nummer und erhält vorhandene Bindestriche', () => {
    expect(offerNumberForDisplay('AN 260901')).toBe('AN-260901')
    expect(offerNumberForDisplay('AN-260901')).toBe('AN-260901')
    expect(offerDisplayName('AN 260901', 'Umbau Gefahrstoffschrank Geb. 7'))
      .toBe('AN-260901 – Umbau Gefahrstoffschrank Geb. 7')
    expect(offerDisplayName('AN 260901', null)).toBe('AN-260901')
  })
})
