import { describe, expect, it } from 'vitest'
import { canDeleteOffer } from '@/lib/services/offer.service'
import { OfferStatus } from '@/types/enums'

// DELETE-SAFETY-002: canDeleteOffer() ist eine reine Fachregel ohne
// Umgebungsabhängigkeit — siehe order-delete.test.ts für dieselbe Begründung.
describe('Angebote löschen — fachliche Regel gilt unabhängig von der Umgebung', () => {
  it('schützt angenommene Angebote', () => {
    expect(canDeleteOffer(OfferStatus.ACCEPTED)).toBe(false)
  })

  it('schützt in Auftrag umgewandelte Angebote', () => {
    expect(canDeleteOffer(OfferStatus.CONVERTED_TO_ORDER)).toBe(false)
  })

  it('erlaubt weiterhin unkritische Angebotsstatus', () => {
    expect(canDeleteOffer(OfferStatus.DRAFT)).toBe(true)
    expect(canDeleteOffer(OfferStatus.REJECTED)).toBe(true)
    expect(canDeleteOffer(OfferStatus.EXPIRED)).toBe(true)
  })

  it.each(Object.values(OfferStatus).filter((s) => s !== OfferStatus.ACCEPTED && s !== OfferStatus.CONVERTED_TO_ORDER))(
    'erlaubt %s',
    (status) => {
      expect(canDeleteOffer(status)).toBe(true)
    },
  )
})
