// REQ-029 P5-3 Phase A: reine Mahn-Policy („Mahnung erst nach dokumentiertem Versand“).
// Läuft ohne Datenbank; Ergebnis muss unter TZ=UTC, TZ=Europe/Berlin und TZ=America/New_York identisch sein.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { InvoiceStatus, InvoiceType } from '@/types/enums'
import {
  DUNNABLE_INVOICE_STATUSES,
  DUNNABLE_INVOICE_TYPES,
  DUNNING_BLOCK_REASONS,
  DUNNING_SEND_AUDIT_TOLERANCE_MS,
  MAX_DUNNING_LEVEL,
  dunningBlockMessage,
  evaluateDunningEligibility,
  selectDispatchEvidence,
} from '@/lib/services/dunning-policy'
import type {
  DispatchAuditCandidate,
  DunningBlockReason,
  DunningNoticeInput,
  DunningPolicyInput,
  DunningPolicyResult,
} from '@/lib/services/dunning-policy'

// ── Fixture ───────────────────────────────────────────────────
// Rechnung 107.10 brutto, Zahlungsziel 2026-10-15 (Kalendertag = UTC-Mitternacht), versendet am 2026-10-01.
const SENT_AT = new Date('2026-10-01T08:00:00.000Z')
const NOW = new Date('2026-10-16T08:00:00.000Z') // Berlin: 2026-10-16
const DUE = new Date('2026-10-15T00:00:00.000Z')
const NEW_DUE = new Date('2026-10-30T00:00:00.000Z')

function audit(over: Partial<DispatchAuditCandidate> = {}): DispatchAuditCandidate {
  return {
    id: 'aud-1',
    entityType: 'invoice',
    entityId: 'inv-1',
    action: 'STATUS_CHANGE',
    userId: 'user-1',
    oldValue: { status: 'FINALIZED' },
    newValue: { status: 'SENT' },
    createdAt: new Date(SENT_AT.getTime() + 5),
    ...over,
  }
}

type InputOverrides = Partial<Omit<DunningPolicyInput, 'invoice'>> & { invoice?: Partial<DunningPolicyInput['invoice']> }

function input(over: InputOverrides = {}): DunningPolicyInput {
  const { invoice, ...rest } = over
  return {
    purpose: 'create',
    invoice: {
      id: 'inv-1',
      status: 'SENT',
      type: 'STANDARD',
      sentAt: SENT_AT,
      dueDate: DUE,
      totalGross: '107.10',
      ...invoice,
    },
    auditEntries: [audit()],
    activePaymentsSum: '0.00',
    notices: [],
    requestedLevel: 1,
    dunningDueDate: NEW_DUE,
    now: NOW,
    ...rest,
  }
}

function reasonsOf(result: DunningPolicyResult): DunningBlockReason[] {
  if (result.ok) throw new Error('erwartet: gesperrt, erhalten: ok')
  return result.reasons
}

const notice = (level: number, sent: boolean, id = `n${level}`): DunningNoticeInput => ({
  id,
  level,
  sentAt: sent ? new Date('2026-10-10T09:00:00.000Z') : null,
})

// ── Grundfall ─────────────────────────────────────────────────

describe('Policy – Grundfall und Snapshot-Basis', () => {
  it('mahnbarer Normalfall: Stufe 1, Snapshot-Basis exakt', () => {
    const result = evaluateDunningEligibility(input())
    expect(result).toEqual({
      ok: true,
      nextLevel: 1,
      outstandingAmount: '107.10',
      basis: {
        schema: 'dunning-basis-v1',
        grossAmount: '107.10',
        activePaymentsSum: '0.00',
        outstandingAmount: '107.10',
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
        previousNotice: null,
      },
    })
  })

  it('Stufe 2: previousNotice dokumentiert die versendete Stufe 1', () => {
    const result = evaluateDunningEligibility(input({ notices: [notice(1, true)], requestedLevel: 2 }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nextLevel).toBe(2)
    expect(result.basis.previousNotice).toEqual({ id: 'n1', level: 1, sentAt: '2026-10-10T09:00:00.000Z' })
  })

  it('alle Beträge sind kanonische Cent-Strings (zwei Nachkommastellen)', () => {
    const result = evaluateDunningEligibility(input({ invoice: { totalGross: '107.1' }, activePaymentsSum: '7' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.basis.grossAmount).toBe('107.10')
    expect(result.basis.activePaymentsSum).toBe('7.00')
    expect(result.basis.outstandingAmount).toBe('100.10')
    expect(result.outstandingAmount).toBe('100.10')
  })

  it('verändert die Eingabe nicht (tief eingefroren)', () => {
    const frozen = input({ notices: [notice(1, true)], requestedLevel: 2 })
    Object.freeze(frozen)
    Object.freeze(frozen.invoice)
    Object.freeze(frozen.auditEntries)
    Object.freeze(frozen.notices)
    expect(() => evaluateDunningEligibility(frozen)).not.toThrow()
  })
})

// ── Typ-Allowlist ─────────────────────────────────────────────

describe('Policy – Rechnungstyp (Allowlist)', () => {
  it('Allowlist enthält ausschließlich STANDARD', () => {
    expect([...DUNNABLE_INVOICE_TYPES]).toEqual(['STANDARD'])
  })

  for (const type of Object.values(InvoiceType)) {
    const allowed = type === InvoiceType.STANDARD
    it(`Typ ${type}: ${allowed ? 'mahnbar' : 'gesperrt (TYPE_NOT_DUNNABLE)'}`, () => {
      const result = evaluateDunningEligibility(input({ invoice: { type } }))
      if (allowed) {
        expect(result.ok).toBe(true)
      } else {
        expect(reasonsOf(result)).toContain('TYPE_NOT_DUNNABLE')
        expect(reasonsOf(result)[0]).toBe('TYPE_NOT_DUNNABLE')
      }
    })
  }

  it('unbekannter Typ ist gesperrt (Allowlist, keine Ausschlussliste)', () => {
    expect(reasonsOf(evaluateDunningEligibility(input({ invoice: { type: 'FUTURE_TYPE' } })))).toEqual(['TYPE_NOT_DUNNABLE'])
  })

  it('Meldungen: Korrekturrechnung und Stornorechnung', () => {
    const corr = evaluateDunningEligibility(input({ invoice: { type: 'CORRECTION' } }))
    const canc = evaluateDunningEligibility(input({ invoice: { type: 'CANCELLATION' } }))
    if (corr.ok || canc.ok) throw new Error('erwartet: gesperrt')
    expect(dunningBlockMessage('TYPE_NOT_DUNNABLE', corr.details)).toBe('Für Korrekturrechnungen kann keine Mahnung erstellt werden.')
    expect(dunningBlockMessage('TYPE_NOT_DUNNABLE', canc.details)).toBe('Für Stornorechnungen kann keine Mahnung erstellt werden.')
  })

  it('Meldung für übrige Typen nennt das Typ-Label', () => {
    const adv = evaluateDunningEligibility(input({ invoice: { type: 'ADVANCE' } }))
    if (adv.ok) throw new Error('erwartet: gesperrt')
    expect(dunningBlockMessage('TYPE_NOT_DUNNABLE', adv.details)).toBe(
      'Für Rechnungen vom Typ „Abschlagsrechnung“ kann keine Mahnung erstellt werden.',
    )
  })
})

// ── Status ────────────────────────────────────────────────────

describe('Policy – Rechnungsstatus', () => {
  it('mahnbare Status sind genau SENT, PARTIALLY_PAID, OVERDUE', () => {
    expect([...DUNNABLE_INVOICE_STATUSES].sort()).toEqual(['OVERDUE', 'PARTIALLY_PAID', 'SENT'])
  })

  for (const status of Object.values(InvoiceStatus)) {
    const allowed = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(status)
    it(`Status ${status}: ${allowed ? 'mahnbar' : 'gesperrt (STATUS_NOT_DUNNABLE)'}`, () => {
      const result = evaluateDunningEligibility(input({ invoice: { status } }))
      if (allowed) {
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.basis.invoiceStatusBefore).toBe(status)
      } else {
        expect(reasonsOf(result)).toContain('STATUS_NOT_DUNNABLE')
      }
    })
  }

  it('Statusmeldung nennt das deutsche Label', () => {
    const result = evaluateDunningEligibility(input({ invoice: { status: 'FINALIZED' } }))
    if (result.ok) throw new Error('erwartet: gesperrt')
    expect(dunningBlockMessage('STATUS_NOT_DUNNABLE', result.details)).toBe(
      'Für Rechnungen im Status „Finalisiert“ kann keine Mahnung erstellt werden.',
    )
  })

  it('OVERDUE allein genügt nicht: nicht fälliger OVERDUE-Vorgang bleibt gesperrt', () => {
    const result = evaluateDunningEligibility(input({ invoice: { status: 'OVERDUE', dueDate: new Date('2026-10-16T00:00:00.000Z') } }))
    expect(reasonsOf(result)).toEqual(['NOT_YET_DUE'])
  })
})

// ── sentAt und Versand-Audit ──────────────────────────────────

describe('Policy – dokumentierter Versand (D1b)', () => {
  it('sentAt fehlt → NOT_SENT (und nicht zusätzlich NO_SEND_AUDIT)', () => {
    expect(reasonsOf(evaluateDunningEligibility(input({ invoice: { sentAt: null } })))).toEqual(['NOT_SENT'])
  })

  it('sentAt ungültiges Datum → NOT_SENT', () => {
    expect(reasonsOf(evaluateDunningEligibility(input({ invoice: { sentAt: new Date('x') } })))).toEqual(['NOT_SENT'])
  })

  it('Status SENT ohne jedes Audit → NO_SEND_AUDIT (Altdaten, fail closed)', () => {
    expect(reasonsOf(evaluateDunningEligibility(input({ auditEntries: [] })))).toEqual(['NO_SEND_AUDIT'])
  })

  const negatives: Array<[string, Partial<DispatchAuditCandidate>]> = [
    ['Systemakteur (userId null)', { userId: null }],
    ['leere userId', { userId: '' }],
    ['falsche Richtung SENT → OVERDUE', { oldValue: { status: 'SENT' }, newValue: { status: 'OVERDUE' } }],
    ['falsche Richtung FINALIZED → PAID', { newValue: { status: 'PAID' } }],
    ['falscher Ausgangsstatus DRAFT → SENT', { oldValue: { status: 'DRAFT' } }],
    ['andere Rechnung', { entityId: 'inv-2' }],
    ['anderer Entitätstyp', { entityType: 'payment' }],
    ['andere Aktion', { action: 'UPDATE' }],
    ['oldValue null', { oldValue: null }],
    ['newValue String', { newValue: 'SENT' }],
    ['newValue Array', { newValue: [{ status: 'SENT' }] }],
    ['status kein String', { newValue: { status: 5 } }],
    ['ungültiger Zeitstempel', { createdAt: new Date('x') }],
  ]
  for (const [name, over] of negatives) {
    it(`kein Nachweis: ${name}`, () => {
      expect(reasonsOf(evaluateDunningEligibility(input({ auditEntries: [audit(over)] })))).toEqual(['NO_SEND_AUDIT'])
    })
  }

  it('Toleranz ist eine feste Konstante von 60 000 ms', () => {
    expect(DUNNING_SEND_AUDIT_TOLERANCE_MS).toBe(60_000)
  })

  it('Grenze inklusive: genau +60 000 ms und −60 000 ms sind gültig, ±1 ms darüber nicht', () => {
    const at = (delta: number) => audit({ createdAt: new Date(SENT_AT.getTime() + delta) })
    const ok = (delta: number) => evaluateDunningEligibility(input({ auditEntries: [at(delta)] })).ok
    expect(ok(60_000)).toBe(true)
    expect(ok(-60_000)).toBe(true)
    expect(ok(60_001)).toBe(false)
    expect(ok(-60_001)).toBe(false)
    expect(ok(0)).toBe(true)
  })

  it('mehrere Audits: ein konsistenter Treffer genügt, unpassende werden ignoriert', () => {
    const entries = [
      audit({ id: 'a-system', userId: null }),
      audit({ id: 'a-late', createdAt: new Date(SENT_AT.getTime() + 3_600_000) }),
      audit({ id: 'a-good', createdAt: new Date(SENT_AT.getTime() + 20) }),
      audit({ id: 'a-wrong', newValue: { status: 'OVERDUE' } }),
    ]
    const result = evaluateDunningEligibility(input({ auditEntries: entries }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.basis.sendEvidence.auditId).toBe('a-good')
  })

  it('selectDispatchEvidence: nächster Treffer gewinnt, bei Gleichstand früherer Zeitstempel, dann kleinere ID', () => {
    const inv = { id: 'inv-1', sentAt: SENT_AT }
    const far = audit({ id: 'far', createdAt: new Date(SENT_AT.getTime() + 500) })
    const near = audit({ id: 'near', createdAt: new Date(SENT_AT.getTime() + 10) })
    expect(selectDispatchEvidence(inv, [far, near])?.id).toBe('near')
    expect(selectDispatchEvidence(inv, [near, far])?.id).toBe('near')

    const before = audit({ id: 'z-before', createdAt: new Date(SENT_AT.getTime() - 10) })
    const after = audit({ id: 'a-after', createdAt: new Date(SENT_AT.getTime() + 10) })
    expect(selectDispatchEvidence(inv, [after, before])?.id).toBe('z-before')

    const t = new Date(SENT_AT.getTime() + 10)
    expect(selectDispatchEvidence(inv, [audit({ id: 'b', createdAt: t }), audit({ id: 'a', createdAt: t })])?.id).toBe('a')
  })

  it('selectDispatchEvidence ohne sentAt → null', () => {
    expect(selectDispatchEvidence({ id: 'inv-1', sentAt: null }, [audit()])).toBeNull()
  })
})

// ── Fälligkeit nach Europe/Berlin ─────────────────────────────

describe('Policy – Fälligkeit (Europe/Berlin)', () => {
  const due = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
  const check = (dueIso: string | null, nowIso: string) =>
    evaluateDunningEligibility(
      input({ purpose: 'preview', invoice: { dueDate: dueIso ? due(dueIso) : null }, now: new Date(nowIso), requestedLevel: undefined }),
    )

  const cases: Array<[string, string, boolean, string]> = [
    ['2026-10-15', '2026-10-15T21:59:59.999Z', false, 'Sommerzeit: noch Fälligkeitstag 23:59:59.999 Berlin'],
    ['2026-10-15', '2026-10-15T22:00:00.000Z', true, 'Sommerzeit: 00:00 Berlin Folgetag'],
    ['2026-10-15', '2026-10-15T00:00:00.000Z', false, 'Fälligkeitstag selbst, 02:00 Berlin'],
    ['2026-10-15', '2026-10-14T12:00:00.000Z', false, 'Vortag'],
    ['2026-01-15', '2026-01-15T22:59:59.999Z', false, 'Winterzeit: 23:59:59.999 Berlin'],
    ['2026-01-15', '2026-01-15T23:00:00.000Z', true, 'Winterzeit: 00:00 Berlin Folgetag'],
    ['2026-03-28', '2026-03-28T22:59:59.999Z', false, 'Umstellung auf Sommerzeit: Tag davor'],
    ['2026-03-28', '2026-03-28T23:00:00.000Z', true, 'Umstellung auf Sommerzeit: Folgetag beginnt'],
    ['2026-03-29', '2026-03-29T21:59:59.999Z', false, 'Umstellungstag endet'],
    ['2026-03-29', '2026-03-29T22:00:00.000Z', true, 'Umstellungstag + 1'],
    ['2026-10-24', '2026-10-24T21:59:59.999Z', false, 'Umstellung auf Winterzeit: Tag davor'],
    ['2026-10-24', '2026-10-24T22:00:00.000Z', true, 'Umstellung auf Winterzeit: Folgetag beginnt'],
    ['2026-10-25', '2026-10-25T22:59:59.999Z', false, 'Umstellungstag endet in Winterzeit'],
    ['2026-10-25', '2026-10-25T23:00:00.000Z', true, 'Umstellungstag + 1'],
    ['2026-12-31', '2026-12-31T22:59:59.999Z', false, 'Jahresende'],
    ['2026-12-31', '2026-12-31T23:00:00.000Z', true, 'Jahreswechsel'],
    ['2028-02-28', '2028-02-28T23:00:00.000Z', true, 'Schaltjahr: 29.02. beginnt'],
    ['2028-02-29', '2028-02-29T22:59:59.999Z', false, 'Schaltjahr: 29.02. endet'],
  ]
  for (const [dueIso, nowIso, dunnable, note] of cases) {
    it(`due ${dueIso}, now ${nowIso} → ${dunnable ? 'mahnbar' : 'NOT_YET_DUE'} (${note})`, () => {
      const result = check(dueIso, nowIso)
      if (dunnable) expect(result.ok).toBe(true)
      else expect(reasonsOf(result)).toEqual(['NOT_YET_DUE'])
    })
  }

  it('dueDate null → NO_DUE_DATE; ungültiges Datum → NO_DUE_DATE', () => {
    expect(reasonsOf(check(null, NOW.toISOString()))).toEqual(['NO_DUE_DATE'])
    expect(
      reasonsOf(evaluateDunningEligibility(input({ purpose: 'preview', invoice: { dueDate: new Date('x') }, requestedLevel: undefined }))),
    ).toEqual(['NO_DUE_DATE'])
  })

  it('Meldung NOT_YET_DUE nennt das Datum deutsch formatiert', () => {
    const result = check('2026-10-15', '2026-10-15T10:00:00.000Z')
    if (result.ok) throw new Error('erwartet: gesperrt')
    expect(dunningBlockMessage('NOT_YET_DUE', result.details)).toBe('Das Zahlungsziel (15.10.2026) ist noch nicht überschritten.')
  })

  it('ungültiges now wirft (kein stilles „mahnbar“)', () => {
    expect(() => evaluateDunningEligibility(input({ now: new Date('x') }))).toThrow(RangeError)
  })
})

// ── Offener Betrag ────────────────────────────────────────────

describe('Policy – offener Betrag aus aktiven Zahlungen (Decimal)', () => {
  const run = (gross: string, paid: string) =>
    evaluateDunningEligibility(input({ invoice: { totalGross: gross }, activePaymentsSum: paid }))

  it('Teilzahlung: Basis = Brutto − Σ aktive Zahlungen', () => {
    const result = run('107.10', '42.84')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.outstandingAmount).toBe('64.26')
      expect(result.basis.grossAmount).toBe('107.10')
      expect(result.basis.activePaymentsSum).toBe('42.84')
    }
  })

  it('Restbetrag 0,01 ist mahnbar', () => {
    const result = run('100.00', '99.99')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.outstandingAmount).toBe('0.01')
  })

  it('Restbetrag 0,00 und Überzahlung sind gesperrt (NO_OUTSTANDING)', () => {
    expect(reasonsOf(run('100.00', '100.00'))).toEqual(['NO_OUTSTANDING'])
    expect(reasonsOf(run('100.00', '100.01'))).toEqual(['NO_OUTSTANDING'])
  })

  it('Brutto 0 oder negativ ist gesperrt', () => {
    expect(reasonsOf(run('0.00', '0.00'))).toEqual(['NO_OUTSTANDING'])
    expect(reasonsOf(run('-5.00', '0.00'))).toEqual(['NO_OUTSTANDING'])
  })

  it('keine Gleitkommafehler: 0.30 − 0.20 = 0.10 exakt', () => {
    const result = run('0.30', '0.20')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.outstandingAmount).toBe('0.10')
  })

  it('akzeptiert Decimal-ähnliche Objekte (Prisma.Decimal) wie Strings', () => {
    const dec = (v: string) => ({ toFixed: () => v })
    const result = evaluateDunningEligibility(input({ invoice: { totalGross: dec('50.00') }, activePaymentsSum: dec('20.50') }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.outstandingAmount).toBe('29.50')
  })

  it('unlesbarer Geldwert ist ein Datenfehler und wirft', () => {
    expect(() => run('abc', '0.00')).toThrow()
    expect(() => run('10.00', 'x')).toThrow()
  })

  it('Policy kennt nur die Zahlungssumme: ein abweichender paidAmount-Cache hat keinen Eingang', () => {
    const withCache = { ...input({ invoice: { totalGross: '100.00' }, activePaymentsSum: '40.00' }) } as DunningPolicyInput
    ;(withCache.invoice as unknown as Record<string, unknown>).paidAmount = '100.00'
    const result = evaluateDunningEligibility(withCache)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.outstandingAmount).toBe('60.00')
  })

  it('PARTIALLY_PAID und OVERDUE mit Zahlungen nutzen den tatsächlichen Rest', () => {
    for (const status of ['PARTIALLY_PAID', 'OVERDUE']) {
      const result = evaluateDunningEligibility(input({ invoice: { status, totalGross: '200.00' }, activePaymentsSum: '50.00' }))
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.outstandingAmount).toBe('150.00')
        expect(result.basis.invoiceStatusBefore).toBe(status)
      }
    }
  })
})

// ── Stufenlogik ───────────────────────────────────────────────

describe('Policy – Stufenlogik und Vorstufe (D5)', () => {
  it('Stufe 1 ohne Vorgänger', () => {
    const result = evaluateDunningEligibility(input({ requestedLevel: 1 }))
    expect(result.ok && result.nextLevel).toBe(1)
  })

  it('Stufe 2 nur nach versendeter Stufe 1', () => {
    expect(evaluateDunningEligibility(input({ notices: [notice(1, true)], requestedLevel: 2 })).ok).toBe(true)
    expect(reasonsOf(evaluateDunningEligibility(input({ notices: [notice(1, false)], requestedLevel: 2 })))).toEqual(['PREVIOUS_NOT_SENT'])
  })

  it('Stufe 3 nur nach versendeter Stufe 2', () => {
    const sentBoth = [notice(1, true), notice(2, true)]
    expect(evaluateDunningEligibility(input({ notices: sentBoth, requestedLevel: 3 })).ok).toBe(true)
    const unsent2 = [notice(1, true), notice(2, false)]
    expect(reasonsOf(evaluateDunningEligibility(input({ notices: unsent2, requestedLevel: 3 })))).toEqual(['PREVIOUS_NOT_SENT'])
  })

  it('Stufe 4 / nach Stufe 3: MAX_LEVEL (ohne zusätzliches LEVEL_MISMATCH)', () => {
    const all = [notice(1, true), notice(2, true), notice(3, true)]
    for (const requested of [3, 4]) {
      expect(reasonsOf(evaluateDunningEligibility(input({ notices: all, requestedLevel: requested })))).toEqual(['MAX_LEVEL'])
    }
    expect(MAX_DUNNING_LEVEL).toBe(3)
  })

  it('Stufensprung (Stufe 3 ohne Stufe 2) ist gesperrt', () => {
    const result = evaluateDunningEligibility(input({ notices: [notice(1, true)], requestedLevel: 3 }))
    expect(reasonsOf(result)).toEqual(['LEVEL_MISMATCH'])
  })

  it('Stufe 1 ohne Vorstufe aber angefordert Stufe 2 → LEVEL_MISMATCH', () => {
    expect(reasonsOf(evaluateDunningEligibility(input({ requestedLevel: 2 })))).toEqual(['LEVEL_MISMATCH'])
  })

  it('zweite parallele Anlage derselben Stufe: Stufe 1 existiert, wieder Stufe 1 angefordert → LEVEL_MISMATCH zuerst', () => {
    const afterFirst = evaluateDunningEligibility(input({ notices: [notice(1, false)], requestedLevel: 1 }))
    expect(reasonsOf(afterFirst)[0]).toBe('LEVEL_MISMATCH')
    expect(reasonsOf(afterFirst)).toEqual(['LEVEL_MISMATCH', 'PREVIOUS_NOT_SENT'])
    if (afterFirst.ok) return
    expect(dunningBlockMessage('LEVEL_MISMATCH', afterFirst.details)).toBe('Die nächste Mahnstufe muss 2 sein (aktuell: 1).')

    const sentFirst = evaluateDunningEligibility(input({ notices: [notice(1, true)], requestedLevel: 1 }))
    expect(reasonsOf(sentFirst)).toEqual(['LEVEL_MISMATCH'])
  })

  it('Dublette auf höchster Stufe: eine unversendete Mahnung sperrt die Folgestufe (fail closed)', () => {
    const dup = [notice(1, true, 'n1a'), notice(1, false, 'n1b')]
    expect(reasonsOf(evaluateDunningEligibility(input({ notices: dup, requestedLevel: 2 })))).toEqual(['PREVIOUS_NOT_SENT'])
  })

  it('previousNotice bei Dubletten: jüngster versendeter Eintrag', () => {
    const a = { id: 'a', level: 1, sentAt: new Date('2026-10-09T00:00:00.000Z') }
    const b = { id: 'b', level: 1, sentAt: new Date('2026-10-11T00:00:00.000Z') }
    const result = evaluateDunningEligibility(input({ notices: [a, b], requestedLevel: 2 }))
    expect(result.ok && result.basis.previousNotice?.id).toBe('b')
  })

  it('create ohne requestedLevel → LEVEL_MISMATCH; preview ohne requestedLevel → kein Stufenfehler', () => {
    expect(reasonsOf(evaluateDunningEligibility(input({ requestedLevel: undefined })))).toEqual(['LEVEL_MISMATCH'])
    const preview = evaluateDunningEligibility(input({ purpose: 'preview', requestedLevel: undefined, dunningDueDate: undefined }))
    expect(preview.ok && preview.nextLevel).toBe(1)
  })

  it('preview mit falsch angefordertem Level meldet LEVEL_MISMATCH', () => {
    expect(reasonsOf(evaluateDunningEligibility(input({ purpose: 'preview', requestedLevel: 3 })))).toEqual(['LEVEL_MISMATCH'])
  })

  for (const bad of [0, 4, 1.5, -1, Number.NaN]) {
    it(`ungültige vorhandene Mahnstufe ${String(bad)} ist ein Datenfehler und wirft`, () => {
      expect(() => evaluateDunningEligibility(input({ notices: [{ id: 'x', level: bad, sentAt: null }] }))).toThrow(RangeError)
    })
  }

  it('Meldung PREVIOUS_NOT_SENT und MAX_LEVEL', () => {
    const r1 = evaluateDunningEligibility(input({ notices: [notice(2, false), notice(1, true)], requestedLevel: 3 }))
    if (r1.ok) throw new Error('erwartet: gesperrt')
    expect(dunningBlockMessage('PREVIOUS_NOT_SENT', r1.details)).toBe('Mahnstufe 2 ist noch nicht als versendet markiert.')
    const r2 = evaluateDunningEligibility(input({ notices: [notice(3, true)], requestedLevel: 4 }))
    if (r2.ok) throw new Error('erwartet: gesperrt')
    expect(dunningBlockMessage('MAX_LEVEL', r2.details)).toBe('Maximale Mahnstufe 3 bereits erreicht. Rechtliche Schritte einleiten.')
  })
})

// ── Zahlungsziel der Mahnung (O5) ─────────────────────────────

describe('Policy – neues Zahlungsziel der Mahnung (INVALID_DUNNING_DUE_DATE)', () => {
  const withDue = (dunningDueDate: Date | null | undefined, now: Date = NOW) =>
    evaluateDunningEligibility(input({ invoice: { dueDate: new Date('2026-01-05T00:00:00.000Z') }, dunningDueDate, now }))

  it('fehlend (undefined/null) oder ungültig → INVALID_DUNNING_DUE_DATE', () => {
    expect(reasonsOf(withDue(undefined))).toEqual(['INVALID_DUNNING_DUE_DATE'])
    expect(reasonsOf(withDue(null))).toEqual(['INVALID_DUNNING_DUE_DATE'])
    expect(reasonsOf(withDue(new Date('x')))).toEqual(['INVALID_DUNNING_DUE_DATE'])
  })

  it('heute (Berliner Kalendertag) und Vergangenheit sind ungültig, morgen ist gültig', () => {
    expect(reasonsOf(withDue(new Date('2026-10-16T00:00:00.000Z')))).toEqual(['INVALID_DUNNING_DUE_DATE'])
    expect(reasonsOf(withDue(new Date('2026-10-15T00:00:00.000Z')))).toEqual(['INVALID_DUNNING_DUE_DATE'])
    expect(reasonsOf(withDue(new Date('2025-01-01T00:00:00.000Z')))).toEqual(['INVALID_DUNNING_DUE_DATE'])
    expect(withDue(new Date('2026-10-17T00:00:00.000Z')).ok).toBe(true)
  })

  it('Berliner Tageswechsel (Sommerzeit): 21:59:59.999Z = 15.10., 22:00:00Z = 16.10.', () => {
    const before = new Date('2026-10-15T21:59:59.999Z')
    const after = new Date('2026-10-15T22:00:00.000Z')
    expect(reasonsOf(withDue(new Date('2026-10-15T00:00:00.000Z'), before))).toEqual(['INVALID_DUNNING_DUE_DATE'])
    expect(withDue(new Date('2026-10-16T00:00:00.000Z'), before).ok).toBe(true)
    expect(reasonsOf(withDue(new Date('2026-10-16T00:00:00.000Z'), after))).toEqual(['INVALID_DUNNING_DUE_DATE'])
    expect(withDue(new Date('2026-10-17T00:00:00.000Z'), after).ok).toBe(true)
  })

  it('Berliner Tageswechsel (Winterzeit): 22:59:59.999Z = 15.01., 23:00:00Z = 16.01.', () => {
    const run = (due: string, now: string) =>
      evaluateDunningEligibility(
        input({ invoice: { dueDate: new Date('2026-01-10T00:00:00.000Z'), sentAt: SENT_AT }, dunningDueDate: new Date(`${due}T00:00:00.000Z`), now: new Date(now) }),
      )
    expect(reasonsOf(run('2026-01-15', '2026-01-15T22:59:59.999Z'))).toEqual(['INVALID_DUNNING_DUE_DATE'])
    expect(run('2026-01-16', '2026-01-15T22:59:59.999Z').ok).toBe(true)
    expect(reasonsOf(run('2026-01-16', '2026-01-15T23:00:00.000Z'))).toEqual(['INVALID_DUNNING_DUE_DATE'])
  })

  it('preview ignoriert das neue Zahlungsziel', () => {
    expect(evaluateDunningEligibility(input({ purpose: 'preview', requestedLevel: undefined, dunningDueDate: null })).ok).toBe(true)
  })

  it('Meldung', () => {
    const result = withDue(null)
    if (result.ok) throw new Error('erwartet: gesperrt')
    expect(dunningBlockMessage('INVALID_DUNNING_DUE_DATE', result.details)).toBe(
      'Das neue Zahlungsziel der Mahnung muss nach dem heutigen Tag liegen.',
    )
  })
})

// ── Gründe, Reihenfolge, Meldungen ────────────────────────────

describe('Policy – Sammlung der Gründe in Prüfreihenfolge', () => {
  it('mehrere Gründe erscheinen in der festgelegten Reihenfolge', () => {
    const result = evaluateDunningEligibility(
      input({
        invoice: { type: 'CORRECTION', status: 'DRAFT', sentAt: null, dueDate: null, totalGross: '10.00' },
        activePaymentsSum: '10.00',
        notices: [notice(3, true)],
        requestedLevel: 1,
        dunningDueDate: null,
      }),
    )
    expect(reasonsOf(result)).toEqual([
      'TYPE_NOT_DUNNABLE',
      'STATUS_NOT_DUNNABLE',
      'NOT_SENT',
      'NO_DUE_DATE',
      'NO_OUTSTANDING',
      'MAX_LEVEL',
      'INVALID_DUNNING_DUE_DATE',
    ])
  })

  it('die Reihenfolge der Konstante entspricht der Prüfreihenfolge (LEVEL_MISMATCH vor PREVIOUS_NOT_SENT)', () => {
    expect([...DUNNING_BLOCK_REASONS]).toEqual([
      'TYPE_NOT_DUNNABLE',
      'STATUS_NOT_DUNNABLE',
      'NOT_SENT',
      'NO_SEND_AUDIT',
      'NO_DUE_DATE',
      'NOT_YET_DUE',
      'NO_OUTSTANDING',
      'MAX_LEVEL',
      'LEVEL_MISMATCH',
      'PREVIOUS_NOT_SENT',
      'INVALID_DUNNING_DUE_DATE',
    ])
  })

  it('jede Meldung ist ein nichtleerer deutscher Text', () => {
    const details = { invoiceStatus: 'PAID', invoiceType: 'STANDARD', invoiceDueDate: '2026-10-15', highestLevel: 1, nextLevel: 2 as const, requestedLevel: 1 }
    for (const reason of DUNNING_BLOCK_REASONS) {
      const message = dunningBlockMessage(reason, details)
      expect(message.length).toBeGreaterThan(10)
      expect(message).not.toMatch(/undefined|null|NaN/)
    }
  })

  it('NO_SEND_AUDIT / NOT_SENT / NO_DUE_DATE / NO_OUTSTANDING: Wortlaut', () => {
    const d = { invoiceStatus: 'SENT', invoiceType: 'STANDARD', invoiceDueDate: null, highestLevel: 0, nextLevel: 1 as const, requestedLevel: 1 }
    expect(dunningBlockMessage('NOT_SENT', d)).toBe('Die Rechnung ist nicht als versendet dokumentiert (Versanddatum fehlt).')
    expect(dunningBlockMessage('NO_SEND_AUDIT', d)).toBe(
      'Der Rechnungsversand ist nicht nachvollziehbar dokumentiert (Statuswechsel auf „Versendet“ fehlt).',
    )
    expect(dunningBlockMessage('NO_DUE_DATE', d)).toBe('Die Rechnung hat kein Zahlungsziel.')
    expect(dunningBlockMessage('NO_OUTSTANDING', d)).toBe('Es ist kein offener Betrag vorhanden.')
  })

  it('Details der gesperrten Entscheidung enthalten Stufenlage und Fälligkeit', () => {
    const result = evaluateDunningEligibility(input({ notices: [notice(1, true)], requestedLevel: 3 }))
    if (result.ok) throw new Error('erwartet: gesperrt')
    expect(result.details).toEqual({
      invoiceStatus: 'SENT',
      invoiceType: 'STANDARD',
      invoiceDueDate: '2026-10-15',
      highestLevel: 1,
      nextLevel: 2,
      requestedLevel: 3,
    })
  })
})

// ── Reinheit ──────────────────────────────────────────────────

describe('Policy – Reinheit und Struktur (Quelltext-Guards)', () => {
  const source = readFileSync(resolve(process.cwd(), 'lib/services/dunning-policy.ts'), 'utf8')
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

  it('kein Prisma, kein Dateisystem, keine Uhr, kein Zufall', () => {
    expect(code).not.toMatch(/@\/lib\/db|prisma|node:fs|from 'fs'|Date\.now\(|new Date\(\)|Math\.random|process\.env/)
  })

  it('keine lokalen Datums-Getter/Setter und kein setHours', () => {
    expect(code).not.toMatch(/\.getDate\(|\.getMonth\(|\.getFullYear\(|\.getHours\(|\.setHours\(|toLocale/)
  })

  it('kein paidAmount in der Berechnung', () => {
    expect(code).not.toMatch(/paidAmount/)
  })

  it('Geld nur über Decimal-Helfer, keine Number()-/parseFloat-Konvertierung', () => {
    expect(code).not.toMatch(/parseFloat|Number\(|\+\s*Number|\.toNumber\(/)
    expect(code).toMatch(/remainingMoney/)
  })

  it('Typ- und Status-Gate sind Allowlists auf dem bestehenden Enum', () => {
    expect(code).toMatch(/DUNNABLE_INVOICE_TYPES[^=]*=\s*\[InvoiceType\.STANDARD\]/)
    expect(code).not.toMatch(/TYPE_CANCELLATION/)
  })
})
