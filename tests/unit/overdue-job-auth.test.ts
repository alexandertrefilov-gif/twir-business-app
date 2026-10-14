// REQ-029 P5-2 Phase 2: Bearer-Authentifizierung des Überfälligkeits-Jobs (fail-closed, zeitkonstant).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  authenticateOverdueJobRequest,
  OVERDUE_JOB_TOKEN_ENV,
  OVERDUE_JOB_TOKEN_MIN_LENGTH,
} from '@/lib/services/overdue-job-auth'

const TOKEN = 'a'.repeat(31) + 'B' // genau 32 Zeichen
const req = (authorization?: string) =>
  new Request('https://example.test/api/jobs/overdue-invoices', {
    method: 'POST',
    headers: authorization === undefined ? {} : { authorization },
  })
const env = (token: string | undefined) => ({ [OVERDUE_JOB_TOKEN_ENV]: token })

describe('Konfiguration (fail-closed)', () => {
  it('Mindestlänge ist 32 Zeichen', () => {
    expect(OVERDUE_JOB_TOKEN_MIN_LENGTH).toBe(32)
  })

  it.each([
    ['nicht gesetzt', undefined],
    ['leer', ''],
    ['31 Zeichen', 'x'.repeat(31)],
  ])('Server-Token %s → 503, auch bei „passendem“ Header', (_label, token) => {
    const result = authenticateOverdueJobRequest(req(`Bearer ${token ?? ''}`), env(token))
    expect(result).toEqual({ ok: false, status: 503, reason: 'not_configured' })
  })

  it('Server-Token nicht konfiguriert: auch ohne Header 503 (kein Rückschluss über Header-Zustand)', () => {
    expect(authenticateOverdueJobRequest(req(), env(undefined))).toMatchObject({ ok: false, status: 503 })
  })

  it('genau 32 Zeichen sind ausreichend', () => {
    expect(authenticateOverdueJobRequest(req(`Bearer ${TOKEN}`), env(TOKEN))).toEqual({ ok: true })
  })
})

describe('Authentifizierung', () => {
  it('fehlender Header → 401 (missing)', () => {
    expect(authenticateOverdueJobRequest(req(), env(TOKEN))).toEqual({ ok: false, status: 401, reason: 'missing' })
  })

  it.each([
    ['anderes Schema', `Basic ${TOKEN}`],
    ['ohne Schema', TOKEN],
    ['leeres Token', 'Bearer '],
    ['zwei Leerzeichen', `Bearer  ${TOKEN}`],
    ['Token mit Zusatz', `Bearer ${TOKEN} extra`],
  ])('ungültiges Format (%s) → 401', (_label, header) => {
    expect(authenticateOverdueJobRequest(req(header), env(TOKEN))).toMatchObject({ ok: false, status: 401 })
  })

  it.each([
    ['falsches Token gleicher Länge', 'c'.repeat(31) + 'B'],
    ['kürzeres Token', 'a'.repeat(10)],
    ['längeres Token', TOKEN + 'x'],
    ['Präfix des Tokens', TOKEN.slice(0, 31)],
    ['Groß-/Kleinschreibung verändert', TOKEN.toLowerCase()],
  ])('%s → 401 (invalid), ohne Ausnahme', (_label, wrong) => {
    expect(authenticateOverdueJobRequest(req(`Bearer ${wrong}`), env(TOKEN))).toEqual({ ok: false, status: 401, reason: 'invalid' })
  })

  it('korrektes Token → ok; Schema „bearer“ in beliebiger Schreibweise', () => {
    expect(authenticateOverdueJobRequest(req(`Bearer ${TOKEN}`), env(TOKEN))).toEqual({ ok: true })
    expect(authenticateOverdueJobRequest(req(`bearer ${TOKEN}`), env(TOKEN))).toEqual({ ok: true })
    expect(authenticateOverdueJobRequest(req(`BEARER ${TOKEN}`), env(TOKEN))).toEqual({ ok: true })
  })

  it('liest standardmäßig process.env', () => {
    const original = process.env[OVERDUE_JOB_TOKEN_ENV]
    try {
      process.env[OVERDUE_JOB_TOKEN_ENV] = TOKEN
      expect(authenticateOverdueJobRequest(req(`Bearer ${TOKEN}`))).toEqual({ ok: true })
      delete process.env[OVERDUE_JOB_TOKEN_ENV]
      expect(authenticateOverdueJobRequest(req(`Bearer ${TOKEN}`))).toMatchObject({ ok: false, status: 503 })
    } finally {
      if (original === undefined) delete process.env[OVERDUE_JOB_TOKEN_ENV]
      else process.env[OVERDUE_JOB_TOKEN_ENV] = original
    }
  })

  it('das Ergebnis enthält nie das Token', () => {
    for (const result of [
      authenticateOverdueJobRequest(req(`Bearer wrong-${TOKEN}`), env(TOKEN)),
      authenticateOverdueJobRequest(req(), env(TOKEN)),
      authenticateOverdueJobRequest(req(`Bearer ${TOKEN}`), env(TOKEN)),
    ]) {
      expect(JSON.stringify(result)).not.toContain(TOKEN)
    }
  })
})

describe('Quelltext-Prüfung', () => {
  const source = readFileSync(resolve(process.cwd(), 'lib/services/overdue-job-auth.ts'), 'utf8')

  it('vergleicht SHA-256-Digests mit timingSafeEqual und nicht per ===', () => {
    expect(source).toContain("createHash('sha256')")
    expect(source).toContain('timingSafeEqual(digest(provided), digest(expected))')
    expect(source).not.toMatch(/provided\s*[!=]==?\s*expected|expected\s*[!=]==?\s*provided/)
  })

  it('protokolliert nichts', () => {
    expect(source).not.toMatch(/console\./)
  })
})
