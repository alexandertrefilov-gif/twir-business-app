import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getServerSession: vi.fn(),
  updateSettings: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()
  return { ...actual, requirePermission: mocks.requirePermission }
})

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}))

vi.mock('@/lib/services/settings.service', () => ({
  updateSettings: mocks.updateSettings,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { updateSettingsAction } from '@/app/(dashboard)/settings/actions'

function validSettingsForm() {
  const formData = new FormData()
  formData.set('companyName', 'TWIR GmbH')
  formData.set('defaultPaymentTermDays', '14')
  formData.set('defaultTaxRate', '19')
  return formData
}

describe('React-18-kompatibler Formularzustand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'user@example.test',
      role: 'ADMIN',
    })
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.test' },
    })
    mocks.updateSettings.mockResolvedValue(undefined)
  })

  it('liefert den bestehenden Erfolgszustand', async () => {
    const state = await updateSettingsAction({}, validSettingsForm())

    expect(state).toEqual({ success: true })
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings')
  })

  it('liefert den bestehenden Validierungszustand', async () => {
    const state = await updateSettingsAction({}, new FormData())

    expect(state.success).toBe(false)
    expect(state.error).toBe('Bitte alle Pflichtfelder korrekt ausfüllen.')
    expect(state.fieldErrors?.companyName).toBeDefined()
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  it('liefert den bestehenden Fehlerzustand des Services', async () => {
    mocks.updateSettings.mockRejectedValue(new Error('Speichern fehlgeschlagen'))

    const state = await updateSettingsAction({}, validSettingsForm())

    expect(state).toEqual({
      success: false,
      error: 'Speichern fehlgeschlagen',
    })
  })
})
