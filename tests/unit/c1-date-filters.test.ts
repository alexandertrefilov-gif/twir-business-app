// P5-6 C-1: Von/Bis-Filter (Audit-Log: echte Zeitpunkte, Zahlungsjournal: Kalendertage) und Berliner Monatsstart.
// Die Tests bewerten das, was die Services tatsächlich an Prisma übergeben (`where`), semantisch gegen Beispielzeilen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  auditFindMany: vi.fn(), auditCount: vi.fn(),
  payFindMany: vi.fn(), payCount: vi.fn(), payAggregate: vi.fn(),
  invAggregate: vi.fn(), invCount: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    auditLog: { findMany: m.auditFindMany, count: m.auditCount },
    payment:  { findMany: m.payFindMany, count: m.payCount, aggregate: m.payAggregate },
    invoice:  { aggregate: m.invAggregate, count: m.invCount },
    offer:    { count: vi.fn().mockResolvedValue(0) },
    order:    { count: vi.fn().mockResolvedValue(0) },
    customer: { count: vi.fn().mockResolvedValue(0) },
  },
}))
vi.mock('@/lib/auth/permissions', () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
  Action:   new Proxy({}, { get: (_t, key) => String(key) }),
  Resource: new Proxy({}, { get: (_t, key) => String(key) }),
}))

import { getAuditLogs } from '@/lib/services/audit-query.service'
import { getPaymentJournal } from '@/lib/services/payment.service'
import { getDashboardStats } from '@/lib/services/dashboard.service'

type Cond = { gte?: Date; gt?: Date; lt?: Date; lte?: Date }
function matches(cond: Cond | undefined, iso: string): boolean {
  const t = Date.parse(iso)
  if (!cond) return true
  if (cond.gte && !(t >= cond.gte.getTime())) return false
  if (cond.gt  && !(t >  cond.gt.getTime()))  return false
  if (cond.lt  && !(t <  cond.lt.getTime()))  return false
  if (cond.lte && !(t <= cond.lte.getTime())) return false
  return true
}
function auditCond(): Cond | undefined {
  const where = m.auditFindMany.mock.calls.at(-1)![0].where
  return where.createdAt
}
function payCond(): Cond | undefined {
  const where = m.payFindMany.mock.calls.at(-1)![0].where
  return where.paymentDate
}
// Die Seiten übergeben `new Date('JJJJ-MM-TT')` (UTC-Mitternacht des gewählten Kalendertags).
const day = (iso: string) => new Date(iso)

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York'] as const
const originalTz = process.env.TZ

beforeEach(() => {
  vi.clearAllMocks()
  m.auditFindMany.mockResolvedValue([]); m.auditCount.mockResolvedValue(0)
  m.payFindMany.mockResolvedValue([]); m.payCount.mockResolvedValue(0)
  m.payAggregate.mockResolvedValue({ _sum: { amount: null } })
  m.invAggregate.mockResolvedValue({ _sum: { totalGross: null } }); m.invCount.mockResolvedValue(0)
})
afterEach(() => {
  vi.useRealTimers()
  if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz
})

describe.each(ZONES)('Audit-Log Zeitraumfilter (Zeitpunkte, Berliner Tage) — process TZ %s', (zone) => {
  beforeEach(() => { process.env.TZ = zone })

  it('nur Von: ab Berliner Tagesbeginn', async () => {
    await getAuditLogs({ from: day('2026-10-13') })
    const c = auditCond()
    expect(matches(c, '2026-10-12T21:59:59.999Z')).toBe(false)
    expect(matches(c, '2026-10-12T22:00:00.000Z')).toBe(true)
    expect(matches(c, '2030-01-01T00:00:00.000Z')).toBe(true)
  })

  it('nur Bis: der gewählte Berliner Tag ist vollständig enthalten (exklusive Obergrenze am Folgetag)', async () => {
    await getAuditLogs({ to: day('2026-10-13') })
    const c = auditCond()
    expect(matches(c, '2020-01-01T00:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-13T21:59:59.999Z')).toBe(true)
    expect(matches(c, '2026-10-13T22:00:00.000Z')).toBe(false)
  })

  it('Von und Bis gemeinsam wirken beide', async () => {
    await getAuditLogs({ from: day('2026-10-01'), to: day('2026-10-13') })
    const c = auditCond()
    expect(matches(c, '2026-09-30T21:59:59.999Z')).toBe(false)
    expect(matches(c, '2026-09-30T22:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-05T12:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-13T21:59:59.999Z')).toBe(true)
    expect(matches(c, '2026-10-13T22:00:00.000Z')).toBe(false)
  })

  it('Von = Bis: genau ein Berliner Kalendertag', async () => {
    await getAuditLogs({ from: day('2026-10-13'), to: day('2026-10-13') })
    const c = auditCond()
    expect(matches(c, '2026-10-12T21:59:59.999Z')).toBe(false)
    expect(matches(c, '2026-10-12T22:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-13T21:59:59.999Z')).toBe(true)
    expect(matches(c, '2026-10-13T22:00:00.000Z')).toBe(false)
  })

  it('leerer Zeitraum (Von nach Bis) liefert keine Zeile', async () => {
    await getAuditLogs({ from: day('2026-10-14'), to: day('2026-10-13') })
    const c = auditCond()
    for (const iso of ['2026-10-12T12:00:00Z', '2026-10-13T12:00:00Z', '2026-10-14T12:00:00Z', '2026-10-15T12:00:00Z']) {
      expect(matches(c, iso)).toBe(false)
    }
  })

  it('Monats- und Jahreswechsel (Winterzeit, UTC+1)', async () => {
    await getAuditLogs({ from: day('2026-12-31'), to: day('2027-01-01') })
    const c = auditCond()
    expect(matches(c, '2026-12-30T22:59:59.999Z')).toBe(false)
    expect(matches(c, '2026-12-30T23:00:00.000Z')).toBe(true)
    expect(matches(c, '2027-01-01T22:59:59.999Z')).toBe(true)
    expect(matches(c, '2027-01-01T23:00:00.000Z')).toBe(false)
  })

  it('Umstellung auf Sommerzeit: Berliner Tag 29.03.2026 hat 23 Stunden', async () => {
    await getAuditLogs({ from: day('2026-03-29'), to: day('2026-03-29') })
    const c = auditCond()
    expect(matches(c, '2026-03-28T22:59:59.999Z')).toBe(false)
    expect(matches(c, '2026-03-28T23:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-03-29T21:59:59.999Z')).toBe(true)
    expect(matches(c, '2026-03-29T22:00:00.000Z')).toBe(false)
  })

  it('Umstellung auf Winterzeit: Berliner Tag 25.10.2026 hat 25 Stunden', async () => {
    await getAuditLogs({ from: day('2026-10-25'), to: day('2026-10-25') })
    const c = auditCond()
    expect(matches(c, '2026-10-24T21:59:59.999Z')).toBe(false)
    expect(matches(c, '2026-10-24T22:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-25T22:59:59.999Z')).toBe(true)
    expect(matches(c, '2026-10-25T23:00:00.000Z')).toBe(false)
  })

  it('andere Filter bleiben erhalten und ohne Datum gibt es keine Zeitbedingung', async () => {
    await getAuditLogs({ entityType: 'invoice', search: 'x' })
    const where = m.auditFindMany.mock.calls.at(-1)![0].where
    expect(where.entityType).toBe('invoice')
    expect(where.createdAt).toBeUndefined()
    expect(m.auditCount.mock.calls.at(-1)![0].where).toEqual(where)
  })
})

describe.each(ZONES)('Zahlungsjournal Zeitraumfilter (Kalendertage) — process TZ %s', (zone) => {
  beforeEach(() => { process.env.TZ = zone })

  it('Von und Bis gemeinsam wirken beide, auch für Altwerte mit Uhrzeit am Bis-Tag', async () => {
    await getPaymentJournal({ from: day('2026-10-01'), to: day('2026-10-13') })
    const c = payCond()
    expect(matches(c, '2026-09-30T00:00:00.000Z')).toBe(false)
    expect(matches(c, '2026-10-01T00:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-13T00:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-13T17:42:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-14T00:00:00.000Z')).toBe(false)
  })

  it('nur Von', async () => {
    await getPaymentJournal({ from: day('2026-10-13') })
    const c = payCond()
    expect(matches(c, '2026-10-12T00:00:00.000Z')).toBe(false)
    expect(matches(c, '2026-10-13T00:00:00.000Z')).toBe(true)
  })

  it('nur Bis', async () => {
    await getPaymentJournal({ to: day('2026-10-13') })
    const c = payCond()
    expect(matches(c, '2026-10-13T00:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-14T00:00:00.000Z')).toBe(false)
  })

  it('Von = Bis: genau ein Kalendertag', async () => {
    await getPaymentJournal({ from: day('2026-10-13'), to: day('2026-10-13') })
    const c = payCond()
    expect(matches(c, '2026-10-12T00:00:00.000Z')).toBe(false)
    expect(matches(c, '2026-10-13T00:00:00.000Z')).toBe(true)
    expect(matches(c, '2026-10-14T00:00:00.000Z')).toBe(false)
  })

  it('leerer Zeitraum', async () => {
    await getPaymentJournal({ from: day('2026-10-14'), to: day('2026-10-13') })
    const c = payCond()
    for (const iso of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']) {
      expect(matches(c, `${iso}T00:00:00.000Z`)).toBe(false)
    }
  })

  it('Jahreswechsel', async () => {
    await getPaymentJournal({ from: day('2026-12-31'), to: day('2027-01-01') })
    const c = payCond()
    expect(matches(c, '2026-12-30T00:00:00.000Z')).toBe(false)
    expect(matches(c, '2026-12-31T00:00:00.000Z')).toBe(true)
    expect(matches(c, '2027-01-01T00:00:00.000Z')).toBe(true)
    expect(matches(c, '2027-01-02T00:00:00.000Z')).toBe(false)
  })

  it('Liste, Anzahl und Summe verwenden dieselbe Bedingung', async () => {
    await getPaymentJournal({ from: day('2026-10-01'), to: day('2026-10-13'), search: 'abc' })
    const w = m.payFindMany.mock.calls.at(-1)![0].where
    expect(m.payCount.mock.calls.at(-1)![0].where).toEqual(w)
    expect(m.payAggregate.mock.calls.at(-1)![0].where).toEqual(w)
    expect(w.deletedAt).toBeNull()
    expect(w.OR).toBeDefined()
  })
})

describe.each(ZONES)('Dashboard-Monatsstart (Berliner Geschäftskalender) — process TZ %s', (zone) => {
  beforeEach(() => { process.env.TZ = zone })
  const gteFor = async (nowIso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(nowIso))
    await getDashboardStats()
    const call = m.invAggregate.mock.calls.find(([arg]) => arg?.where?.finalizedAt)!
    return (call[0].where.finalizedAt.gte as Date).toISOString()
  }

  it('Monatsmitte (Sommerzeit)', async () => {
    expect(await gteFor('2026-10-13T10:00:00Z')).toBe('2026-09-30T22:00:00.000Z')
  })
  it('kurz nach Berliner Mitternacht zum Monatsersten (UTC noch im Vormonat)', async () => {
    expect(await gteFor('2026-10-31T23:30:00Z')).toBe('2026-10-31T23:00:00.000Z')
  })
  it('Sommerzeit: 01.04. 00:30 Berlin', async () => {
    expect(await gteFor('2026-03-31T22:30:00Z')).toBe('2026-03-31T22:00:00.000Z')
  })
  it('kurz vor Berliner Mitternacht (UTC schon im Folgemonat)', async () => {
    expect(await gteFor('2026-10-31T22:59:00Z')).toBe('2026-09-30T22:00:00.000Z')
  })
  it('Jahreswechsel: 01.01.2027 00:30 Berlin', async () => {
    expect(await gteFor('2026-12-31T23:30:00Z')).toBe('2026-12-31T23:00:00.000Z')
  })
  it('Monat mit Zeitumstellung (März)', async () => {
    expect(await gteFor('2026-03-15T12:00:00Z')).toBe('2026-02-28T23:00:00.000Z')
  })
})
