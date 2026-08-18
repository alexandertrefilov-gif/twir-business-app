import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getServerSession: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()
  return { ...actual, requirePermission: mocks.requirePermission }
})

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}))

vi.mock('@/lib/services/customer.service', () => ({
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  deleteCustomer: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

import {
  createCustomerAction,
  updateCustomerAction,
} from '@/app/(dashboard)/customers/actions'
import { CustomerCreateSchema } from '@/lib/validators/customer.schema'

const REDIRECT_SIGNAL = new Error('NEXT_REDIRECT')

function validCustomerForm() {
  const formData = new FormData()
  formData.set('name', 'Testkunde GmbH')
  formData.set('country', 'DE')
  return formData
}

describe('Kundenstammdaten speichern', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@example.test',
      role: 'ADMIN',
    })
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'user-1', email: 'admin@example.test' },
    })
    mocks.redirect.mockImplementation(() => {
      throw REDIRECT_SIGNAL
    })
  })

  it('leitet nach erfolgreichem Anlegen weiter, ohne das Redirect-Signal abzufangen', async () => {
    mocks.createCustomer.mockResolvedValue('customer-1')

    await expect(
      createCustomerAction({}, validCustomerForm()),
    ).rejects.toBe(REDIRECT_SIGNAL)

    expect(mocks.createCustomer).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/customers')
    expect(mocks.redirect).toHaveBeenCalledWith('/customers/customer-1')
  })

  it('übernimmt Ansprechpartner und Abteilung in die Kundendaten', async () => {
    mocks.createCustomer.mockResolvedValue('customer-1')
    const formData = validCustomerForm()
    formData.set('contactSalutation', 'Herr')
    formData.set('contactFirstName', 'Harry')
    formData.set('contactLastName', 'Bitzer')
    formData.set('contactDepartment', 'MO/PSE')

    await expect(createCustomerAction({}, formData)).rejects.toBe(REDIRECT_SIGNAL)

    expect(mocks.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Testkunde GmbH',
        contactSalutation: 'Herr',
        contactFirstName: 'Harry',
        contactLastName: 'Bitzer',
        contactDepartment: 'MO/PSE',
      }),
      'user-1',
      'admin@example.test',
    )
  })

  it('verlangt bei einer Abteilung einen vollständigen Ansprechpartner', () => {
    const result = CustomerCreateSchema.safeParse({
      name: 'Testkunde GmbH',
      country: 'DE',
      contactDepartment: 'MO/PSE',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors
      expect(fields.contactFirstName).toBeDefined()
      expect(fields.contactLastName).toBeDefined()
    }
  })

  it('leitet nach erfolgreicher Aktualisierung weiter, ohne das Redirect-Signal abzufangen', async () => {
    mocks.updateCustomer.mockResolvedValue(undefined)

    await expect(
      updateCustomerAction('customer-1', {}, validCustomerForm()),
    ).rejects.toBe(REDIRECT_SIGNAL)

    expect(mocks.updateCustomer).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/customers/customer-1')
    expect(mocks.redirect).toHaveBeenCalledWith('/customers/customer-1')
  })

  it('zeigt einen echten Speicherfehler weiterhin im Formular', async () => {
    mocks.updateCustomer.mockRejectedValue(new Error('Datenbank nicht erreichbar'))

    const state = await updateCustomerAction(
      'customer-1',
      {},
      validCustomerForm(),
    )

    expect(state).toEqual({
      success: false,
      error: 'Datenbank nicht erreichbar',
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
