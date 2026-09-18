// tests/unit/health-endpoint-auth.test.ts
// CP17: /api/health muss öffentlich (ohne Session) erreichbar sein, damit ein
// Docker-Healthcheck/Reverse-Proxy ihn ohne Login abfragen kann — aber die
// proxy.ts-Matcher-Ausnahme dafür darf ausschließlich api/health betreffen,
// keine benachbarte Route (z. B. api/accounting) und keine Domain-Grenze
// (intern/Collaboration) aufweichen.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tokenState = vi.hoisted(() => ({ getToken: vi.fn() }))
vi.mock('next-auth/jwt', () => ({ getToken: tokenState.getToken }))

import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import proxy, { config as proxyConfig } from '@/proxy'

function matchesProxy(pathname: string) {
  return unstable_doesMiddlewareMatch({
    config: proxyConfig,
    nextConfig: {},
    url: `https://example.test${pathname}`,
  })
}

function request(path: string) {
  return new NextRequest(`https://example.test${path}`)
}

describe('CP17 — /api/health-Ausnahme im Proxy-Matcher', () => {
  beforeEach(() => vi.clearAllMocks())

  it('nimmt /api/health aus dem Matcher aus — Proxy greift dort gar nicht erst', () => {
    expect(matchesProxy('/api/health')).toBe(false)
  })

  it('lässt benachbarte, fachliche API-Routen weiterhin durch den Proxy laufen', () => {
    expect(matchesProxy('/api/accounting')).toBe(true)
    expect(matchesProxy('/api/intern/customers')).toBe(true)
    expect(matchesProxy('/api/collaboration/projects')).toBe(true)
    expect(matchesProxy('/api/healthcheck')).toBe(true)     // keine Präfix-Aufweichung
    expect(matchesProxy('/api/health/details')).toBe(true)  // keine Teilpfad-Aufweichung
  })

  it('liefert an /api/health ohne Session trotzdem 401, falls der Proxy sie je erreichen würde (Verteidigung in der Tiefe)', async () => {
    tokenState.getToken.mockResolvedValue(null)
    const response = await proxy(request('/api/health'))
    expect(response.status).toBe(401)
  })

  it('behält 401 an unauthentifizierten internen/Collaboration-API-Routen bei', async () => {
    tokenState.getToken.mockResolvedValueOnce(null)
    expect((await proxy(request('/api/intern/customers'))).status).toBe(401)
    tokenState.getToken.mockResolvedValueOnce(null)
    expect((await proxy(request('/api/collaboration/projects'))).status).toBe(401)
  })
})
