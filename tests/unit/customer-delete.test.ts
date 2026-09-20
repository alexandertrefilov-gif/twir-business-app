import { describe, expect, it } from 'vitest'
import { canDeleteCustomer } from '@/lib/services/customer.service'

// DELETE-SAFETY-002: canDeleteCustomer() ist eine reine Fachregel ohne
// Umgebungsabhängigkeit — siehe order-delete.test.ts für dieselbe Begründung.
describe('Kunden löschen — fachliche Regel gilt unabhängig von der Umgebung', () => {
  it('schützt Kunden mit aktiven Rechnungen', () => {
    expect(canDeleteCustomer(1, 0)).toBe(false)
  })

  it('schützt Kunden mit aktiven Aufträgen', () => {
    expect(canDeleteCustomer(0, 1)).toBe(false)
  })

  it('schützt Kunden mit aktiven Rechnungen und Aufträgen', () => {
    expect(canDeleteCustomer(2, 3)).toBe(false)
  })

  it('erlaubt Kunden ohne aktive Vorgänge', () => {
    expect(canDeleteCustomer(0, 0)).toBe(true)
  })
})
