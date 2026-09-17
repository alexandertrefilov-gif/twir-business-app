// tests/unit/require-page-permission.test.ts
// CP15-Release-Blocker-Regression: requirePagePermission() muss ein aus
// requirePermission() geworfenes ForbiddenError/UnauthorizedError auf die
// jeweils passende Next.js-Interrupt-Funktion abbilden (403/401), statt
// als generischer, unbehandelter Renderfehler (HTTP 500) zu enden.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

const navigation = vi.hoisted(() => ({
  forbidden: vi.fn(() => { throw new Error('NEXT_FORBIDDEN') }),
  unauthorized: vi.fn(() => { throw new Error('NEXT_UNAUTHORIZED') }),
}))
vi.mock('next/navigation', () => navigation)

import { Action, Resource, requirePagePermission } from '@/lib/auth/permissions'
import { RoleName } from '@/types/enums'

describe('requirePagePermission — zentrale 401/403-Behandlung für Server-Component-Seiten', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ruft forbidden() auf, wenn die Rolle keine Berechtigung hat, statt den Fehler unbehandelt durchzureichen', async () => {
    auth.getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'u1@test', role: RoleName.EMPLOYEE } })
    await expect(requirePagePermission(Resource.ACCOUNTING, Action.READ)).rejects.toThrow('NEXT_FORBIDDEN')
    expect(navigation.forbidden).toHaveBeenCalledTimes(1)
    expect(navigation.unauthorized).not.toHaveBeenCalled()
  })

  it('ruft unauthorized() auf, wenn keine Session vorhanden ist', async () => {
    auth.getServerSession.mockResolvedValue(null)
    await expect(requirePagePermission(Resource.ACCOUNTING, Action.READ)).rejects.toThrow('NEXT_UNAUTHORIZED')
    expect(navigation.unauthorized).toHaveBeenCalledTimes(1)
    expect(navigation.forbidden).not.toHaveBeenCalled()
  })

  it('gibt den Actor unverändert zurück, wenn die Berechtigung besteht — kein Interrupt', async () => {
    auth.getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'u1@test', role: RoleName.ADMIN } })
    await expect(requirePagePermission(Resource.ACCOUNTING, Action.READ)).resolves.toEqual({
      userId: 'u1', userEmail: 'u1@test', role: RoleName.ADMIN,
    })
    expect(navigation.forbidden).not.toHaveBeenCalled()
    expect(navigation.unauthorized).not.toHaveBeenCalled()
  })
})
