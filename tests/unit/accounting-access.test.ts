import { describe, expect, it, vi } from 'vitest'
import { RoleName } from '@/types/enums'
import { Action, Resource, roleHasPermission } from '@/lib/auth/permissions'
import { isAccountingArchivePath, isAccountingDocument } from '@/lib/documents/document-access'

describe('Buchhaltungszugriff', () => {
  it.each([RoleName.ADMIN, RoleName.ACCOUNTING])('%s darf den Bereich lesen', (role) => {
    expect(roleHasPermission(role, Resource.ACCOUNTING, Action.READ)).toBe(true)
  })

  it.each([RoleName.OFFICE, RoleName.PROJECT_MANAGER, RoleName.EMPLOYEE])('%s wird abgewiesen', (role) => {
    expect(roleHasPermission(role, Resource.ACCOUNTING, Action.READ)).toBe(false)
  })

  it('klassifiziert Rechnungsrelationen und Rechnungsdokumenttypen als Finanzbelege', () => {
    expect(isAccountingDocument({ invoiceId: 'invoice-1', type: 'UPLOAD' })).toBe(true)
    expect(isAccountingDocument({ invoiceId: null, type: 'INVOICE_PDF' })).toBe(true)
    expect(isAccountingDocument({ invoiceId: null, type: 'OFFER_PDF' })).toBe(false)
    expect(isAccountingArchivePath('2026/Kunde/Vorgang/05_Rechnung/RE-1.pdf')).toBe(true)
    expect(isAccountingArchivePath('2026/Kunde/01_Angebot/AN-1.pdf')).toBe(false)
  })

  it('schützt das Accounting-Layout vor dem Laden der Seite', async () => {
    vi.resetModules()
    const requirePagePermission = vi.fn().mockRejectedValue(new Error('Keine Berechtigung'))
    vi.doMock('@/lib/auth/permissions', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/auth/permissions')>()), requirePagePermission }))
    const { default: AccountingLayout } = await import('@/app/(dashboard)/accounting/layout')
    await expect(AccountingLayout({ children: null })).rejects.toThrow('Keine Berechtigung')
    expect(requirePagePermission).toHaveBeenCalledWith('accounting', 'read')
  })
})
