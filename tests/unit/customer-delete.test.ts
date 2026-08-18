import { describe, expect, it } from 'vitest'
import { canDeleteCustomerInEnvironment } from '@/lib/services/customer.service'

describe('Kunden in Aufbau- und Testphase löschen', () => {
  it('erlaubt im Entwicklungsbetrieb das Soft-Delete mit Testdaten', () => {
    expect(canDeleteCustomerInEnvironment(2, 3, 'development')).toBe(true)
  })

  it('schützt Kunden mit aktiven Rechnungen in Produktion', () => {
    expect(canDeleteCustomerInEnvironment(1, 0, 'production')).toBe(false)
  })

  it('schützt Kunden mit aktiven Aufträgen in Produktion', () => {
    expect(canDeleteCustomerInEnvironment(0, 1, 'production')).toBe(false)
  })

  it('erlaubt Kunden ohne aktive Vorgänge in Produktion', () => {
    expect(canDeleteCustomerInEnvironment(0, 0, 'production')).toBe(true)
  })
})
