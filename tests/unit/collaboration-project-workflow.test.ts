import { describe, expect, it } from 'vitest'
import {
  calculateProjectHealth,
  calculateProjectProgress,
  COLLABORATION_PROJECT_STATUS_TRANSITIONS,
  deriveNextAction,
  deriveStageStatuses,
  getProjectCompletionBlocker,
  getStageCompletionBlocker,
  isCollaborationProjectStatusTransitionAllowed,
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

// REQ-016: Projektabschluss. CollaborationProject.status existierte bereits
// im Schema, wurde aber von keinem Codepfad je gesetzt (siehe GGA-05-Audit).
// isCollaborationProjectStatusTransitionAllowed()/getProjectCompletionBlocker()
// sind das Projektebenen-Analogon zu isCollaborationStageTransitionAllowed()/
// getStageCompletionBlocker() oben — dieselbe bereits bestehende
// deriveStageStatuses()-Ableitung, keine zweite Statuslogik. Die vollständige
// Rollenmatrix + Server-Enforcement laufen als Integrationstest gegen eine
// echte DB, siehe tests/integration/collaboration-gga-restructure-db.test.ts
// → "REQ-016".
describe('Projektabschluss (REQ-016)', () => {
  it('erlaubt nur die vordefinierten Statusübergänge, terminale Zustände (COMPLETED/CANCELLED) haben keine Folgeübergänge', () => {
    expect(isCollaborationProjectStatusTransitionAllowed('DRAFT', 'ACTIVE')).toBe(true)
    expect(isCollaborationProjectStatusTransitionAllowed('ACTIVE', 'COMPLETED')).toBe(true)
    expect(isCollaborationProjectStatusTransitionAllowed('ACTIVE', 'DRAFT')).toBe(false)
    expect(isCollaborationProjectStatusTransitionAllowed('COMPLETED', 'ACTIVE')).toBe(false)
    expect(isCollaborationProjectStatusTransitionAllowed('CANCELLED', 'ACTIVE')).toBe(false)
    expect(COLLABORATION_PROJECT_STATUS_TRANSITIONS.COMPLETED).toEqual([])
    expect(COLLABORATION_PROJECT_STATUS_TRANSITIONS.CANCELLED).toEqual([])
  })

  it('getProjectCompletionBlocker: blockiert, solange eine erforderliche Phase weder COMPLETED noch SKIPPED ist', () => {
    const stages = deriveStageStatuses([
      stage({ id: 's1', code: 'KONZEPT', title: 'Konzept', sequence: 1, status: 'COMPLETED' }),
      stage({ id: 's2', code: 'PLANUNG', title: 'Planung', sequence: 2, status: 'IN_PROGRESS' }),
    ])
    expect(getProjectCompletionBlocker(stages)).toMatch(/Planung/)
  })

  it('getProjectCompletionBlocker: nicht-erforderliche Phasen blockieren den Projektabschluss nicht', () => {
    const stages = deriveStageStatuses([
      stage({ id: 's1', code: 'KONZEPT', title: 'Konzept', sequence: 1, status: 'COMPLETED' }),
      stage({ id: 's2', code: 'PLANUNG', title: 'Planung', sequence: 2, status: 'IN_PROGRESS', isRequired: false }),
    ])
    expect(getProjectCompletionBlocker(stages)).toBeNull()
  })

  it('getProjectCompletionBlocker: SKIPPED zählt wie COMPLETED, exakt wie bei der bestehenden Stage-Logik', () => {
    const stages = deriveStageStatuses([
      stage({ id: 's1', code: 'KONZEPT', title: 'Konzept', sequence: 1, status: 'SKIPPED' }),
      stage({ id: 's2', code: 'PLANUNG', title: 'Planung', sequence: 2, status: 'COMPLETED' }),
    ])
    expect(getProjectCompletionBlocker(stages)).toBeNull()
  })

  it('getProjectCompletionBlocker: ein Projekt ohne Phasen kann nicht sinnvoll abgeschlossen werden', () => {
    expect(getProjectCompletionBlocker([])).not.toBeNull()
  })

  it('getProjectCompletionBlocker: erlaubt Abschluss erst, wenn alle erforderlichen Phasen abgeschlossen sind — deckungsgleich mit deriveNextAction()s "Projektabschluss prüfen"', () => {
    const allDone = deriveStageStatuses([
      stage({ id: 's1', code: 'KONZEPT', title: 'Konzept', sequence: 1, status: 'COMPLETED' }),
      stage({ id: 's2', code: 'ABNAHME', title: 'Abnahme', sequence: 2, status: 'COMPLETED' }),
    ])
    expect(getProjectCompletionBlocker(allDone)).toBeNull()
    expect(deriveNextAction(allDone)).toBe('Projektabschluss prüfen')
  })
})

// REQ-015.2: Multi-Cabinet Approval Undercounting. getStageCompletionBlocker()
// prüfte die Freigabe-Bedingung bisher mit einem einzigen .some(APPROVED)
// über ALLE Approvals der Stage — bei mehreren Cabinets auf derselben Stage
// genügte damit die APPROVED-Freigabe EINES Cabinets, um die Stage (und in
// der Folge über getProjectCompletionBlocker() das gesamte Projekt) als
// abschlussfähig erscheinen zu lassen, obwohl ein anderes Cabinet auf
// derselben Stage noch offen/abgelehnt war. approval.cabinetId (neu im
// Snapshot) unterscheidet jetzt explizit zwischen stage-weiten Freigaben
// (cabinetId null, z. B. generische Projektphasen ohne GGA-Bezug über
// CollaborationStageActions.tsx) und cabinet-bezogenen Freigaben (GGA-
// ABNAHME je Schrank über GgaCabinetInspectionWizard.tsx) — beide Semantiken
// existieren produktiv nebeneinander auf demselben Modell.
describe('Multi-Cabinet Approval Gate (REQ-015.2)', () => {
  const approvalStage = (approvals: CollaborationStageSnapshot['approvals']) =>
    stage({ id: 'abnahme', code: 'ABNAHME', title: 'Abnahme', sequence: 4, status: 'IN_PROGRESS', requiresApproval: true, approvals })

  it('1 Cabinet, APPROVED: Stage ist freigegeben', () => {
    expect(getStageCompletionBlocker(approvalStage([{ id: 'a1', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: 'cab-A' }]))).toBeNull()
  })

  it('2 Cabinets, nur A APPROVED, B ohne Freigabe: Stage bleibt blockiert (nicht mehr fälschlich freigegeben)', () => {
    const blocker = getStageCompletionBlocker(approvalStage([
      { id: 'a1', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: 'cab-A' },
      { id: 'a2', status: 'REQUESTED', requestedAt: new Date(), decidedAt: null, cabinetId: 'cab-B' },
    ]))
    expect(blocker).toMatch(/Freigabe/)
  })

  it('2 Cabinets, beide APPROVED: Stage ist freigegeben', () => {
    const blocker = getStageCompletionBlocker(approvalStage([
      { id: 'a1', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: 'cab-A' },
      { id: 'a2', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: 'cab-B' },
    ]))
    expect(blocker).toBeNull()
  })

  it('REJECTED zählt nicht als erfüllt, auch wenn ein anderes Cabinet APPROVED ist', () => {
    const blocker = getStageCompletionBlocker(approvalStage([
      { id: 'a1', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: 'cab-A' },
      { id: 'a2', status: 'REJECTED', requestedAt: new Date(), decidedAt: new Date(), decisionNote: 'Volumenstrom nicht erreicht', cabinetId: 'cab-B' },
    ]))
    expect(blocker).toMatch(/Freigabe/)
  })

  it('REQUESTED (noch nicht entschieden) zählt nicht als erfüllt', () => {
    const blocker = getStageCompletionBlocker(approvalStage([
      { id: 'a1', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: 'cab-A' },
      { id: 'a2', status: 'REQUESTED', requestedAt: new Date(), decidedAt: null, cabinetId: 'cab-B' },
    ]))
    expect(blocker).toMatch(/Freigabe/)
  })

  it('stage-weite Approval-Semantik (cabinetId null, generische Projektphasen ohne GGA-Bezug) bleibt unverändert: eine einzelne APPROVED-Freigabe genügt', () => {
    expect(getStageCompletionBlocker(approvalStage([{ id: 'a1', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: null }]))).toBeNull()
    expect(getStageCompletionBlocker(approvalStage([{ id: 'a1', status: 'REQUESTED', requestedAt: new Date(), decidedAt: null, cabinetId: null }]))).toMatch(/Freigabe/)
  })

  it('ein Cabinet aus einer ANDEREN Stage zählt nicht mit — die approvals-Liste enthält nur Freigaben der eigenen Stage', () => {
    // getStageCompletionBlocker() erhält je Aufruf ausschließlich die
    // approvals EINER Stage (siehe getCollaborationPhase2Project()/
    // transitionCollaborationStage() — beide selektieren approvals über
    // stage.approvals bzw. eine stageId-gefilterte Relation). Ein Cabinet,
    // dessen Freigabe auf einer anderen Stage hängt, kann hier gar nicht
    // erst auftauchen — die einzige Stage mit cabinet-bezogenen Freigaben
    // ist die im Testfall übergebene.
    const blocker = getStageCompletionBlocker(approvalStage([
      { id: 'a1', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: 'cab-A' },
    ]))
    expect(blocker).toBeNull()
  })

  it('ACTIVE → COMPLETED (REQ-016) darf einen unvollständigen zweiten Schrank nicht umgehen', () => {
    const stages = deriveStageStatuses([
      stage({ id: 's1', code: 'KONZEPT', title: 'Konzept', sequence: 1, status: 'COMPLETED' }),
      approvalStage([
        { id: 'a1', status: 'APPROVED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: 'cab-A' },
        { id: 'a2', status: 'REJECTED', requestedAt: new Date(), decidedAt: new Date(), cabinetId: 'cab-B' },
      ]),
    ])
    // ABNAHME hat status IN_PROGRESS, keine offenen Tasks/Checklisten, aber
    // die Freigabe-Bedingung ist wegen cab-B nicht erfüllt → derivedStatus
    // darf NICHT COMPLETED/SKIPPED sein, und getProjectCompletionBlocker()
    // muss das Projekt weiterhin blockieren.
    const abnahme = stages.find((s) => s.id === 'abnahme')!
    expect(['COMPLETED', 'SKIPPED']).not.toContain(abnahme.derivedStatus)
    expect(getProjectCompletionBlocker(stages)).toMatch(/Abnahme/)
  })
})

// REQ-015.4: schließt den in REQ-015.3 real reproduzierten Bypass — ein
// Cabinet OHNE jede Task-/Checklisten-/Approval-Zeile blieb für
// getStageCompletionBlocker()/getProjectCompletionBlocker() unsichtbar,
// weil diese ausschließlich vorhandene Zeilen auswerten. stage.cabinets
// wird vom Aufrufer (collaboration-phase2.service.ts) aus der vollständigen,
// von GgaCabinet.projectId bestimmten Cabinet-Menge (Membership) befüllt —
// diese reinen Funktionstests decken nur die Logik ab, die bereits
// befüllte cabinets-Liste korrekt auszuwerten.
describe('Cabinet-Membership-Gate (REQ-015.4)', () => {
  const cabinetStage = (cabinets: CollaborationStageSnapshot['cabinets']) =>
    stage({ id: 'abnahme', code: 'ABNAHME', title: 'Abnahme', sequence: 4, status: 'IN_PROGRESS', cabinets })

  it('cabinets undefined (Nicht-GGA-Stage/-Projekt): keine Einschränkung', () => {
    expect(getStageCompletionBlocker(cabinetStage(undefined))).toBeNull()
  })

  it('cabinets leer (GGA-Stage, aber noch keine Cabinets im Projekt): keine Einschränkung (vacuous true)', () => {
    expect(getStageCompletionBlocker(cabinetStage([]))).toBeNull()
  })

  it('1 Cabinet, ready: Stage nicht blockiert', () => {
    expect(getStageCompletionBlocker(cabinetStage([{ id: 'cab-A', ready: true }]))).toBeNull()
  })

  it('2 Cabinets, eines nicht ready (z. B. unberührt): Stage blockiert', () => {
    const blocker = getStageCompletionBlocker(cabinetStage([{ id: 'cab-A', ready: true }, { id: 'cab-B', ready: false }]))
    expect(blocker).toMatch(/Schränke/)
  })

  it('2 Cabinets, beide ready: Stage nicht blockiert', () => {
    expect(getStageCompletionBlocker(cabinetStage([{ id: 'cab-A', ready: true }, { id: 'cab-B', ready: true }]))).toBeNull()
  })

  it('deriveStageStatuses: ein nicht-ready Cabinet hält eine IN_PROGRESS-Stage auf WAITING_FOR_APPROVAL, unabhängig von requiresApproval', () => {
    const s = stage({ id: 'konzept', code: 'KONZEPT', title: 'Konzept', sequence: 1, status: 'IN_PROGRESS', requiresApproval: false, cabinets: [{ id: 'cab-B', ready: false }] })
    const derived = deriveStageStatuses([s])
    expect(derived[0].derivedStatus).toBe('WAITING_FOR_APPROVAL')
  })

  it('ein bereits abgeschlossenes Cabinet aus einem fremden Kontext taucht in cabinets gar nicht erst auf — Membership kommt ausschließlich aus der vom Aufrufer übergebenen Liste', () => {
    // Reiner Funktionstest: diese Funktion kennt kein GgaCabinet.projectId,
    // sie sieht nur, was der Aufrufer in stage.cabinets übergibt — die
    // eigentliche Projekt-Isolation wird durch die DB-Tests (T9) belegt.
    expect(getStageCompletionBlocker(cabinetStage([{ id: 'cab-A', ready: true }]))).toBeNull()
  })
})
