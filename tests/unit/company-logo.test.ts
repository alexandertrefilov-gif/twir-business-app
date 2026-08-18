import { describe, expect, it } from 'vitest'
import { hasValidCompanyLogoSignature } from '@/lib/services/settings.service'

describe('Firmenlogo', () => {
  it('akzeptiert strukturell plausible PNG- und JPEG-Bilddaten', () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ])
    const jpeg = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01,
      0xff, 0xd9,
    ])
    expect(hasValidCompanyLogoSignature(
      png,
      'image/png',
    )).toBe(true)
    expect(hasValidCompanyLogoSignature(
      jpeg,
      'image/jpeg',
    )).toBe(true)
  })

  it('weist umbenannte oder nicht unterstützte Dateien zurück', () => {
    expect(hasValidCompanyLogoSignature(
      new TextEncoder().encode('<script>alert(1)</script>'),
      'image/png',
    )).toBe(false)
    expect(hasValidCompanyLogoSignature(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      'image/svg+xml',
    )).toBe(false)
    expect(hasValidCompanyLogoSignature(
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]),
      'image/jpeg',
    )).toBe(false)
  })
})
