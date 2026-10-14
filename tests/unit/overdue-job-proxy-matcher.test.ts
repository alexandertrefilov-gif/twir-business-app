// REQ-029 P5-2 Phase 2: Der Job-Pfad steht – exakt und nur er – außerhalb des Session-Proxys.
// Muster wie tests/unit/health-endpoint-auth.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tokenState = vi.hoisted(() => ({ getToken: vi.fn() }))
vi.mock('next-auth/jwt', () => ({ getToken: tokenState.getToken }))

import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import proxy, { config as proxyConfig } from '@/proxy'

const matchesProxy = (pathname: string) =>
  unstable_doesMiddlewareMatch({ config: proxyConfig, nextConfig: {}, url: `https://example.test${pathname}` })

describe('Proxy-Matcher: /api/jobs/overdue-invoices', () => {
  beforeEach(() => vi.clearAllMocks())

  it('nimmt genau /api/jobs/overdue-invoices aus dem Matcher aus', () => {
    expect(matchesProxy('/api/jobs/overdue-invoices')).toBe(false)
  })

  it.each([
    '/api/jobs',
    '/api/jobs/',
    '/api/jobs/other',
    '/api/jobs/overdue-invoices/',
    '/api/jobs/overdue-invoices/x',
    '/api/jobs/overdue-invoices-x',
    '/api/jobs/overdue-invoicesx',
    '/api/jobs/overdue-invoices/details',
    '/api/intern/jobs/overdue-invoices',
    '/api/collaboration/jobs/overdue-invoices',
  ])('lässt %s weiterhin durch den Proxy laufen (keine Präfix-/Teilpfad-Aufweichung)', (path) => {
    expect(matchesProxy(path)).toBe(true)
  })

  it('bestehende Ausnahmen und fachliche Routen bleiben unverändert', () => {
    expect(matchesProxy('/api/health')).toBe(false)
    expect(matchesProxy('/api/auth/session')).toBe(false)
    expect(matchesProxy('/api/accounting')).toBe(true)
    expect(matchesProxy('/api/intern/customers')).toBe(true)
    expect(matchesProxy('/api/collaboration/projects')).toBe(true)
    expect(matchesProxy('/api/invoices/1/pdf')).toBe(true)
  })

  it('Tiefenverteidigung: erreichte der Proxy den Pfad doch, verlangt er eine Sitzung (401)', async () => {
    tokenState.getToken.mockResolvedValue(null)
    const response = await proxy(new NextRequest('https://example.test/api/jobs/overdue-invoices'))
    expect(response.status).toBe(401)
  })

  it('Matcher-Eintrag enthält die Ausnahme genau einmal und nur als exakten Pfad mit $', () => {
    const matcher = String(proxyConfig.matcher[0])
    expect(matcher.match(/api\/jobs\/overdue-invoices\$/g)).toHaveLength(1)
    expect(matcher).not.toContain('api/jobs|')
    expect(matcher).not.toContain('api/jobs/overdue-invoices|')
  })
})
