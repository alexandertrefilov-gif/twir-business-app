import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const tokenState = vi.hoisted(() => ({ getToken: vi.fn() }))
vi.mock('next-auth/jwt', () => ({ getToken: tokenState.getToken }))

import middleware from '@/middleware'
import { COLLABORATION_SESSION_COOKIE, INTERNAL_SESSION_COOKIE } from '@/lib/auth/session-cookies'

function request(path: string) {
  return new NextRequest(`https://example.test${path}`)
}

describe('Auth-Domain-Middleware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lässt das Portal ohne Session öffentlich', async () => {
    expect((await middleware(request('/'))).status).toBe(200)
    expect(tokenState.getToken).not.toHaveBeenCalled()
  })

  it('akzeptiert eine Collaboration-Session nicht für interne Seiten', async () => {
    tokenState.getToken.mockResolvedValue({ authScope: 'COLLABORATION' })
    const response = await middleware(request('/offers'))
    expect(tokenState.getToken).toHaveBeenCalledWith(expect.objectContaining({ cookieName: INTERNAL_SESSION_COOKIE }))
    expect(response.headers.get('location')).toContain('/intern/login')
  })

  it('akzeptiert eine interne Session nicht für Collaboration-Seiten', async () => {
    tokenState.getToken.mockResolvedValue({ authScope: 'INTERNAL' })
    const response = await middleware(request('/collaboration/projects'))
    expect(tokenState.getToken).toHaveBeenCalledWith(expect.objectContaining({ cookieName: COLLABORATION_SESSION_COOKIE }))
    expect(response.headers.get('location')).toContain('/collaboration/login')
  })

  it('liefert an der falschen API-Sicherheitsdomäne 401', async () => {
    tokenState.getToken.mockResolvedValueOnce({ authScope: 'INTERNAL' })
    expect((await middleware(request('/api/collaboration/projects'))).status).toBe(401)

    tokenState.getToken.mockResolvedValueOnce({ authScope: 'COLLABORATION' })
    expect((await middleware(request('/api/intern/customers'))).status).toBe(401)

    tokenState.getToken.mockResolvedValueOnce({ authScope: 'COLLABORATION' })
    expect((await middleware(request('/api/documents/document-a/download'))).status).toBe(401)
  })

  it('verhindert das Wiederverwenden geschützter Seiten aus dem Browsercache', async () => {
    tokenState.getToken.mockResolvedValue({ authScope: 'INTERNAL' })
    const response = await middleware(request('/offers'))
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
