// REQ-029 P5-3 Phase B: Mahnung anlegen / als versendet markieren / Eligibility-Anzeige (Service, Mocks, ohne DB).
// Echte Reihenfolge- und Race-Nachweise gegen PostgreSQL folgen in Phase C (eigene Freigabe).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  invFindUnique: vi.fn(), invUpdateMany: vi.fn(),
  payAggregate: vi.fn(), auditFindMany: vi.fn(),
  dunFindMany: vi.fn(), dunCreate: vi.fn(), dunTxFindUnique: vi.fn(), dunUpdateMany: vi.fn(),
  dunLookup: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => {
  const tx = () => ({
    $queryRaw: m.queryRaw,
    invoice: { findUnique: m.invFindUnique, updateMany: m.invUpdateMany },
    payment: { aggregate: m.payAggregate },
    auditLog: { findMany: m.auditFindMany },
    dunningNotice: {
      findMany: m.dunFindMany, create: m.dunCreate, findUnique: m.dunTxFindUnique, updateMany: m.dunUpdateMany,
    },
  })
  return {
    prisma: {
      $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx()),
      dunningNotice: { findUnique: m.dunLookup },
    },
  }
})
vi.mock('@/lib/services/audit.service', () => ({ buildAuditLogCreate: m.audit }))

import {
  createDunningNotice, getDunningEligibility, markDunningNoticeSent,
} from '@/lib/services/dunning.service'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

// ── Fixture ───────────────────────────────────────────────────
const NOW     = new Date('2026-10-16T08:00:00.000Z') // Berlin: 16.10.2026
const SENT_AT = new Date('2026-10-01T08:00:00.000Z')
const DUE     = new Date('2026-10-15T00:00:00.000Z')
const NEW_DUE = new Date('2026-10-30T00:00:00.000Z')

const dispatchAudit = (over: Record<string, unknown> = {}) => ({
  id: 'aud-1', entityType: 'invoice', entityId: 'inv-1', action: 'STATUS_CHANGE', userId: 'u0',
  oldValue: { status: 'FINALIZED' }, newValue: { status: 'SENT' }, createdAt: new Date(SENT_AT.getTime() + 5),
  ...over,
})

function setInvoice(over: Record<string, unknown> = {}) {
  m.invFindUnique.mockResolvedValue({
    id: 'inv-1', status: 'SENT', type: 'STANDARD', invoiceNumber: 'RE-1',
    sentAt: SENT_AT, dueDate: DUE, totalGross: '107.10',
    ...over,
  })
}
const notice = (level: number, sent: boolean, id = `dun-${level}`) => ({
  id, level, sentAt: sent ? new Date('2026-10-10T09:00:00.000Z') : null,
})

const input = (level: number, over: Record<string, unknown> = {}) =>
  ({ invoiceId: 'inv-1', level, dueDate: NEW_DUE, ...over }) as never
const create = (level: number, over: Record<string, unknown> = {}, now: Date = NOW) =>
  createDunningNotice(input(level, over), 'u1', 'u@x.test', now)

function expectNothingWritten() {
  expect(m.dunCreate).not.toHaveBeenCalled()
  expect(m.invUpdateMany).not.toHaveBeenCalled()
  expect(m.audit).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  m.queryRaw.mockResolvedValue([{ id: 'inv-1' }])
  setInvoice()
  m.payAggregate.mockResolvedValue({ _sum: { amount: null } })
  m.auditFindMany.mockResolvedValue([dispatchAudit()])
  m.dunFindMany.mockResolvedValue([])
  m.dunCreate.mockResolvedValue({ id: 'dun-new' })
  m.invUpdateMany.mockResolvedValue({ count: 1 })
})

// ── Anlegen: Reihenfolge, Quellen ─────────────────────────────

describe('createDunningNotice – Sperre, Datenquellen, Reihenfolge', () => {
  it('Rechnungssperre vor allen Lesezugriffen, danach Policy, dann Schreibzugriffe', async () => {
    await create(1)
    const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0]
    expect(order(m.queryRaw)).toBeLessThan(order(m.invFindUnique))
    expect(order(m.queryRaw)).toBeLessThan(order(m.payAggregate))
    expect(order(m.queryRaw)).toBeLessThan(order(m.dunFindMany))
    expect(order(m.queryRaw)).toBeLessThan(order(m.auditFindMany))
    expect(order(m.payAggregate)).toBeLessThan(order(m.dunCreate))
    expect(order(m.auditFindMany)).toBeLessThan(order(m.dunCreate))
  })

  it('Zahlungssumme: Aggregat über aktive Zahlungszeilen (deletedAt null), nicht der paidAmount-Cache', async () => {
    await create(1)
    expect(m.payAggregate).toHaveBeenCalledWith({ where: { invoiceId: 'inv-1', deletedAt: null }, _sum: { amount: true } })
    const select = m.invFindUnique.mock.calls[0][0].select
    expect(select).not.toHaveProperty('paidAmount')
    expect(select).toMatchObject({ status: true, type: true, sentAt: true, dueDate: true, totalGross: true })
  })

  it('Versand-Audit: alle STATUS_CHANGE-Audits der Rechnung, Auswahl trifft die Policy', async () => {
    await create(1)
    expect(m.auditFindMany).toHaveBeenCalledTimes(1)
    expect(m.auditFindMany.mock.calls[0][0]).toMatchObject({
      where: { entityType: 'invoice', entityId: 'inv-1', action: 'STATUS_CHANGE' },
    })
  })

  it('unbekannte Rechnung → NotFoundError, nichts gelesen, nichts geschrieben', async () => {
    m.queryRaw.mockResolvedValue([])
    await expect(create(1)).rejects.toMatchObject({ name: 'NotFoundError' })
    expect(m.invFindUnique).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('Stufe 1 legt genau eine Mahnung und ein CREATE-Audit an, ohne Statuswechsel', async () => {
    const id = await create(1)
    expect(id).toBe('dun-new')
    expect(m.dunCreate).toHaveBeenCalledTimes(1)
    expect(m.dunCreate.mock.calls[0][0].data).toMatchObject({
      invoiceId: 'inv-1', level: 1, levelLabel: 'Zahlungserinnerung', dueDate: NEW_DUE, fee: null, createdById: 'u1',
    })
    expect(m.invUpdateMany).not.toHaveBeenCalled()
    expect(m.audit).toHaveBeenCalledTimes(1)
    expect(m.audit.mock.calls[0][1]).toMatchObject({ action: 'CREATE', entityType: 'dunning_notice', entityId: 'dun-new' })
  })
})

// ── Anlegen: Ablehnung schreibt nichts ────────────────────────

describe('createDunningNotice – Ablehnungen (nichts wird geschrieben)', () => {
  const cases: Array<[string, () => void, number, RegExp, Record<string, unknown>?]> = [
    ['Entwurf/FINALIZED (nicht versendet)', () => setInvoice({ status: 'FINALIZED' }), 1, /Status „Finalisiert“/],
    ['Status PAID', () => setInvoice({ status: 'PAID' }), 1, /Status „Bezahlt“/],
    ['Status CANCELLED', () => setInvoice({ status: 'CANCELLED' }), 1, /Status „Storniert“/],
    ['Status CORRECTED', () => setInvoice({ status: 'CORRECTED' }), 1, /Status „Korrigiert“/],
    ['sentAt fehlt (Altdaten)', () => setInvoice({ sentAt: null }), 1, /nicht als versendet dokumentiert/],
    ['Versand-Audit fehlt (Altdaten)', () => m.auditFindMany.mockResolvedValue([]), 1, /nicht nachvollziehbar dokumentiert/],
    ['Versand-Audit von Systemakteur', () => m.auditFindMany.mockResolvedValue([dispatchAudit({ userId: null })]), 1, /nicht nachvollziehbar dokumentiert/],
    ['Versand-Audit außerhalb der Toleranz', () => m.auditFindMany.mockResolvedValue([dispatchAudit({ createdAt: new Date(SENT_AT.getTime() + 61_000) })]), 1, /nicht nachvollziehbar dokumentiert/],
    ['Zahlungsziel fehlt', () => setInvoice({ dueDate: null }), 1, /kein Zahlungsziel/],
    ['Zahlungsziel noch nicht überschritten', () => setInvoice({ dueDate: new Date('2026-10-16T00:00:00.000Z') }), 1, /\(16\.10\.2026\) ist noch nicht überschritten/],
    ['Korrekturrechnung', () => setInvoice({ type: 'CORRECTION' }), 1, /^Für Korrekturrechnungen kann keine Mahnung erstellt werden\.$/],
    ['Stornorechnung', () => setInvoice({ type: 'CANCELLATION' }), 1, /^Für Stornorechnungen kann keine Mahnung erstellt werden\.$/],
    ['Abschlagsrechnung (Allowlist)', () => setInvoice({ type: 'ADVANCE' }), 1, /Typ „Abschlagsrechnung“/],
    ['kein offener Betrag (aktive Zahlungen = Brutto)', () => m.payAggregate.mockResolvedValue({ _sum: { amount: '107.10' } }), 1, /kein offener Betrag/],
    ['Stufe 2 ohne Stufe 1', () => undefined, 2, /nächste Mahnstufe muss 1 sein \(aktuell: 0\)/],
    ['Stufe 1 bereits vorhanden (zweite Anlage derselben Stufe)', () => m.dunFindMany.mockResolvedValue([notice(1, false)]), 1, /nächste Mahnstufe muss 2 sein \(aktuell: 1\)/],
    ['Vorstufe nicht versendet', () => m.dunFindMany.mockResolvedValue([notice(1, false)]), 2, /Mahnstufe 1 ist noch nicht als versendet markiert/],
    ['Stufensprung', () => m.dunFindMany.mockResolvedValue([notice(1, true)]), 3, /nächste Mahnstufe muss 2 sein/],
    ['Maximalstufe erreicht', () => m.dunFindMany.mockResolvedValue([notice(3, true), notice(2, true), notice(1, true)]), 3, /Maximale Mahnstufe 3 bereits erreicht/],
    ['neues Zahlungsziel = heute', () => undefined, 1, /Zahlungsziel der Mahnung muss nach dem heutigen Tag liegen/, { dueDate: new Date('2026-10-16T00:00:00.000Z') }],
    ['neues Zahlungsziel in der Vergangenheit', () => undefined, 1, /Zahlungsziel der Mahnung muss nach dem heutigen Tag liegen/, { dueDate: new Date('2026-10-01T00:00:00.000Z') }],
  ]
  for (const [name, arrange, level, message, over] of cases) {
    it(`${name} → BusinessRuleError`, async () => {
      arrange()
      const promise = create(level, over ?? {})
      await expect(promise).rejects.toMatchObject({ name: 'BusinessRuleError' })
      await expect(promise).rejects.toThrow(message)
      expectNothingWritten()
    })
  }

  it('Gebühr wird weiterhin streng geprüft (keine stille Rundung) und schreibt dann nichts', async () => {
    m.dunFindMany.mockResolvedValue([notice(1, true)])
    await expect(create(2, { fee: '5.555' })).rejects.toMatchObject({ name: 'BusinessRuleError' })
    expectNothingWritten()
  })
})

// ── Anlegen: Berliner Grenze über `now` ───────────────────────

describe('createDunningNotice – `now` steuert die Berliner Tagesgrenze', () => {
  it('Fälligkeitstag 15.10.: 21:59:59.999Z (noch 15.10. Berlin) abgelehnt, 22:00:00.000Z (16.10.) angelegt', async () => {
    await expect(create(1, {}, new Date('2026-10-15T21:59:59.999Z'))).rejects.toThrow(/noch nicht überschritten/)
    expectNothingWritten()
    await expect(create(1, {}, new Date('2026-10-15T22:00:00.000Z'))).resolves.toBe('dun-new')
    expect(m.dunCreate).toHaveBeenCalledTimes(1)
  })
})

// ── Anlegen: PARTIALLY_PAID, Status, Snapshot ─────────────────

describe('createDunningNotice – Restbetrag, Statusverhalten, Snapshot', () => {
  it('PARTIALLY_PAID: Basis = Brutto − Σ aktive Zahlungen; Stufe 1 ändert den Status nicht', async () => {
    setInvoice({ status: 'PARTIALLY_PAID' })
    m.payAggregate.mockResolvedValue({ _sum: { amount: { toFixed: () => '42.84' } } })
    await create(1)
    const created = m.audit.mock.calls.map(c => c[1]).find(a => a.entityType === 'dunning_notice')
    expect(created.newValue.snapshot).toMatchObject({ grossAmount: '107.10', activePaymentsSum: '42.84', outstandingAmount: '64.26' })
    expect(m.invUpdateMany).not.toHaveBeenCalled()
  })

  it('Stufe 2: SENT und PARTIALLY_PAID → OVERDUE (Statusbedingung, Audit mit outstandingAmount); OVERDUE bleibt', async () => {
    m.dunFindMany.mockResolvedValue([notice(1, true)])
    for (const status of ['SENT', 'PARTIALLY_PAID']) {
      vi.clearAllMocks()
      m.queryRaw.mockResolvedValue([{ id: 'inv-1' }])
      setInvoice({ status })
      m.payAggregate.mockResolvedValue({ _sum: { amount: status === 'PARTIALLY_PAID' ? '7.10' : null } })
      m.auditFindMany.mockResolvedValue([dispatchAudit()])
      m.dunFindMany.mockResolvedValue([notice(1, true)])
      m.dunCreate.mockResolvedValue({ id: 'dun-new' })
      m.invUpdateMany.mockResolvedValue({ count: 1 })
      await create(2)
      expect(m.invUpdateMany).toHaveBeenCalledWith({ where: { id: 'inv-1', status }, data: { status: 'OVERDUE' } })
      const statusAudit = m.audit.mock.calls.map(c => c[1]).find(a => a.action === 'STATUS_CHANGE')
      expect(statusAudit).toMatchObject({
        userId: 'u1', entityType: 'invoice', oldValue: { status }, newValue: { status: 'OVERDUE' },
        metadata: { source: 'dunning', level: 2, dunningNoticeId: 'dun-new', outstandingAmount: status === 'SENT' ? '107.10' : '100.00' },
      })
    }
    vi.clearAllMocks()
    m.queryRaw.mockResolvedValue([{ id: 'inv-1' }])
    setInvoice({ status: 'OVERDUE' })
    m.payAggregate.mockResolvedValue({ _sum: { amount: null } })
    m.auditFindMany.mockResolvedValue([dispatchAudit()])
    m.dunFindMany.mockResolvedValue([notice(1, true)])
    m.dunCreate.mockResolvedValue({ id: 'dun-new' })
    await create(2)
    expect(m.invUpdateMany).not.toHaveBeenCalled()
  })

  it('Stufe 3 nach versendeter Stufe 2 auf OVERDUE ist möglich', async () => {
    setInvoice({ status: 'OVERDUE' })
    m.dunFindMany.mockResolvedValue([notice(2, true), notice(1, true)])
    await expect(create(3)).resolves.toBe('dun-new')
  })

  it('Statusbedingung greift nicht (count 0) → ConflictError', async () => {
    m.dunFindMany.mockResolvedValue([notice(1, true)])
    m.invUpdateMany.mockResolvedValue({ count: 0 })
    await expect(create(2)).rejects.toMatchObject({ name: 'ConflictError' })
  })

  it('CREATE-Audit enthält den Snapshot dunning-basis-v1 exakt (Strings, Feldnamen, Nachweise)', async () => {
    m.dunFindMany.mockResolvedValue([notice(1, true)])
    m.payAggregate.mockResolvedValue({ _sum: { amount: '42.84' } })
    await create(2)
    const created = m.audit.mock.calls.map(c => c[1]).find(a => a.entityType === 'dunning_notice')
    expect(created).toMatchObject({ userId: 'u1', userEmail: 'u@x.test', action: 'CREATE', entityId: 'dun-new' })
    expect(created.newValue).toEqual({
      invoiceId: 'inv-1',
      invoiceNumber: 'RE-1',
      level: 2,
      levelLabel: 'Erste Mahnung',
      dueDate: NEW_DUE,
      fee: '5.00',
      snapshot: {
        schema: 'dunning-basis-v1',
        grossAmount: '107.10',
        activePaymentsSum: '42.84',
        outstandingAmount: '64.26',
        feeAmount: '5.00',
        calculatedAt: '2026-10-16T08:00:00.000Z',
        berlinDate: '2026-10-16',
        invoiceDueDate: '2026-10-15',
        invoiceStatusBefore: 'SENT',
        source: 'active-payments',
        sendEvidence: {
          auditId: 'aud-1',
          sentAt: '2026-10-01T08:00:00.000Z',
          auditCreatedAt: '2026-10-01T08:00:00.005Z',
        },
        previousNotice: { id: 'dun-1', level: 1, sentAt: '2026-10-10T09:00:00.000Z' },
      },
    })
  })

  it('Stufe 1 ohne Gebühr: feeAmount null, previousNotice null', async () => {
    await create(1)
    const created = m.audit.mock.calls.map(c => c[1]).find(a => a.entityType === 'dunning_notice')
    expect(created.newValue.snapshot).toMatchObject({ feeAmount: null, previousNotice: null })
    expect(created.newValue.fee).toBeNull()
  })
})

// ── Als versendet markieren ───────────────────────────────────

describe('markDunningNoticeSent – Sperre, Status, Idempotenz', () => {
  beforeEach(() => {
    m.dunLookup.mockResolvedValue({ invoiceId: 'inv-1' })
    m.dunTxFindUnique.mockResolvedValue({ id: 'dun-1', invoiceId: 'inv-1', level: 1, sentAt: null, deletedAt: null })
    m.dunUpdateMany.mockResolvedValue({ count: 1 })
    m.invFindUnique.mockResolvedValue({ status: 'SENT' })
  })
  const mark = () => markDunningNoticeSent('dun-1', null, 'u1', 'u@x.test')

  it('Rechnungssperre zuerst, Mahnung und Rechnung unter der Sperre neu gelesen; ein Update, ein Audit', async () => {
    await mark()
    expect(m.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(m.dunTxFindUnique.mock.invocationCallOrder[0])
    expect(m.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(m.invFindUnique.mock.invocationCallOrder[0])
    expect(m.dunUpdateMany).toHaveBeenCalledTimes(1)
    const call = m.dunUpdateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'dun-1', sentAt: null, deletedAt: null })
    expect(call.data.sentAt).toBeInstanceOf(Date)
    expect(call.data.pdfPath).toBeNull()
    expect(m.audit).toHaveBeenCalledTimes(1)
    const audit = m.audit.mock.calls[0][1]
    expect(audit).toMatchObject({ action: 'STATUS_CHANGE', entityType: 'dunning_notice', entityId: 'dun-1', oldValue: { sentAt: null }, metadata: { invoiceId: 'inv-1', level: 1 } })
    expect(audit.newValue.sentAt).toBe(call.data.sentAt) // dieselbe Zeit in Datensatz und Audit
  })

  for (const status of ['SENT', 'PARTIALLY_PAID', 'OVERDUE']) {
    it(`erlaubt bei Rechnungsstatus ${status}`, async () => {
      m.invFindUnique.mockResolvedValue({ status })
      await expect(mark()).resolves.toBeUndefined()
    })
  }
  for (const status of ['DRAFT', 'FINALIZED', 'PAID', 'CANCELLED', 'CORRECTED']) {
    it(`verweigert bei Rechnungsstatus ${status} (D8) ohne Schreibzugriff`, async () => {
      m.invFindUnique.mockResolvedValue({ status })
      await expect(mark()).rejects.toMatchObject({ name: 'BusinessRuleError' })
      expect(m.dunUpdateMany).not.toHaveBeenCalled()
      expect(m.audit).not.toHaveBeenCalled()
    })
  }

  it('bereits versendet (unter der Sperre gelesen) → Fehler, kein Update, kein Audit', async () => {
    m.dunTxFindUnique.mockResolvedValue({ id: 'dun-1', invoiceId: 'inv-1', level: 1, sentAt: new Date(), deletedAt: null })
    await expect(mark()).rejects.toThrow(/bereits als versendet markiert/)
    expect(m.dunUpdateMany).not.toHaveBeenCalled()
    expect(m.audit).not.toHaveBeenCalled()
  })

  it('zweite parallele Markierung (updateMany count 0) → Fehler ohne zweites Audit', async () => {
    m.dunUpdateMany.mockResolvedValue({ count: 0 })
    await expect(mark()).rejects.toThrow(/bereits als versendet markiert/)
    expect(m.audit).not.toHaveBeenCalled()
  })

  it('unbekannte, gelöschte oder fremde Mahnung → NotFoundError', async () => {
    m.dunLookup.mockResolvedValue(null)
    await expect(mark()).rejects.toMatchObject({ name: 'NotFoundError' })
    m.dunLookup.mockResolvedValue({ invoiceId: 'inv-1' })
    m.dunTxFindUnique.mockResolvedValue({ id: 'dun-1', invoiceId: 'inv-1', level: 1, sentAt: null, deletedAt: new Date() })
    await expect(mark()).rejects.toMatchObject({ name: 'NotFoundError' })
    m.dunTxFindUnique.mockResolvedValue({ id: 'dun-1', invoiceId: 'inv-OTHER', level: 1, sentAt: null, deletedAt: null })
    await expect(mark()).rejects.toMatchObject({ name: 'NotFoundError' })
    expect(m.dunUpdateMany).not.toHaveBeenCalled()
  })
})

// ── Eligibility (nur Anzeige) ─────────────────────────────────

describe('getDunningEligibility – lesend, ohne Sperre', () => {
  it('mahnbar: DTO mit nächster Stufe, Restbetrag, Berliner Tag; schreibt nichts, sperrt nichts', async () => {
    m.payAggregate.mockResolvedValue({ _sum: { amount: '42.84' } })
    const dto = await getDunningEligibility('inv-1', NOW)
    expect(dto).toEqual({
      ok: true, nextLevel: 1, outstandingAmount: '64.26',
      berlinDate: '2026-10-16', calculatedAt: '2026-10-16T08:00:00.000Z', reasons: [], messages: [],
    })
    expect(m.queryRaw).not.toHaveBeenCalled()
    expectNothingWritten()
    expect(m.dunUpdateMany).not.toHaveBeenCalled()
  })

  it('gesperrt: Gründe und deutsche Meldungen, kein Restbetrag', async () => {
    setInvoice({ status: 'FINALIZED', sentAt: null })
    const dto = await getDunningEligibility('inv-1', NOW)
    expect(dto.ok).toBe(false)
    expect(dto.outstandingAmount).toBeNull()
    expect(dto.reasons).toEqual(['STATUS_NOT_DUNNABLE', 'NOT_SENT'])
    expect(dto.messages).toEqual([
      'Für Rechnungen im Status „Finalisiert“ kann keine Mahnung erstellt werden.',
      'Die Rechnung ist nicht als versendet dokumentiert (Versanddatum fehlt).',
    ])
    expect(dto.berlinDate).toBe('2026-10-16')
  })

  it('Ergebnis ist vollständig serialisierbar (nur Strings/Zahlen/Arrays, kein Decimal/Date)', async () => {
    const dto = await getDunningEligibility('inv-1', NOW)
    expect(JSON.parse(JSON.stringify(dto))).toEqual(dto)
  })

  it('unbekannte Rechnung → NotFoundError', async () => {
    m.invFindUnique.mockResolvedValue(null)
    await expect(getDunningEligibility('inv-x', NOW)).rejects.toMatchObject({ name: 'NotFoundError' })
  })

  it('Anzeige und Service sind konsistent: was die Vorschau sperrt, lehnt auch das Anlegen ab', async () => {
    m.payAggregate.mockResolvedValue({ _sum: { amount: '107.10' } })
    const dto = await getDunningEligibility('inv-1', NOW)
    expect(dto.reasons).toContain('NO_OUTSTANDING')
    await expect(create(1)).rejects.toThrow(/kein offener Betrag/)
  })
})

// ── Quelltext-Garantien ───────────────────────────────────────

describe('Quelltext-Garantien P5-3 Phase B', () => {
  const service = read('lib/services/dunning.service.ts')
  const createPart = service.slice(service.indexOf('export async function createDunningNotice'), service.indexOf('export async function markDunningNoticeSent'))
  const markPart = service.slice(service.indexOf('export async function markDunningNoticeSent'), service.indexOf('export interface DunningEligibilityDto'))
  const loadPart = service.slice(service.indexOf('async function loadDunningFacts'), service.indexOf('export async function createDunningNotice'))
  const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

  it('Anlegen und Markieren nehmen FOR UPDATE; die Vorschau nimmt keine Sperre', () => {
    expect(createPart).toContain('FOR UPDATE')
    expect(markPart).toContain('FOR UPDATE')
    const previewPart = service.slice(service.indexOf('export async function getDunningEligibility'), service.indexOf('// ── OVERDUE CHECK'))
    expect(previewPart).not.toContain('FOR UPDATE')
    expect(previewPart).not.toMatch(/\.create\(|\.update\(|updateMany|buildAuditLogCreate/)
  })

  it('Basisberechnung ohne paidAmount-Cache und ohne number-Geldrechnung', () => {
    expect(stripComments(loadPart + createPart)).not.toMatch(/paidAmount/)
    expect(stripComments(loadPart + createPart)).not.toMatch(/parseFloat|Number\(|\.toNumber\(/)
  })

  it('Entscheidung läuft über die Policy; keine feste Statusliste im Service', () => {
    expect(createPart).toContain('evaluateDunningEligibility')
    expect(createPart).toMatch(/purpose:\s*'create'/)
    expect(stripComments(createPart)).not.toMatch(/'PAID'|InvoiceStatus\.PAID|InvoiceStatus\.CANCELLED|InvoiceStatus\.DRAFT/)
  })

  it('Markieren: bedingtes updateMany (sentAt null, deletedAt null)', () => {
    expect(markPart).toMatch(/updateMany\(\{\s*where:\s*\{\s*id:\s*noticeId,\s*sentAt:\s*null,\s*deletedAt:\s*null\s*\}/)
  })

  it('Phase-A-Policy bleibt unabhängig vom Service (kein Prisma-Import)', () => {
    expect(stripComments(read('lib/services/dunning-policy.ts'))).not.toMatch(/prisma/i)
  })
})
