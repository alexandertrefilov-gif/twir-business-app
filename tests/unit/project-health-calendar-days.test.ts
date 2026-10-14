// REQ-029 P5-6 B-2 / C2a: calculateProjectHealth – Frist-Überschreitung erst am Berliner Kalendertag NACH task.dueDate / stage.plannedEnd (E-3).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateProjectHealth, type CollaborationStageSnapshot } from '@/lib/collaboration/project-workflow'

function stage(overrides: Partial<CollaborationStageSnapshot> = {}): CollaborationStageSnapshot {
  return {
    id: 'stage-1', code: 'PLANUNG', title: 'Planung', sequence: 1,
    status: 'IN_PROGRESS', weight: 50, isRequired: true, plannedEnd: null,
    blockedReason: null, dependencies: [], ...overrides,
  }
}
const task = (over: Record<string, unknown> = {}) => ({ id: 't', title: 'Aufgabe', status: 'TODO', priority: 'MEDIUM', dueDate: null as Date | null, sequence: 1, isRequired: true, ...over }) as NonNullable<CollaborationStageSnapshot['tasks']>[number]
const D = (iso: string) => new Date(iso)

describe('calculateProjectHealth – plannedEnd (E-3)', () => {
  const plannedEnd = D('2026-10-20T00:00:00Z')
  const s = stage({ plannedEnd })
  it('am plannedEnd-Tag selbst noch GREEN (zu jeder Berliner Uhrzeit)', () => {
    for (const now of ['2026-10-19T22:00:00Z', '2026-10-20T00:00:01Z', '2026-10-20T12:00:00Z', '2026-10-20T21:59:59Z']) {
      expect(calculateProjectHealth([s], D(now)), now).toBe('GREEN')
    }
  })
  it('am Berliner Folgetag YELLOW', () => {
    for (const now of ['2026-10-20T22:00:00Z', '2026-10-21T09:00:00Z', '2026-11-01T09:00:00Z']) {
      expect(calculateProjectHealth([s], D(now)), now).toBe('YELLOW')
    }
  })
  it('vor dem Termin GREEN', () => {
    expect(calculateProjectHealth([s], D('2026-10-19T10:00:00Z'))).toBe('GREEN')
  })
  it('Altwert mit Uhrzeit (E-5): plannedEnd 2026-10-20T17:42:31Z zählt als 20.10.', () => {
    const legacy = stage({ plannedEnd: D('2026-10-20T17:42:31Z') })
    expect(calculateProjectHealth([legacy], D('2026-10-20T18:00:00Z'))).toBe('GREEN')
    expect(calculateProjectHealth([legacy], D('2026-10-20T21:59:59Z'))).toBe('GREEN')
    expect(calculateProjectHealth([legacy], D('2026-10-20T22:00:00Z'))).toBe('YELLOW')
  })
  it('abgeschlossene Phase wird nie wegen plannedEnd gelb', () => {
    expect(calculateProjectHealth([stage({ plannedEnd, status: 'COMPLETED' })], D('2026-12-01T10:00:00Z'))).toBe('GREEN')
  })
  it('nicht erforderliche Phase wird nie wegen plannedEnd gelb', () => {
    expect(calculateProjectHealth([stage({ plannedEnd, isRequired: false })], D('2026-12-01T10:00:00Z'))).toBe('GREEN')
  })
})

describe('calculateProjectHealth – Aufgaben-Fälligkeit (C2a)', () => {
  const dueDate = D('2026-10-20T00:00:00Z')
  const s = stage({ tasks: [task({ dueDate })] })
  it('Fälligkeitstag selbst GREEN, Folgetag YELLOW', () => {
    expect(calculateProjectHealth([s], D('2026-10-20T09:00:00Z'))).toBe('GREEN')
    expect(calculateProjectHealth([s], D('2026-10-20T21:59:59Z'))).toBe('GREEN')
    expect(calculateProjectHealth([s], D('2026-10-20T22:00:00Z'))).toBe('YELLOW')
    expect(calculateProjectHealth([s], D('2026-10-21T09:00:00Z'))).toBe('YELLOW')
  })
  it('erledigte/übersprungene und optionale Aufgaben machen nie gelb', () => {
    const now = D('2026-12-01T10:00:00Z')
    expect(calculateProjectHealth([stage({ tasks: [task({ dueDate, status: 'DONE' })] })], now)).toBe('GREEN')
    expect(calculateProjectHealth([stage({ tasks: [task({ dueDate, status: 'SKIPPED' })] })], now)).toBe('GREEN')
    expect(calculateProjectHealth([stage({ tasks: [task({ dueDate, isRequired: false })] })], now)).toBe('GREEN')
  })
  it('Altwert mit Uhrzeit (E-5)', () => {
    const legacy = stage({ tasks: [task({ dueDate: D('2026-10-20T17:42:31Z') })] })
    expect(calculateProjectHealth([legacy], D('2026-10-20T21:59:59Z'))).toBe('GREEN')
    expect(calculateProjectHealth([legacy], D('2026-10-20T22:00:00Z'))).toBe('YELLOW')
  })
})

describe('calculateProjectHealth – unabhängige Gründe bleiben unverändert (E-3)', () => {
  const now = D('2026-10-20T09:00:00Z')
  it('offener Blocker / BLOCKED → RED', () => {
    expect(calculateProjectHealth([stage({ status: 'BLOCKED' })], now)).toBe('RED')
    expect(calculateProjectHealth([stage({ blockedReason: 'wartet' })], now)).toBe('RED')
    expect(calculateProjectHealth([stage({ blockers: [{ id: 'b', title: 'x', status: 'OPEN' }] as never })], now)).toBe('RED')
  })
  it('wartende Pflicht-Freigabe → YELLOW, unabhängig von jedem Datum', () => {
    expect(calculateProjectHealth([stage({ requiresApproval: true, status: 'WAITING_FOR_APPROVAL' })], now)).toBe('YELLOW')
  })
  it('RED hat Vorrang vor überfälligem Termin', () => {
    expect(calculateProjectHealth([stage({ status: 'BLOCKED', plannedEnd: D('2020-01-01T00:00:00Z') })], now)).toBe('RED')
  })
  it('weit überfälliger Termin bleibt YELLOW', () => {
    expect(calculateProjectHealth([stage({ plannedEnd: D('2020-01-01T00:00:00Z') })], now)).toBe('YELLOW')
  })
})

describe('calculateProjectHealth – Default-now (new Date()) nutzt ebenfalls den Berliner Kalendertag', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }) })
  afterEach(() => { vi.useRealTimers() })
  it('Fälligkeitstag GREEN, Folgetag YELLOW', () => {
    const s = stage({ plannedEnd: D('2026-10-20T00:00:00Z') })
    vi.setSystemTime(D('2026-10-20T12:00:00Z'))
    expect(calculateProjectHealth([s])).toBe('GREEN')
    vi.setSystemTime(D('2026-10-20T22:30:00Z'))
    expect(calculateProjectHealth([s])).toBe('YELLOW')
  })
})
