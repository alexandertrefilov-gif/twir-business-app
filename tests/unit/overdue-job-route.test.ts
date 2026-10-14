// REQ-029 P5-2 Phase 2: geschützter Job-Endpunkt POST /api/jobs/overdue-invoices.
// Die Fachlogik (markOverdueInvoices) ist gemockt; geprüft werden Authentifizierung, Statuscodes, Antwortform,
// Protokoll und Geheimnisschutz. Datenbank-Nebenläufigkeit ist hierdurch NICHT belegt (separater DB-Test).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const job = vi.hoisted(() => ({ markOverdueInvoices: vi.fn() }))
vi.mock('@/lib/services/dunning.service', () => job)

import * as route from '@/app/api/jobs/overdue-invoices/route'

const TOKEN = 'job-token-0123456789-abcdefghijklmnop' // > 32 Zeichen
const URL_ = 'https://example.test/api/jobs/overdue-invoices'
const post = (authorization?: string) =>
  new Request(URL_, { method: 'POST', headers: authorization === undefined ? {} : { authorization } })

let logs: string[]
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OVERDUE_JOB_TOKEN', TOKEN)
  logs = []
  const capture = (...args: unknown[]) => { logs.push(args.map(String).join(' ')) }
  vi.spyOn(console, 'info').mockImplementation(capture)
  vi.spyOn(console, 'error').mockImplementation(capture)
  vi.spyOn(console, 'log').mockImplementation(capture)
  vi.spyOn(console, 'warn').mockImplementation(capture)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Route-Konfiguration', () => {
  it('läuft in der Node-Runtime und ist nie statisch', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.dynamic).toBe('force-dynamic')
  })
})

describe('Methoden', () => {
  it.each(['GET', 'PUT', 'PATCH', 'DELETE'] as const)('%s → 405 mit Allow: POST, ohne Jobaufruf', async (method) => {
    const response = await route[method]()
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
    expect(job.markOverdueInvoices).not.toHaveBeenCalled()
  })
})

describe('Authentifizierung', () => {
  it('fehlendes Token → 401 mit WWW-Authenticate, Job wird nicht aufgerufen', async () => {
    const response = await route.POST(post())
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(job.markOverdueInvoices).not.toHaveBeenCalled()
  })

  it('falsches Token → 401, Job wird nicht aufgerufen', async () => {
    const response = await route.POST(post('Bearer falsch-falsch-falsch-falsch-falsch-1234'))
    expect(response.status).toBe(401)
    expect(job.markOverdueInvoices).not.toHaveBeenCalled()
  })

  it.each([
    ['nicht gesetzt', undefined],
    ['leer', ''],
    ['31 Zeichen', 'x'.repeat(31)],
  ])('Server-Token %s → 503 (fail-closed), Job wird nicht aufgerufen', async (_label, token) => {
    if (token === undefined) vi.stubEnv('OVERDUE_JOB_TOKEN', undefined as unknown as string)
    else vi.stubEnv('OVERDUE_JOB_TOKEN', token)
    if (token === undefined) delete process.env.OVERDUE_JOB_TOKEN
    const response = await route.POST(post(`Bearer ${token ?? TOKEN}`))
    expect(response.status).toBe(503)
    expect(job.markOverdueInvoices).not.toHaveBeenCalled()
  })

  it('Antworten sind nicht cachebar', async () => {
    expect((await route.POST(post())).headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('erfolgreicher Lauf', () => {
  it('200 mit Antwortform; Job wird genau einmal mit einem Date aufgerufen', async () => {
    job.markOverdueInvoices.mockResolvedValue(3)
    const response = await route.POST(post(`Bearer ${TOKEN}`))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ status: 'ok', marked: 3 })
    expect(body.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(body.berlinDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof body.durationMs).toBe('number')
    expect(Object.keys(body).sort()).toEqual(['berlinDate', 'durationMs', 'marked', 'runId', 'status'])
    expect(job.markOverdueInvoices).toHaveBeenCalledTimes(1)
    expect(job.markOverdueInvoices.mock.calls[0][0]).toBeInstanceOf(Date)
  })

  it('berlinDate und der übergebene Zeitpunkt stammen aus derselben Uhrzeit (Berliner Tageswechsel)', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T22:00:00.000Z'))
    job.markOverdueInvoices.mockResolvedValue(0)
    const body = await (await route.POST(post(`Bearer ${TOKEN}`))).json()
    expect(body.berlinDate).toBe('2026-10-16')
    expect((job.markOverdueInvoices.mock.calls[0][0] as Date).toISOString()).toBe('2026-10-15T22:00:00.000Z')
    vi.setSystemTime(new Date('2026-10-15T21:59:59.999Z'))
    expect((await (await route.POST(post(`Bearer ${TOKEN}`))).json()).berlinDate).toBe('2026-10-15')
  })

  it('Doppelaufruf: jeder Aufruf liefert 200 mit eigener Lauf-ID; die Idempotenz liegt im Job', async () => {
    job.markOverdueInvoices.mockResolvedValueOnce(2).mockResolvedValueOnce(0)
    const first = await (await route.POST(post(`Bearer ${TOKEN}`))).json()
    const second = await (await route.POST(post(`Bearer ${TOKEN}`))).json()
    expect([first.marked, second.marked]).toEqual([2, 0])
    expect(first.runId).not.toBe(second.runId)
  })
})

describe('fehlgeschlagener Lauf', () => {
  it('Job-Fehler → 500 mit Lauf-ID; Fehlerdetails stehen nicht in der Antwort, wohl im Log', async () => {
    job.markOverdueInvoices.mockRejectedValue(new Error('Überfälligkeitslauf: 1 markiert, 1 Fehler (inv-77: db down)'))
    const response = await route.POST(post(`Bearer ${TOKEN}`))
    expect(response.status).toBe(500)
    const text = JSON.stringify(await response.json())
    expect(text).toContain('failed')
    expect(text).not.toContain('inv-77')
    expect(text).not.toContain('db down')
    expect(logs.some((line) => line.includes('inv-77') && line.includes('"status":"failed"'))).toBe(true)
  })

  it('nicht-Error-Wert wird ebenfalls als 500 behandelt', async () => {
    job.markOverdueInvoices.mockRejectedValue('kaputt')
    expect((await route.POST(post(`Bearer ${TOKEN}`))).status).toBe(500)
  })
})

describe('Protokoll und Geheimnisschutz', () => {
  it('erfolgreicher Lauf: Start- und Endzeile als JSON mit Lauf-ID, Zählern und Dauer', async () => {
    job.markOverdueInvoices.mockResolvedValue(1)
    const body = await (await route.POST(post(`Bearer ${TOKEN}`))).json()
    const lines = logs.map((line) => JSON.parse(line))
    expect(lines.map((l) => l.phase)).toEqual(['start', 'end'])
    expect(lines.every((l) => l.event === 'overdue-job' && l.runId === body.runId)).toBe(true)
    expect(lines[1]).toMatchObject({ status: 'ok', marked: 1 })
  })

  it('weder Server- noch Aufrufer-Token erscheinen in Antworten oder Logs', async () => {
    const wrong = 'falsches-Token-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0001'
    job.markOverdueInvoices.mockResolvedValue(0)
    const bodies = [
      await (await route.POST(post(`Bearer ${wrong}`))).text(),
      await (await route.POST(post())).text(),
      await (await route.POST(post(`Bearer ${TOKEN}`))).text(),
    ]
    job.markOverdueInvoices.mockRejectedValue(new Error('boom'))
    bodies.push(await (await route.POST(post(`Bearer ${TOKEN}`))).text())
    const everything = [...bodies, ...logs].join('\n')
    expect(everything).not.toContain(TOKEN)
    expect(everything).not.toContain(wrong)
  })

  it('abgewiesene Aufrufe werden ohne Details protokolliert', async () => {
    await route.POST(post('Bearer falsch-falsch-falsch-falsch-falsch-1234'))
    const entry = JSON.parse(logs[0])
    expect(entry).toMatchObject({ event: 'overdue-job', phase: 'rejected', reason: 'invalid' })
  })
})
