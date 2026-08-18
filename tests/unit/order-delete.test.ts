import { describe, expect, it } from 'vitest'
import { canDeleteOrderInEnvironment } from '@/lib/services/order.service'
import { OrderStatus } from '@/types/enums'

describe('Aufträge in Aufbau- und Testphase löschen', () => {
  it.each(Object.values(OrderStatus))(
    'erlaubt im Entwicklungsbetrieb das Soft-Delete von %s',
    (status) => {
      expect(canDeleteOrderInEnvironment(status, 3, 'development')).toBe(true)
    },
  )

  it('schützt abgerechnete Aufträge in Produktion', () => {
    expect(
      canDeleteOrderInEnvironment(OrderStatus.INVOICED, 0, 'production'),
    ).toBe(false)
  })

  it('schützt Aufträge mit Leistungsnachweisen in Produktion', () => {
    expect(
      canDeleteOrderInEnvironment(OrderStatus.OPEN, 1, 'production'),
    ).toBe(false)
  })

  it('erlaubt offene Aufträge ohne Leistungsnachweise in Produktion', () => {
    expect(
      canDeleteOrderInEnvironment(OrderStatus.OPEN, 0, 'production'),
    ).toBe(true)
  })
})
