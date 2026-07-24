import { describe, expect, it } from 'vitest'
import { getSafeCallbackUrl } from '@/lib/auth/callback-url'

describe('Sichere Login-Weiterleitung', () => {
  it('verwendet ohne callbackUrl die Startseite', () => {
    expect(getSafeCallbackUrl(null)).toBe('/')
  })

  it('erlaubt einen internen Pfad', () => {
    expect(getSafeCallbackUrl('/invoices?status=open')).toBe('/invoices?status=open')
  })

  it.each([
    'https://example.com',
    '//example.com',
    'javascript:alert(1)',
  ])('verwirft unsichere callbackUrl %s', (callbackUrl) => {
    expect(getSafeCallbackUrl(callbackUrl)).toBe('/')
  })
})
