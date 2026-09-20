import { describe, expect, it } from 'vitest'
import { canDeleteOrder } from '@/lib/services/order.service'
import { OrderStatus } from '@/types/enums'

// DELETE-SAFETY-002: canDeleteOrder() ist eine reine Fachregel ohne
// Umgebungsabhängigkeit — Development besitzt dieselben Schutzregeln wie
// Production. Ob der Löschpfad überhaupt erreichbar ist, regelt
// ausschließlich requireTestDeleteEnabled() an der Action-Ebene
// (siehe tests/unit/test-delete-switch.test.ts).
describe('Aufträge löschen — fachliche Regel gilt unabhängig von der Umgebung', () => {
  it('schützt abgerechnete Aufträge', () => {
    expect(canDeleteOrder(OrderStatus.INVOICED, 0)).toBe(false)
  })

  it('schützt Aufträge mit Leistungsnachweisen', () => {
    expect(canDeleteOrder(OrderStatus.OPEN, 1)).toBe(false)
  })

  it('erlaubt offene Aufträge ohne Leistungsnachweise', () => {
    expect(canDeleteOrder(OrderStatus.OPEN, 0)).toBe(true)
  })

  it.each(Object.values(OrderStatus).filter((s) => s !== OrderStatus.INVOICED))(
    'erlaubt %s-Aufträge ohne Leistungsnachweise',
    (status) => {
      expect(canDeleteOrder(status, 0)).toBe(true)
    },
  )

  it('schützt Aufträge mit Leistungsnachweisen unabhängig vom Status (außer INVOICED-Sonderfall bereits oben geprüft)', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(canDeleteOrder(status, 3)).toBe(false)
    }
  })
})
