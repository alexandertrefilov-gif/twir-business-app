// REQ-029 P5-2 Phase 1: Tagesgrenze des Überfälligkeitslaufs (Europe/Berlin, serverzeitzonenunabhängig).
// Gemockte Unit-Tests prüfen die Kontrolllogik. Reale Sperr-/Nebenläufigkeitsgarantien (FOR UPDATE) sind
// NICHT hierdurch belegt, sondern erst durch den separat freizugebenden PostgreSQL-Integrationstest.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(), invFindUnique: vi.fn(), invFindMany: vi.fn(), invUpdateMany: vi.fn(), audit: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => {
  const tx = () => ({
    $queryRaw: m.queryRaw,
    invoice: { findUnique: m.invFindUnique, updateMany: m.invUpdateMany },
  })
  return { prisma: { $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx()), invoice: { findMany: m.invFindMany } } }
})
vi.mock('@/lib/services/audit.service', () => ({ buildAuditLogCreate: m.audit }))

import { markOverdueInvoices, OVERDUE_JOB_ACTOR } from '@/lib/services/dunning.service'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const dueAt = (day: string) => new Date(day) // wie z.coerce.date('JJJJ-MM-TT'): UTC-Mitternacht

beforeEach(() => {
  vi.clearAllMocks()
  m.queryRaw.mockResolvedValue([{ id: 'inv-1' }])
  m.invUpdateMany.mockResolvedValue({ count: 1 })
})

describe('Kandidatenabfrage nutzt den Berliner Kalendertag', () => {
  it.each([
    ['2026-10-15T21:59:59.999Z', '2026-10-15T00:00:00.000Z', 'Sommerzeit, 23:59:59.999 Berlin'],
    ['2026-10-15T22:00:00.000Z', '2026-10-16T00:00:00.000Z', 'Sommerzeit, 00:00 Berlin Folgetag'],
    ['2026-01-15T22:59:59.999Z', '2026-01-15T00:00:00.000Z', 'Winterzeit, 23:59:59.999 Berlin'],
    ['2026-01-15T23:00:00.000Z', '2026-01-16T00:00:00.000Z', 'Winterzeit, 00:00 Berlin Folgetag'],
    ['2026-03-28T23:00:00.000Z', '2026-03-29T00:00:00.000Z', 'Beginn des Sommerzeit-Umstellungstags'],
    ['2026-10-24T22:00:00.000Z', '2026-10-25T00:00:00.000Z', 'Beginn des Winterzeit-Umstellungstags'],
  ])('now=%s → dueDate < %s (%s)', async (now, expectedBoundary) => {
    m.invFindMany.mockResolvedValue([])
    await markOverdueInvoices(new Date(now))
    const where = m.invFindMany.mock.calls[0][0].where
    expect(where.dueDate.lt).toEqual(new Date(expectedBoundary))
  })

  it('Umfang unverändert: nur SENT, keine Stornorechnungen, kein PARTIALLY_PAID (E5)', async () => {
    m.invFindMany.mockResolvedValue([])
    await markOverdueInvoices(new Date('2026-10-16T10:00:00.000Z'))
    const { where } = m.invFindMany.mock.calls[0][0]
    expect(where.status).toBe('SENT')
    expect(where.type).toEqual({ not: 'CANCELLATION' })
    expect(JSON.stringify(where)).not.toContain('PARTIALLY_PAID')
  })
})

describe('Rückprüfung unter Sperre (Tagesgrenze)', () => {
  const run = async (now: string, due: string) => {
    m.invFindMany.mockResolvedValue([{ id: 'inv-1' }])
    m.invFindUnique.mockResolvedValue({ status: 'SENT', type: 'STANDARD', dueDate: dueAt(due) })
    return markOverdueInvoices(new Date(now))
  }

  it('am Fälligkeitstag (bis 23:59:59.999 Berlin) nicht überfällig – kein Update, kein Audit', async () => {
    await expect(run('2026-10-15T21:59:59.999Z', '2026-10-15')).resolves.toBe(0)
    expect(m.invUpdateMany).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled()
  })

  it('ab 00:00 Berlin am Folgetag überfällig – Update mit Statusbedingung und Audit mit Kalenderdatum', async () => {
    await expect(run('2026-10-15T22:00:00.000Z', '2026-10-15')).resolves.toBe(1)
    expect(m.invUpdateMany).toHaveBeenCalledWith({ where: { id: 'inv-1', status: 'SENT' }, data: { status: 'OVERDUE' } })
    expect(m.audit.mock.calls[0][1]).toMatchObject({
      userId: null, userEmail: OVERDUE_JOB_ACTOR, action: 'STATUS_CHANGE', entityId: 'inv-1',
      oldValue: { status: 'SENT' }, newValue: { status: 'OVERDUE' }, metadata: { source: 'overdue-job', dueDate: '2026-10-15' },
    })
  })

  it('Winterzeit: 22:59:59.999Z nicht überfällig, 23:00Z überfällig', async () => {
    await expect(run('2026-01-15T22:59:59.999Z', '2026-01-15')).resolves.toBe(0)
    await expect(run('2026-01-15T23:00:00.000Z', '2026-01-15')).resolves.toBe(1)
  })

  it('Umstellungstage: Fälligkeit 29.03.2026 und 25.10.2026', async () => {
    await expect(run('2026-03-29T21:59:59.999Z', '2026-03-29')).resolves.toBe(0)
    await expect(run('2026-03-29T22:00:00.000Z', '2026-03-29')).resolves.toBe(1)
    await expect(run('2026-10-25T22:59:59.999Z', '2026-10-25')).resolves.toBe(0)
    await expect(run('2026-10-25T23:00:00.000Z', '2026-10-25')).resolves.toBe(1)
  })

  it('Audit-Kalenderdatum ist die UTC-Kalenderkomponente der gespeicherten Fälligkeit (kein Tagesversatz)', async () => {
    const original = process.env.TZ
    try {
      for (const zone of ['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Kiritimati']) {
        process.env.TZ = zone
        m.audit.mockClear()
        await expect(run('2026-10-16T10:00:00.000Z', '2026-10-01')).resolves.toBe(1)
        expect(m.audit.mock.calls[0][1].metadata.dueDate, zone).toBe('2026-10-01')
      }
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })
})

describe('Öffentliche API und Fehlersemantik bleiben erhalten', () => {
  it('markOverdueInvoices(now) liefert die Anzahl markierter Rechnungen als number', async () => {
    m.invFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    m.invFindUnique.mockResolvedValue({ status: 'SENT', type: 'STANDARD', dueDate: dueAt('2026-10-01') })
    const result = await markOverdueInvoices(new Date('2026-10-09T10:00:00.000Z'))
    expect(typeof result).toBe('number'); expect(result).toBe(2)
    expect(typeof markOverdueInvoices).toBe('function') // Signatur: (now?: Date) => Promise<number>
  })

  it('Einzelfehler stoppen den Lauf nicht und werden gesammelt geworfen (gleiche Meldung)', async () => {
    m.invFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    m.invFindUnique.mockResolvedValue({ status: 'SENT', type: 'STANDARD', dueDate: dueAt('2026-10-01') })
    m.invUpdateMany.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce({ count: 1 })
    await expect(markOverdueInvoices(new Date('2026-10-09T10:00:00.000Z'))).rejects.toThrow(/1 markiert, 1 Fehler.*db down/)
    expect(m.audit).toHaveBeenCalledTimes(1)
  })
})

describe('Quelltext-Prüfung', () => {
  const source = read('lib/services/dunning.service.ts')
  const jobPart = source.slice(source.indexOf('export async function markOverdueInvoices'))

  it('markOverdueInvoices nutzt die Berlin-Funktion und keine lokalen Datums-Getter/setHours', () => {
    expect(jobPart).toContain('berlinDayStartUtc(now)')
    expect(jobPart).toContain('formatUtcCalendarDate(current.dueDate)')
    expect(jobPart).not.toMatch(/setHours|getFullYear|getMonth|getDate\(|formatLocalDate/)
  })

  it('getOverdueInvoices bleibt unverändert (außerhalb von P5-2 Phase 1)', () => {
    const before = source.slice(source.indexOf('export async function getOverdueInvoices'), source.indexOf('export const OVERDUE_JOB_ACTOR'))
    expect(before).toContain('today.setHours(0, 0, 0, 0)')
    expect(before).toContain('InvoiceStatus.PARTIALLY_PAID')
  })
})
