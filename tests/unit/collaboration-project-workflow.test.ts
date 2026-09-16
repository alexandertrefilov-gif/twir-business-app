import { describe, expect, it } from 'vitest'
import {
  calculateProjectHealth,
  calculateProjectProgress,
  deriveNextAction,
  deriveStageStatuses,
  getStageCompletionBlocker,
  isCollaborationStageTransitionAllowed,
  type CollaborationStageSnapshot,
} from '@/lib/collaboration/project-workflow'

function stage(overrides: Partial<CollaborationStageSnapshot> = {}): CollaborationStageSnapshot {
  return {
    id: 'stage-1', code: 'PLANUNG', title: 'Planung', sequence: 1,
    status: 'NOT_STARTED', weight: 50, isRequired: true, plannedEnd: null,
    blockedReason: null, dependencies: [], ...overrides,
  }
}

describe('Collaboration-Projektworkflow Phase 1', () => {
  it('leitet READY erst ab, wenn alle Abhängigkeiten abgeschlossen sind', () => {
    const planning = stage({ id: 'planning', status: 'COMPLETED' })
    const execution = stage({ id: 'execution', code: 'AUSFUEHRUNG', title: 'Ausführung', sequence: 2, dependencies: [{ dependsOnStageId: 'planning', requiredStatus: 'COMPLETED' }] })
    expect(deriveStageStatuses([planning, execution]).find((item) => item.id === 'execution')?.derivedStatus).toBe('READY')
    expect(deriveStageStatuses([stage({ id: 'planning' }), execution]).find((item) => item.id === 'execution')?.derivedStatus).toBe('NOT_STARTED')
  })

  it('verwendet abgeleitete READY-Zustände auch für abhängige Phasen', () => {
    const planning = stage({ id: 'planning' })
    const execution = stage({ id: 'execution', code: 'AUSFUEHRUNG', title: 'Ausführung', sequence: 2, dependencies: [{ dependsOnStageId: 'planning', requiredStatus: 'READY' }] })
    expect(deriveStageStatuses([planning, execution]).find((item) => item.id === 'execution')?.derivedStatus).toBe('READY')
  })

  it('berechnet Fortschritt aus Pflichtphasen und Gewichten', () => {
    expect(calculateProjectProgress([stage({ status: 'COMPLETED', weight: 40 }), stage({ id: '2', status: 'IN_PROGRESS', weight: 60 })])).toBe(40)
    expect(calculateProjectProgress([stage({ weight: 0 })])).toBeNull()
  })

  it('setzt Gesundheit bei Blockern rot und bei überfälliger Phase gelb', () => {
    expect(calculateProjectHealth([stage({ status: 'BLOCKED', blockedReason: 'Betreiberfreigabe fehlt' })])).toBe('RED')
    expect(calculateProjectHealth([stage({ plannedEnd: new Date('2020-01-01T00:00:00Z') })], new Date('2020-01-02T00:00:00Z'))).toBe('YELLOW')
  })

  it('leitet die nächste Aktion aus Blockierung, Bereitschaft und aktiver Phase ab', () => {
    expect(deriveNextAction([{ ...stage({ status: 'BLOCKED', blockedReason: 'Freigabe fehlt' }), derivedStatus: 'BLOCKED' }])).toBe('Freigabe fehlt')
    expect(deriveNextAction([{ ...stage(), derivedStatus: 'READY' }])).toBe('Planung starten')
    expect(deriveNextAction([{ ...stage(), derivedStatus: 'IN_PROGRESS' }])).toBe('Planung abschließen')
  })

  it('priorisiert offene Blocker, Freigaben, Aufgaben und Checklisten', () => {
    const base = stage({ id: 's1', title: 'Ausführung', status: 'IN_PROGRESS', requiresApproval: true })
    expect(deriveNextAction([{ ...base, blockers: [{ id: 'b', title: 'Lieferung fehlt', status: 'OPEN' }], derivedStatus: 'BLOCKED' }])).toBe('Lieferung fehlt')
    expect(deriveNextAction([{ ...base, approvals: [], derivedStatus: 'WAITING_FOR_APPROVAL' }])).toBe('Ausführung freigeben')
    expect(deriveNextAction([{ ...base, tasks: [{ id: 't', title: 'Montage prüfen', status: 'TODO', priority: 'HIGH', dueDate: null, sequence: 1, isRequired: true }], derivedStatus: 'IN_PROGRESS' }])).toBe('Montage prüfen')
    expect(deriveNextAction([{ ...base, checklistItems: [{ id: 'c', title: 'Sicherheitscheck', sequence: 1, isRequired: true, completed: false, completedAt: null }], derivedStatus: 'IN_PROGRESS' }])).toBe('Sicherheitscheck')
  })

  it('setzt Health bei kritischen Blockern und überfälligen Pflichtaufgaben', () => {
    const required = stage({ blockers: [{ id: 'b', title: 'Kritischer Blocker', status: 'OPEN' }] })
    expect(calculateProjectHealth([required])).toBe('RED')
    expect(calculateProjectHealth([stage({ tasks: [{ id: 't', title: 'Aufgabe', status: 'TODO', priority: 'MEDIUM', dueDate: new Date('2020-01-01'), sequence: 1, isRequired: true }] })], new Date('2020-01-02'))).toBe('YELLOW')
  })

  it('erzwingt Transitionen und Abschluss-Gates zentral', () => {
    expect(isCollaborationStageTransitionAllowed('READY', 'IN_PROGRESS')).toBe(true)
    expect(isCollaborationStageTransitionAllowed('COMPLETED', 'IN_PROGRESS')).toBe(false)
    expect(getStageCompletionBlocker(stage({ tasks: [{ id: 't', title: 'Pflicht', status: 'TODO', priority: 'HIGH', dueDate: null, sequence: 1, isRequired: true }] }))).toMatch(/Aufgaben/)
    expect(getStageCompletionBlocker(stage({ checklistItems: [{ id: 'c', title: 'Punkt', sequence: 1, isRequired: true, completed: false, completedAt: null }] }))).toMatch(/Checklisten/)
    expect(getStageCompletionBlocker(stage({ requiresApproval: true, status: 'IN_PROGRESS', approvals: [] }))).toMatch(/Freigabe/)
  })
})
