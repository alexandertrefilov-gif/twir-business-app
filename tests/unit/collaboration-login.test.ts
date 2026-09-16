import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('bcryptjs', () => ({ default: { compare: vi.fn().mockResolvedValue(true) } }))
vi.mock('@/lib/security/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordFailedAttempt: vi.fn(),
  resetRateLimit: vi.fn(),
}))

import { prisma } from '@/lib/db/prisma'
import { authorizeCollaborationCredentials } from '@/lib/auth/collaboration-options'

const request = { headers: new Headers() }
const baseUser = {
  id: 'u1', email: 'partner@example.test', passwordHash: 'hash', firstName: 'Projekt',
  lastName: 'Partner', status: 'ACTIVE', deletedAt: null,
}

describe('Collaboration-Loginberechtigung', () => {
  beforeEach(() => vi.clearAllMocks())

  it('verweigert auch einem internen ADMIN ohne aktive Projektmitgliedschaft den Collaboration-Zugang', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, collaborationMemberships: [] } as never)
    await expect(authorizeCollaborationCredentials({ email: baseUser.email, password: 'secret' }, request)).resolves.toBeNull()
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({ role: expect.anything() }),
    }))
  })

  it('erteilt admin@demo.local nur mit aktiver Mitgliedschaft eine getrennte Collaboration-Identität', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, collaborationMemberships: [{ id: 'm1' }] } as never)
    await expect(authorizeCollaborationCredentials({ email: 'admin@demo.local', password: 'secret' }, request)).resolves.toMatchObject({ id: 'u1', authScope: 'COLLABORATION' })
  })

  it('liest die Client-IP auch aus dem NextAuth-Header-Record', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser, collaborationMemberships: [] } as never)
    await authorizeCollaborationCredentials(
      { email: baseUser.email, password: 'secret' },
      { headers: { 'X-Forwarded-For': '203.0.113.7, 10.0.0.1' } },
    )
    const { checkRateLimit } = await import('@/lib/security/rate-limiter')
    expect(checkRateLimit).toHaveBeenCalledWith('collaboration-login:203.0.113.7:partner@example.test')
  })
})
