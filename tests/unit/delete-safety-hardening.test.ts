import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PERMISSION_MATRIX } from '@/lib/auth/permissions'
import { RoleName } from '@/types/enums'

// DELETE-SAFETY-002 T14 — Payment-Löschung ist serverseitig auf ACCOUNTING
// beschränkt (removePaymentAction ruft requirePermission(PAYMENT, DELETE)
// auf, siehe app/(dashboard)/payments/actions.ts). Reine Matrix-Prüfung wie
// schon für project:delete in DELETE-SAFETY-001.
describe('Payment-Löschung — Berechtigungsmatrix (T14)', () => {
  it('erlaubt Zahlungslöschung nur ADMIN und ACCOUNTING, nicht OFFICE/EMPLOYEE/PROJECT_MANAGER', () => {
    const roles = PERMISSION_MATRIX['payment:delete']
    expect(roles).toEqual(expect.arrayContaining([RoleName.ADMIN, RoleName.ACCOUNTING]))
    expect(roles).not.toEqual(expect.arrayContaining([RoleName.OFFICE]))
    expect(roles).not.toEqual(expect.arrayContaining([RoleName.EMPLOYEE]))
    expect(roles).not.toEqual(expect.arrayContaining([RoleName.PROJECT_MANAGER]))
  })
})

// DELETE-SAFETY-002 Abschnitt 7 — "Keine Browser-confirm()-Lösung, wenn
// bereits ein konsistentes Dialog-/Form-Muster im Projekt vorhanden ist."
// Regressionsschutz: die in diesem Auftrag von window.confirm() auf
// ConfirmDialog umgestellten Löschpfade dürfen nicht stillschweigend
// zurückfallen.
describe('Kein window.confirm() für produktive Löschpfade (Regressionsschutz)', () => {
  const files = [
    'components/customers/CustomerBillingAddressActions.tsx',
    'components/customers/CustomerDeliveryAddressActions.tsx',
    'components/collaboration/GgaCabinetDeleteButton.tsx',
    'components/payments/PaymentJournal.tsx',
    'components/projects/ProjectDeleteAction.tsx',
  ]

  it.each(files)('%s verwendet kein window.confirm()', (relativePath) => {
    const source = readFileSync(relativePath, 'utf-8')
    expect(source).not.toContain('window.confirm')
  })

  it.each([
    'components/customers/CustomerBillingAddressActions.tsx',
    'components/customers/CustomerDeliveryAddressActions.tsx',
    'components/collaboration/GgaCabinetDeleteButton.tsx',
  ])('%s nutzt den zentralen ConfirmDialog', (relativePath) => {
    const source = readFileSync(relativePath, 'utf-8')
    expect(source).toContain('ConfirmDialog')
  })
})

// DELETE-SAFETY-002 Abschnitt 3/7 — der GGA-Schrank-Löschbutton verlangt
// jetzt Checkbox + Kennungs-Bestätigung wie die Projektlöschung.
describe('GGA-Schrank-Löschung — Identitätsbestätigung im Quelltext verankert', () => {
  it('GgaCabinetDeleteButton verlangt acknowledgeLabel und typedConfirmation', () => {
    const source = readFileSync('components/collaboration/GgaCabinetDeleteButton.tsx', 'utf-8')
    expect(source).toContain('acknowledgeLabel')
    expect(source).toContain('typedConfirmation')
  })
})
