import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { GET } from '@/app/api/image-optimizer-disabled/route'
import { config as proxyConfig } from '@/proxy'

function matchesMiddleware(pathname: string) {
  return unstable_doesMiddlewareMatch({
    config: proxyConfig,
    nextConfig: {},
    url: `https://example.test${pathname}`,
  })
}

describe('Deaktivierter Next.js Image Optimizer', () => {
  it('liefert am internen Sperrhandler 404', () => {
    expect(GET().status).toBe(404)
  })

  it('lässt statische Next.js-Assets unverändert außerhalb der Middleware', () => {
    expect(matchesMiddleware('/_next/static/chunks/app.js')).toBe(false)
  })

  it('führt öffentliche Routen durch die Scope-Middleware', () => {
    expect(matchesMiddleware('/')).toBe(true)
    expect(matchesMiddleware('/intern/login')).toBe(true)
    expect(matchesMiddleware('/collaboration/login')).toBe(true)
  })

  it('behält den bestehenden Middleware-Schutz für Fachrouten bei', () => {
    expect(matchesMiddleware('/customers')).toBe(true)
    expect(matchesMiddleware('/offers')).toBe(true)
  })

  it('beschränkt den Middleware-Importgraphen auf Edge-kompatible Einstiegspunkte', () => {
    const source = readFileSync(resolve(process.cwd(), 'proxy.ts'), 'utf8')
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)]
      .map((match) => match[1])

    expect(imports).toEqual(['next-auth/jwt', 'next/server', '@/lib/auth/session-cookies'])
  })
})
