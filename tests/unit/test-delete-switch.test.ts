import { describe, expect, it } from 'vitest'
import {
  isTestDeleteEnabled,
  requireTestDeleteEnabled,
} from '@/lib/security/test-delete'

describe('dreifach geschützter Test-Löschmodus', () => {
  it('ist nur bei Entwicklung und explizitem Wert 1 aktiv', () => {
    expect(isTestDeleteEnabled({
      NODE_ENV: 'development',
      TEST_DELETE_ENABLED: '1',
    })).toBe(true)
  })

  it.each([
    { NODE_ENV: 'development', TEST_DELETE_ENABLED: '0' },
    { NODE_ENV: 'development', TEST_DELETE_ENABLED: undefined },
    { NODE_ENV: 'production', TEST_DELETE_ENABLED: '1' },
    { NODE_ENV: 'test', TEST_DELETE_ENABLED: '1' },
  ])('bleibt bei %o deaktiviert', (env) => {
    expect(isTestDeleteEnabled(env)).toBe(false)
  })

  it('verweigert serverseitig das Löschen bei Schalter 0', () => {
    expect(() => requireTestDeleteEnabled({
      NODE_ENV: 'development',
      TEST_DELETE_ENABLED: '0',
    })).toThrow('Test-Löschfunktion ist deaktiviert.')
  })
})
