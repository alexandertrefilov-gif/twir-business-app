import { describe, expect, it } from 'vitest'
import { getSafeCallbackUrl } from '@/lib/auth/callback-url'

describe('Sichere Login-Weiterleitung', () => {
  it('verwendet ohne callbackUrl die Startseite', () => {
    expect(getSafeCallbackUrl(null)).toBe('/intern/dashboard')
  })

  it('erlaubt einen internen Pfad', () => {
    expect(getSafeCallbackUrl('/intern/invoices?status=open')).toBe('/intern/invoices?status=open')
  })

  it.each([
    'https://example.com',
    '//example.com',
    'javascript:alert(1)',
    '/intern/%2e%2e/collaboration/dashboard',
    '/intern/%2f%2fcollaboration/dashboard',
  ])('verwirft unsichere callbackUrl %s', (callbackUrl) => {
    expect(getSafeCallbackUrl(callbackUrl)).toBe('/intern/dashboard')
  })

  it('trennt interne und Collaboration-Ziele strikt', () => {
    expect(getSafeCallbackUrl('/collaboration/dashboard', 'internal')).toBe('/intern/dashboard')
    expect(getSafeCallbackUrl('/intern/dashboard', 'collaboration')).toBe('/collaboration/dashboard')
    expect(getSafeCallbackUrl('/collaboration/projects/a', 'collaboration')).toBe('/collaboration/projects/a')
  })
})
