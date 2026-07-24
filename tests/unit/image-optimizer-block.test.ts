import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { GET } from '@/app/api/image-optimizer-disabled/route'
import { config as middlewareConfig } from '@/middleware'

function matchesMiddleware(pathname: string) {
  return unstable_doesMiddlewareMatch({
    config: middlewareConfig,
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

  it('lässt die Loginroute unverändert außerhalb der Middleware', () => {
    expect(matchesMiddleware('/login')).toBe(false)
  })

  it('behält den bestehenden Middleware-Schutz für Fachrouten bei', () => {
    expect(matchesMiddleware('/customers')).toBe(true)
    expect(matchesMiddleware('/offers')).toBe(true)
  })

  it('beschränkt den Middleware-Importgraphen auf Edge-kompatible Einstiegspunkte', () => {
    const source = readFileSync(resolve(process.cwd(), 'middleware.ts'), 'utf8')
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)]
      .map((match) => match[1])

    expect(imports).toEqual(['next-auth/middleware', 'next/server'])
  })
})
