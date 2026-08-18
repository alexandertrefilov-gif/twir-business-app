import { describe, expect, it } from 'vitest'
import { canDeleteOfferInEnvironment } from '@/lib/services/offer.service'
import { OfferStatus } from '@/types/enums'

describe('Angebote in Aufbau- und Testphase löschen', () => {
  it.each(Object.values(OfferStatus))(
    'erlaubt im Entwicklungsbetrieb das Löschen von %s',
    (status) => {
      expect(canDeleteOfferInEnvironment(status, 'development')).toBe(true)
    },
  )

  it('schützt angenommene Angebote in Produktion', () => {
    expect(
      canDeleteOfferInEnvironment(OfferStatus.ACCEPTED, 'production'),
    ).toBe(false)
  })

  it('schützt in Auftrag umgewandelte Angebote in Produktion', () => {
    expect(
      canDeleteOfferInEnvironment(OfferStatus.CONVERTED_TO_ORDER, 'production'),
    ).toBe(false)
  })

  it('erlaubt weiterhin unkritische Angebotsstatus in Produktion', () => {
    expect(canDeleteOfferInEnvironment(OfferStatus.DRAFT, 'production')).toBe(true)
    expect(canDeleteOfferInEnvironment(OfferStatus.REJECTED, 'production')).toBe(true)
    expect(canDeleteOfferInEnvironment(OfferStatus.EXPIRED, 'production')).toBe(true)
  })
})
