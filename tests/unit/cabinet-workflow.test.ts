import { describe, expect, it } from 'vitest'
import {
  deriveCabinetStatus, deriveGgaCabinetControlTowerSummary, deriveGgaControlTowerOverview, deriveGgaProjectWorklist, formatGgaBetriebsstatusLabel,
  GGA_FIVE_PHASE_PLAN, GGA_STAGE_ABNAHME, GGA_STAGE_ABSCHLUSS, GGA_STAGE_KONZEPT, GGA_STAGE_PLANUNG, GGA_STAGE_UMSETZUNG,
  ggaCabinetBereitFuerInterneFreigabe, ggaCabinetBereitFuerBetreiberfreigabe, isCabinetReadyForStage,
  deriveCurrentPruefnachweis, isGgaPruefartBestanden, ggaCabinetHatHandlungsbedarf, aktuellerGgaFortschritt, type GgaCabinetPruefnachweisSnapshot,
  type GgaCabinetControlTowerEntry, type GgaCabinetSnapshot, type GgaControlTowerCabinetEntry, type GgaWorklistCabinetBlocker,
  type GgaWorklistCabinetInput, type GgaWorklistCabinetTask, type GgaPruefart, deriveGgaProjectPresentationStatus,
  deriveGgaCabinetPresentationStatus, istGgaPruefpfad, direkteGgaHandlungsbedarfAktion, direkteGgaCabinetAktion, naechsterSchrittFuerCabinet,
  ggaControlTowerReasons, direktAktionFuerWorklistTyp,
  deriveGgaProjektPhasenWorklist, direktAktionFuerProjektArbeit, praesentationsStatusFuerProjektArbeit,
  type GgaProjektPhasenTaskInput, type GgaProjektPhasenBlockerInput,
} from '@/lib/collaboration/cabinet-workflow'
import { GGA_FIVE_PHASE_PLAN as GGA_FIVE_PHASE_PLAN_FROM_SERVICE } from '@/lib/services/collaboration-phase2.service'

function entry(id: string, kennung: string, snapshot: GgaCabinetSnapshot, now?: Date): GgaCabinetControlTowerEntry {
  return { id, kennung, ...deriveCabinetStatus(snapshot, now) }
}

function controlTowerCabinet(
  id: string, kennung: string, projectId: string, projectNumber: string | null, projectName: string,
  snapshot: GgaCabinetSnapshot, options: { standort?: string | null; now?: Date; nichtBestandenePruefarten?: GgaPruefart[] } = {},
): GgaControlTowerCabinetEntry {
  return {
    id, kennung, standort: options.standort ?? null, projectId, projectNumber, projectName,
    nichtBestandenePruefarten: options.nichtBestandenePruefarten ?? [],
    ...deriveCabinetStatus(snapshot, options.now),
  }
}

function worklistCabinet(
  id: string, kennung: string, snapshot: GgaCabinetSnapshot,
  options: { standort?: string | null; openRequiredTasks?: GgaWorklistCabinetTask[]; openBlockers?: GgaWorklistCabinetBlocker[]; now?: Date } = {},
): GgaWorklistCabinetInput {
  return {
    id, kennung, standort: options.standort ?? null,
    status: deriveCabinetStatus(snapshot, options.now),
    openRequiredTasks: options.openRequiredTasks ?? [],
    openBlockers: options.openBlockers ?? [],
  }
}

function baseSnapshot(overrides: Partial<GgaCabinetSnapshot> = {}): GgaCabinetSnapshot {
  return {
    bestandsaufnahmeAm: null,
    pruefintervallMonate: null,
    letztePruefungAm: null,
    tasks: [],
    checklistItems: [],
    blockers: [],
    approvals: [],
    ...overrides,
  }
}

describe('deriveCabinetStatus — Bestandsaufnahme/Planungs-/Montagefortschritt', () => {
  it('liefert null (nicht 0%), wenn keine Tasks in der jeweiligen Phase existieren', () => {
    const status = deriveCabinetStatus(baseSnapshot())
    expect(status.bestandsaufnahmeFortschritt).toBeNull()
    expect(status.planungsfortschritt).toBeNull()
    expect(status.montagefortschritt).toBeNull()
  })

  it('bestandsaufnahmeAbgeschlossen kommt ausschließlich aus dem echten Zeitstempel, nicht aus Checklisten', () => {
    expect(deriveCabinetStatus(baseSnapshot()).bestandsaufnahmeAbgeschlossen).toBe(false)
    expect(deriveCabinetStatus(baseSnapshot({ bestandsaufnahmeAm: new Date('2026-01-01') })).bestandsaufnahmeAbgeschlossen).toBe(true)
  })

  it('trennt Bestandsaufnahme- (KONZEPT), Planungs- (PLANUNG) und Montagefortschritt (UMSETZUNG) sauber voneinander', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      tasks: [
        { id: '1', title: 'Aufnahme abschließen', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'KONZEPT' },
        { id: '2', title: 'Planung abschließen', status: 'TODO', isRequired: true, sequence: 2, stageCode: 'PLANUNG' },
        { id: '3', title: 'Montage', status: 'TODO', isRequired: true, sequence: 3, stageCode: 'UMSETZUNG' },
      ],
    }))
    expect(status.bestandsaufnahmeFortschritt).toBe(100)
    expect(status.planungsfortschritt).toBe(0)
    expect(status.montagefortschritt).toBe(0)
  })

  it('ignoriert optionale (nicht erforderliche) Tasks bei der Fortschrittsberechnung', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      tasks: [
        { id: '1', title: 'Pflicht', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: '2', title: 'Optional', status: 'TODO', isRequired: false, sequence: 2, stageCode: 'PLANUNG' },
      ],
    }))
    expect(status.planungsfortschritt).toBe(100)
  })

  it('bezieht Checklistenpunkte in denselben Phasen mit ein', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      tasks: [{ id: '1', title: 'Task', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'UMSETZUNG' }],
      checklistItems: [{ id: 'c1', title: 'Check', completed: false, isRequired: true, sequence: 1, stageCode: 'UMSETZUNG' }],
    }))
    expect(status.montagefortschritt).toBe(50)
  })
})

describe('deriveCabinetStatus — Prüfstatus', () => {
  it('NICHT_GEPLANT ohne jede Prüfungs-Freigabe', () => {
    expect(deriveCabinetStatus(baseSnapshot()).pruefstatus).toBe('NICHT_GEPLANT')
  })

  it('GEPLANT bei angefragter, aber nicht entschiedener Prüfung', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      approvals: [{ id: 'a1', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: null, stageCode: 'ABNAHME' }],
    }))
    expect(status.pruefstatus).toBe('GEPLANT')
  })

  it('BEANSTANDET bei abgelehnter Prüfung', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      approvals: [{ id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-02'), stageCode: 'ABNAHME' }],
    }))
    expect(status.pruefstatus).toBe('BEANSTANDET')
  })

  it('BESTANDEN bei genehmigter Prüfung innerhalb des Prüfintervalls', () => {
    const now = new Date('2026-06-01')
    const status = deriveCabinetStatus(baseSnapshot({
      pruefintervallMonate: 12,
      letztePruefungAm: new Date('2026-01-01'),
      approvals: [{ id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2025-12-20'), decidedAt: new Date('2026-01-01'), stageCode: 'ABNAHME' }],
    }), now)
    expect(status.pruefstatus).toBe('BESTANDEN')
  })

  it('UEBERFAELLIG, wenn das Prüfintervall seit der letzten Prüfung abgelaufen ist', () => {
    const now = new Date('2027-06-01')
    const status = deriveCabinetStatus(baseSnapshot({
      pruefintervallMonate: 12,
      letztePruefungAm: new Date('2026-01-01'),
      approvals: [{ id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2025-12-20'), decidedAt: new Date('2026-01-01'), stageCode: 'ABNAHME' }],
    }), now)
    expect(status.pruefstatus).toBe('UEBERFAELLIG')
  })

  it('ignoriert Freigaben aus anderen Phasen (z. B. PLANUNG) für den Prüfstatus', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      approvals: [{ id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-02'), stageCode: 'PLANUNG' }],
    }))
    expect(status.pruefstatus).toBe('NICHT_GEPLANT')
  })
})

describe('deriveCabinetStatus — Blocker und nächste Aktion', () => {
  it('zählt nur offene Blocker', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      blockers: [
        { id: 'b1', title: 'Offen', status: 'OPEN' },
        { id: 'b2', title: 'Gelöst', status: 'RESOLVED' },
      ],
    }))
    expect(status.offeneBlocker).toBe(1)
  })

  it('priorisiert einen offenen Blocker als nächste Aktion vor offenen Tasks', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      blockers: [{ id: 'b1', title: 'Abluft blockiert', status: 'OPEN' }],
      tasks: [{ id: 't1', title: 'Planung starten', status: 'TODO', isRequired: true, sequence: 1, stageCode: 'PLANUNG' }],
    }))
    expect(status.naechsteAktion).toBe('Abluft blockiert')
  })

  it('schlägt "Bestandsaufnahme durchführen" vor, solange bestandsaufnahmeAm nicht gesetzt ist', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      tasks: [{ id: 't1', title: 'Montage', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'UMSETZUNG' }],
    }))
    expect(status.naechsteAktion).toBe('Bestandsaufnahme durchführen')
  })

  it('schlägt "Prüfung planen" vor, wenn die Bestandsaufnahme abgeschlossen ist und keine Prüfung existiert', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [{ id: 't1', title: 'Montage', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'UMSETZUNG' }],
    }))
    expect(status.naechsteAktion).toBe('Prüfung planen')
  })
})

describe('deriveCabinetStatus — Lebenszyklus-Stufe (BESTAND→PLANUNG→UMSETZUNG→PRÜFUNG/ABNAHME→ABGESCHLOSSEN)', () => {
  it('BESTAND, solange die Bestandsaufnahme nicht abgeschlossen ist', () => {
    expect(deriveCabinetStatus(baseSnapshot()).lifecycleStage).toBe('BESTAND')
  })

  it('PLANUNG, wenn Bestand fertig ist, aber Planung nicht 100% erreicht', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [{ id: 't1', title: 'Planung', status: 'TODO', isRequired: true, sequence: 1, stageCode: 'PLANUNG' }],
    }))
    expect(status.lifecycleStage).toBe('PLANUNG')
  })

  it('UMSETZUNG erst, wenn Planung 100% erreicht ist — offene Umsetzungs-Maßnahmen verhindern ABGESCHLOSSEN', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage offen', status: 'TODO', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
    }))
    expect(status.lifecycleStage).toBe('UMSETZUNG')
  })

  it('PRUEFUNG_ABNAHME, wenn Bestand/Planung/Umsetzung fertig sind, aber die Prüfung noch nicht bestanden ist', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
    }))
    expect(status.lifecycleStage).toBe('PRUEFUNG_ABNAHME')
    expect(status.pruefungOffen).toBe(true)
    expect(status.abgeschlossen).toBe(false)
  })

  it('ABGESCHLOSSEN nur, wenn zusätzlich die Prüfung bestanden ist', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
      approvals: [{ id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' }],
    }))
    expect(status.lifecycleStage).toBe('ABGESCHLOSSEN')
    expect(status.abgeschlossen).toBe(true)
    expect(status.pruefungOffen).toBe(false)
    expect(status.freigabeOffen).toBe(false)
  })

  it('freigabeOffen: ABNAHME-Checkliste vollständig, aber noch keine entschiedene Freigabe', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
      checklistItems: [{ id: 'c1', title: 'Elektro/VDE geprüft', completed: true, isRequired: true, sequence: 1, stageCode: 'ABNAHME' }],
    }))
    expect(status.freigabeOffen).toBe(true)
    expect(status.pruefungOffen).toBe(false)
    // GGA-03.1: freigabeOffen betrifft ausschließlich die interne Freigabe,
    // der Text darf sie nie mit der externen Betreiberfreigabe verwechseln.
    expect(status.naechsteAktion).toBe('Interne Freigabe anfordern')
  })

  it('nacharbeitErforderlich: letzte Freigabe wurde abgelehnt — Cabinet bleibt offen, nie automatisch bestanden', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
      approvals: [{ id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' }],
    }))
    expect(status.nacharbeitErforderlich).toBe(true)
    expect(status.abgeschlossen).toBe(false)
    expect(status.naechsteAktion).toBe('Beanstandung nachbessern')
  })
})

function fertigesCabinet(overrides: Partial<GgaCabinetSnapshot> = {}): GgaCabinetSnapshot {
  return baseSnapshot({
    bestandsaufnahmeAm: new Date('2026-01-01'),
    tasks: [
      { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
      { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
    ],
    approvals: [{ id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' }],
    ...overrides,
  })
}

// GGA-03.1: naechsteAktion() gab für freigabeOffen (interne Freigabe) fälschlich
// den Betreiber-Text zurück. Fix betrifft ausschließlich diese eine Textzeile;
// die Priorisierung/Ableitung selbst ist unverändert (siehe bestehende Tests
// oben für Blocker-/Maßnahmen-/Checklisten-Priorität, Lebenszyklus, Nacharbeit).
describe('deriveCabinetStatus — naechsteAktion(): interne Freigabe vs. Betreiberfreigabe (GGA-03.1)', () => {
  it('A) interne Prüfung abgeschlossen, keine entschiedene interne Freigabe → "Interne Freigabe anfordern"', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
      checklistItems: [{ id: 'c1', title: 'Elektro/VDE geprüft', completed: true, isRequired: true, sequence: 1, stageCode: 'ABNAHME' }],
    }))
    expect(status.freigabeOffen).toBe(true)
    expect(status.betreiberfreigabeAusstehend).toBe(false)
    expect(status.naechsteAktion).toBe('Interne Freigabe anfordern')
  })

  // B) HINWEIS zur Abweichung von der Checkpoint-Vorgabe: laut Auftrag sollte
  // betreiberfreigabeAusstehend weiterhin "Betreiberfreigabe anfordern"
  // liefern. Das entspricht nicht dem tatsächlichen, unveränderten Code (auch
  // vor diesem Fix nicht) — betreiberfreigabeAusstehend lieferte und liefert
  // "Betreiberentscheidung abwarten" (Zeile "if (betreiberfreigabeAusstehend)
  // return 'Betreiberentscheidung abwarten'"). "Betreiberfreigabe anfordern"
  // war ausschließlich der fehlerhafte Text von freigabeOffen (jetzt behoben)
  // sowie unabhängig davon ein Button-Label in
  // GgaCabinetInspectionWizard.tsx für den Zustand NICHT_ANGEFORDERT. Diese
  // Regression testet deshalb bewusst den tatsächlich korrekten, unveränderten
  // Text — siehe Abschlussbericht.
  it('B) interne Freigabe bestanden, Betreiberfreigabe angefordert und ausstehend → weiterhin "Betreiberentscheidung abwarten" (unverändert)', () => {
    const status = deriveCabinetStatus(fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REQUESTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))
    expect(status.betreiberfreigabeAusstehend).toBe(true)
    expect(status.freigabeOffen).toBe(false)
    expect(status.naechsteAktion).toBe('Betreiberentscheidung abwarten')
  })

  it('C) freigabeOffen und betreiberfreigabeAusstehend erzeugen nie denselben oder den jeweils anderen Text', () => {
    const interneFreigabeOffen = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
      checklistItems: [{ id: 'c1', title: 'Elektro/VDE geprüft', completed: true, isRequired: true, sequence: 1, stageCode: 'ABNAHME' }],
    }))
    const betreiberfreigabeOffen = deriveCabinetStatus(fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REQUESTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))
    expect(interneFreigabeOffen.naechsteAktion).not.toBe(betreiberfreigabeOffen.naechsteAktion)
    expect(interneFreigabeOffen.naechsteAktion).toBe('Interne Freigabe anfordern')
    expect(betreiberfreigabeOffen.naechsteAktion).toBe('Betreiberentscheidung abwarten')
  })

  it('D) die Priorität von Blocker/Maßnahme/Checkliste vor internen und Betreiber-Freigabetexten bleibt unverändert', () => {
    // Ein offener Blocker verdrängt weiterhin jeden Freigabetext — exakt wie
    // vor dem Textfix, keine Prioritätsänderung durch GGA-03.1.
    const status = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
      checklistItems: [{ id: 'c1', title: 'Elektro/VDE geprüft', completed: true, isRequired: true, sequence: 1, stageCode: 'ABNAHME' }],
      blockers: [{ id: 'b1', title: 'Tür klemmt', status: 'OPEN' }],
    }))
    expect(status.freigabeOffen).toBe(true) // Zustand bleibt bestehen …
    expect(status.naechsteAktion).toBe('Tür klemmt') // … aber der Blocker hat weiterhin Vorrang.
  })
})

describe('deriveCabinetStatus — Betreiberstatus (getrennt von internem Prüfstatus)', () => {
  it('NICHT_ANGEFORDERT ohne jede OPERATOR_ACCEPTANCE — internes BESTANDEN reicht allein zum Abschluss', () => {
    const status = deriveCabinetStatus(fertigesCabinet())
    expect(status.betreiberstatus).toBe('NICHT_ANGEFORDERT')
    expect(status.pruefstatus).toBe('BESTANDEN')
    expect(status.lifecycleStage).toBe('ABGESCHLOSSEN')
    expect(status.abgeschlossen).toBe(true)
  })

  it('AUSSTEHEND blockiert den Abschluss, obwohl die interne Prüfung bereits BESTANDEN ist', () => {
    const status = deriveCabinetStatus(fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REQUESTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))
    expect(status.pruefstatus).toBe('BESTANDEN')
    expect(status.betreiberstatus).toBe('AUSSTEHEND')
    expect(status.lifecycleStage).toBe('PRUEFUNG_ABNAHME')
    expect(status.abgeschlossen).toBe(false)
    expect(status.betreiberfreigabeAusstehend).toBe(true)
    expect(status.naechsteAktion).toBe('Betreiberentscheidung abwarten')
  })

  it('BEANSTANDET markiert Nacharbeit erforderlich und verhindert den Abschluss, auch bei internem BESTANDEN', () => {
    const status = deriveCabinetStatus(fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REJECTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: new Date('2026-02-04'), stageCode: 'ABNAHME' },
      ],
    }))
    expect(status.betreiberstatus).toBe('BEANSTANDET')
    expect(status.nacharbeitErforderlich).toBe(true)
    expect(status.betreiberbeanstandung).toBe(true)
    expect(status.lifecycleStage).toBe('PRUEFUNG_ABNAHME')
    expect(status.naechsteAktion).toBe('Beanstandung bearbeiten')
  })

  it('ERTEILT erlaubt den Abschluss gemeinsam mit internem BESTANDEN', () => {
    const status = deriveCabinetStatus(fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'APPROVED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: new Date('2026-02-05'), stageCode: 'ABNAHME' },
      ],
    }))
    expect(status.betreiberstatus).toBe('ERTEILT')
    expect(status.betreiberfreigabeErteilt).toBe(true)
    expect(status.lifecycleStage).toBe('ABGESCHLOSSEN')
    expect(status.abgeschlossen).toBe(true)
  })

  it('eine ältere BEANSTANDET-Runde bleibt in der Historie erhalten, nur die neueste OPERATOR_ACCEPTANCE zählt für den Status', () => {
    const status = deriveCabinetStatus(fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REJECTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: new Date('2026-02-04'), stageCode: 'ABNAHME' },
        { id: 'op-2', status: 'APPROVED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-10'), decidedAt: new Date('2026-02-12'), stageCode: 'ABNAHME' },
      ],
    }))
    expect(status.betreiberstatus).toBe('ERTEILT')
    expect(status.abgeschlossen).toBe(true)
  })
})

describe('deriveCabinetStatus — Betriebsstatus (einheitliches Anzeige-Label)', () => {
  it('MANGEL_OFFEN hat Vorrang vor allem anderen — auch vor einer bestandenen internen Prüfung', () => {
    const status = deriveCabinetStatus(fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REJECTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: new Date('2026-02-04'), stageCode: 'ABNAHME' },
      ],
    }))
    expect(status.betriebsstatus).toBe('MANGEL_OFFEN')
    expect(formatGgaBetriebsstatusLabel(status.betriebsstatus, status.betriebsstatusTageBisFaellig)).toBe('Mangel offen')
  })

  it('ERSTPRUEFUNG_ERFORDERLICH ohne jede Prüfungshistorie — auch wenn eine erste Prüfung bereits angefordert, aber noch nicht entschieden ist', () => {
    const nieGeprueft = deriveCabinetStatus(baseSnapshot())
    expect(nieGeprueft.betriebsstatus).toBe('ERSTPRUEFUNG_ERFORDERLICH')
    expect(formatGgaBetriebsstatusLabel(nieGeprueft.betriebsstatus, nieGeprueft.betriebsstatusTageBisFaellig)).toBe('Erstprüfung erforderlich')

    const ersteAngefordert = deriveCabinetStatus(baseSnapshot({
      approvals: [{ id: 'a1', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: null, stageCode: 'ABNAHME' }],
    }))
    expect(ersteAngefordert.betriebsstatus).toBe('ERSTPRUEFUNG_ERFORDERLICH')
    expect(formatGgaBetriebsstatusLabel(ersteAngefordert.betriebsstatus, ersteAngefordert.betriebsstatusTageBisFaellig)).toBe('Erstprüfung erforderlich')
  })

  it('NACHPRUEFUNG_ERFORDERLICH nur, wenn bereits eine entschiedene Prüfung existiert und danach erneut geprüft werden muss', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      approvals: [
        { id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-05'), stageCode: 'ABNAHME' },
        { id: 'a2', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))
    expect(status.betriebsstatus).toBe('NACHPRUEFUNG_ERFORDERLICH')
    expect(formatGgaBetriebsstatusLabel(status.betriebsstatus, status.betriebsstatusTageBisFaellig)).toBe('Nachprüfung erforderlich')
  })

  it('UEBERFAELLIG, wenn die Prüffrist bereits abgelaufen ist', () => {
    const now = new Date('2027-06-01')
    const status = deriveCabinetStatus(fertigesCabinet({
      pruefintervallMonate: 12,
      letztePruefungAm: new Date('2026-01-01'),
    }), now)
    expect(status.betriebsstatus).toBe('UEBERFAELLIG')
    expect(formatGgaBetriebsstatusLabel(status.betriebsstatus, status.betriebsstatusTageBisFaellig)).toBe('Prüfung überfällig')
  })

  it('BETRIEBSBEREIT, wenn bestanden aber keine Prüffrist bekannt ist (kein Countdown möglich)', () => {
    const status = deriveCabinetStatus(fertigesCabinet({ pruefintervallMonate: null, letztePruefungAm: null }))
    expect(status.betriebsstatus).toBe('BETRIEBSBEREIT')
    expect(status.betriebsstatusTageBisFaellig).toBeNull()
    expect(formatGgaBetriebsstatusLabel(status.betriebsstatus, status.betriebsstatusTageBisFaellig)).toBe('Betriebsbereit')
  })

  it('FAELLIG_IN_TAGEN zeigt den exakten Tage-Countdown, wenn mehr als 30 Tage verbleiben (Beispiel: 86 Tage)', () => {
    const letztePruefungAm = new Date('2026-01-01')
    const faelligAm = new Date('2027-01-01')
    const target = new Date(faelligAm.getTime() - 86 * 24 * 60 * 60 * 1000)
    const status = deriveCabinetStatus(fertigesCabinet({ pruefintervallMonate: 12, letztePruefungAm }), target)
    expect(status.betriebsstatus).toBe('FAELLIG_IN_TAGEN')
    expect(status.betriebsstatusTageBisFaellig).toBe(86)
    expect(formatGgaBetriebsstatusLabel(status.betriebsstatus, status.betriebsstatusTageBisFaellig)).toBe('Prüfung in 86 Tagen')
  })

  it('BALD_FAELLIG innerhalb des 30-Tage-Vorlaufs vor der Fälligkeit', () => {
    const letztePruefungAm = new Date('2026-01-01')
    const faelligAm = new Date('2027-01-01')
    const target = new Date(faelligAm.getTime() - 20 * 24 * 60 * 60 * 1000) // 20 Tage vor Fälligkeit
    const status = deriveCabinetStatus(fertigesCabinet({ pruefintervallMonate: 12, letztePruefungAm }), target)
    expect(status.betriebsstatus).toBe('BALD_FAELLIG')
    expect(formatGgaBetriebsstatusLabel(status.betriebsstatus, status.betriebsstatusTageBisFaellig)).toBe('Prüfung bald fällig')
  })

  it('genau 30 Tage vor Fälligkeit zählt bereits als "bald fällig" (Grenzfall)', () => {
    const letztePruefungAm = new Date('2026-01-01')
    const faelligAm = new Date('2027-01-01')
    const target = new Date(faelligAm.getTime() - 30 * 24 * 60 * 60 * 1000)
    const status = deriveCabinetStatus(fertigesCabinet({ pruefintervallMonate: 12, letztePruefungAm }), target)
    expect(status.betriebsstatus).toBe('BALD_FAELLIG')
  })
})

describe('deriveCabinetStatus — Mangelbehebung (REQ-011): Blocker-Resolution darf eine erforderliche Nachprüfung nicht überspringen', () => {
  it('ein aufgelöster Blocker allein ändert pruefstatus/nacharbeitErforderlich/lifecycleStage/abgeschlossen/betriebsstatus nicht — nur Blocker-Zähler und nächste Aktion', () => {
    // Simuliert genau das, was resolveCollaborationBlocker() serverseitig tut: es wird
    // ausschließlich der Blocker-Status geändert, keine Approval wird jemals berührt.
    const mitOffenemMangel = fertigesCabinet({
      approvals: [{ id: 'internal-1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' }],
      blockers: [{ id: 'b1', title: 'Tür schließt nicht dicht', status: 'OPEN' }],
    })
    const vorBehebung = deriveCabinetStatus(mitOffenemMangel)
    expect(vorBehebung.pruefstatus).toBe('BEANSTANDET')
    expect(vorBehebung.nacharbeitErforderlich).toBe(true)
    expect(vorBehebung.abgeschlossen).toBe(false)
    expect(vorBehebung.lifecycleStage).toBe('PRUEFUNG_ABNAHME')
    expect(vorBehebung.betriebsstatus).toBe('MANGEL_OFFEN')
    expect(vorBehebung.offeneBlocker).toBe(1)
    expect(vorBehebung.naechsteAktion).toBe('Tür schließt nicht dicht')

    const nachBehebung = deriveCabinetStatus({
      ...mitOffenemMangel,
      blockers: [{ id: 'b1', title: 'Tür schließt nicht dicht', status: 'RESOLVED' }],
    })

    // Eine erforderliche Nachprüfung wird NICHT übersprungen: pruefstatus bleibt
    // BEANSTANDET, solange keine neue interne Freigabe angefordert/entschieden wurde.
    expect(nachBehebung.pruefstatus).toBe('BEANSTANDET')
    expect(nachBehebung.nacharbeitErforderlich).toBe(true)
    // Der Schrank wird NICHT automatisch freigegeben/abgeschlossen.
    expect(nachBehebung.abgeschlossen).toBe(false)
    expect(nachBehebung.lifecycleStage).toBe('PRUEFUNG_ABNAHME')
    expect(nachBehebung.betriebsstatus).toBe('MANGEL_OFFEN')

    // Einzig betroffen: Blocker-Zähler und die daraus abgeleitete nächste Aktion.
    expect(nachBehebung.offeneBlocker).toBe(0)
    expect(nachBehebung.naechsteAktion).not.toBe('Tür schließt nicht dicht')
    expect(nachBehebung.naechsteAktion).toBe('Beanstandung nachbessern')
  })

  it('erst eine neu angeforderte UND bestandene Nachprüfung erlaubt den regulären Abschluss — die Blocker-Behebung allein reicht nicht', () => {
    const status = deriveCabinetStatus(fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'internal-2', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-03-01'), decidedAt: new Date('2026-03-02'), stageCode: 'ABNAHME' },
      ],
      blockers: [{ id: 'b1', title: 'Tür schließt nicht dicht', status: 'RESOLVED' }],
    }))
    expect(status.pruefstatus).toBe('BESTANDEN')
    expect(status.nacharbeitErforderlich).toBe(false)
    expect(status.abgeschlossen).toBe(true)
  })
})

describe('deriveGgaCabinetControlTowerSummary (REQ-012): Projektweite GGA-Kennzahlen', () => {
  it('leeres Projekt ohne GGA-Schränke liefert konsistente Nullwerte statt eines Fehlers oder null', () => {
    const summary = deriveGgaCabinetControlTowerSummary([])
    expect(summary).toEqual({
      gesamt: 0, bestandsaufnahmeOffen: 0, planungOffen: 0, umsetzungOffen: 0,
      pruefungOffen: 0, nachpruefungErforderlich: 0, ueberfaellig: 0, freigabeOffen: 0,
      nacharbeitErforderlich: 0, abgeschlossen: 0, mitBlocker: 0, aufmerksamkeitErforderlich: 0,
      betreiberfreigabeAusstehend: 0, betreiberbeanstandung: 0, betreiberfreigabeErteilt: 0,
      cabinets: [],
    })
  })

  it('aggregiert alle von REQ-012 geforderten Kennzahlen korrekt über mehrere Schränke hinweg (gesamt, Bestandsaufnahme, Planung, Umsetzung, Prüfung, interne/Betreiber-Freigabe, Mängel, abgeschlossen)', () => {
    const neuAngelegt = entry('c1', 'N-001', baseSnapshot())
    const inPlanung = entry('c2', 'N-002', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [{ id: 't1', title: 'Planung', status: 'TODO', isRequired: true, sequence: 1, stageCode: 'PLANUNG' }],
    }))
    const inUmsetzung = entry('c3', 'N-003', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage offen', status: 'TODO', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
    }))
    const freigabeOffenCabinet = entry('c4', 'N-004', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
      checklistItems: [{ id: 'c1', title: 'Elektro/VDE geprüft', completed: true, isRequired: true, sequence: 1, stageCode: 'ABNAHME' }],
    }))
    const betreiberAusstehend = entry('c5', 'N-005', fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REQUESTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))
    const mitOffenemMangel = entry('c6', 'N-006', baseSnapshot({
      blockers: [{ id: 'b1', title: 'Beschädigtes Schild', status: 'OPEN' }],
    }))
    const abgeschlossenCabinet = entry('c7', 'N-007', fertigesCabinet())

    const summary = deriveGgaCabinetControlTowerSummary([
      neuAngelegt, inPlanung, inUmsetzung, freigabeOffenCabinet, betreiberAusstehend, mitOffenemMangel, abgeschlossenCabinet,
    ])

    expect(summary.gesamt).toBe(7)
    expect(summary.bestandsaufnahmeOffen).toBe(2) // neuAngelegt, mitOffenemMangel
    expect(summary.planungOffen).toBe(1) // inPlanung
    expect(summary.umsetzungOffen).toBe(1) // inUmsetzung
    expect(summary.freigabeOffen).toBe(1) // freigabeOffenCabinet
    expect(summary.betreiberfreigabeAusstehend).toBe(1) // betreiberAusstehend
    expect(summary.mitBlocker).toBe(1) // mitOffenemMangel
    expect(summary.abgeschlossen).toBe(1) // abgeschlossenCabinet
    expect(summary.cabinets).toHaveLength(7)
  })

  it('Nachprüfung erforderlich wird separat von einfacher offener Prüfung gezählt — beide Signale beantworten unterschiedliche Fragen', () => {
    const ersteInspektionOffen = entry('c1', 'E-001', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
    })) // noch nie geprüft: pruefungOffen=true, aber KEINE Nachprüfung
    const nachpruefungOffen = entry('c2', 'E-002', fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'internal-2', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-03-01'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    })) // bereits abgelehnt, erneut angefordert: pruefungOffen=true UND nachpruefungErforderlich=true

    const summary = deriveGgaCabinetControlTowerSummary([ersteInspektionOffen, nachpruefungOffen])

    expect(summary.pruefungOffen).toBe(2) // beide haben technisch offene Prüfarbeit
    expect(summary.nachpruefungErforderlich).toBe(1) // nur der bereits einmal abgelehnte Schrank
    expect(ersteInspektionOffen.betriebsstatus).not.toBe('NACHPRUEFUNG_ERFORDERLICH')
    expect(nachpruefungOffen.betriebsstatus).toBe('NACHPRUEFUNG_ERFORDERLICH')
  })

  it('ein Schrank, der laut deriveCabinetStatus() bereits abgeschlossen ist, aber noch einen offenen Blocker hat, zählt gleichzeitig zu "abgeschlossen" UND zu "mitBlocker"/"aufmerksamkeitErforderlich" — keine Kategorie verdrängt die andere', () => {
    const abgeschlossenMitMangel = entry('c1', 'K-001', fertigesCabinet({
      blockers: [{ id: 'b1', title: 'Kleiner Nachtrag', status: 'OPEN' }],
    }))
    expect(abgeschlossenMitMangel.abgeschlossen).toBe(true) // ausschließlich aus deriveCabinetStatus(), nicht neu bewertet

    const summary = deriveGgaCabinetControlTowerSummary([abgeschlossenMitMangel])
    expect(summary.abgeschlossen).toBe(1)
    expect(summary.mitBlocker).toBe(1)
    expect(summary.aufmerksamkeitErforderlich).toBe(1)
    expect(summary.cabinets[0].aufmerksamkeitErforderlich).toBe(true)
  })

  it('"abgeschlossen" zählt ausschließlich item.abgeschlossen (deriveCabinetStatus) — kein eigenes UI-Kriterium', () => {
    const beanstandet = entry('c1', 'K-002', fertigesCabinet({
      approvals: [{ id: 'internal-1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' }],
    }))
    expect(beanstandet.abgeschlossen).toBe(false)
    const summary = deriveGgaCabinetControlTowerSummary([beanstandet])
    expect(summary.abgeschlossen).toBe(0)
    expect(summary.nacharbeitErforderlich).toBe(1)
    expect(summary.aufmerksamkeitErforderlich).toBe(1)
  })
})

describe('deriveGgaProjectWorklist (REQ-013): Fristen & nächste Aktionen', () => {
  const now = new Date('2026-06-15T09:00:00.000Z')

  it('1) eine offene Maßnahme mit zukünftiger Frist erscheint mit Dringlichkeit "demnächst fällig"', () => {
    const cabinet = worklistCabinet('c1', 'K-001', baseSnapshot(), {
      openRequiredTasks: [{ id: 't1', title: 'Soll-Wert dokumentieren', dueDate: new Date('2026-06-20T00:00:00.000Z'), verantwortlich: null }],
      now,
    })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist).toHaveLength(1)
    expect(worklist[0]).toMatchObject({ title: 'Soll-Wert dokumentieren', type: 'MASSNAHME', urgency: 4, ueberfaellig: false })
    expect(worklist[0].dueDate).toEqual(new Date('2026-06-20T00:00:00.000Z'))
  })

  it('2) eine überfällige offene Maßnahme erscheint mit Dringlichkeit "überfällig"', () => {
    const cabinet = worklistCabinet('c1', 'K-001', baseSnapshot(), {
      openRequiredTasks: [{ id: 't1', title: 'Ist-Wert nachtragen', dueDate: new Date('2026-06-01T00:00:00.000Z'), verantwortlich: null }],
      now,
    })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist).toHaveLength(1)
    expect(worklist[0]).toMatchObject({ title: 'Ist-Wert nachtragen', type: 'MASSNAHME', urgency: 1, ueberfaellig: true })
  })

  it('3) eine bereits erledigte Maßnahme mit vergangener Frist erzeugt keinen Eintrag (Filterung erfolgt vor der Ableitung, siehe gga-cabinet-db.test.ts)', () => {
    // Die erledigte Maßnahme wird — wie in getGgaCabinetProjectWorklist() —
    // gar nicht erst in openRequiredTasks aufgenommen; die reine Funktion
    // kann eine erledigte Maßnahme dadurch strukturell nie als überfällig
    // ausgeben.
    const cabinet = worklistCabinet('c1', 'K-001', fertigesCabinet(), { openRequiredTasks: [], now })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist).toHaveLength(0)
  })

  it('4) mehrere Fristen werden deterministisch nach Dringlichkeit und anschließend nach Datum sortiert', () => {
    const cabinetA = worklistCabinet('c-a', 'B-002', baseSnapshot(), {
      openRequiredTasks: [{ id: 't1', title: 'Später fällig', dueDate: new Date('2026-06-25T00:00:00.000Z'), verantwortlich: null }],
      now,
    })
    const cabinetB = worklistCabinet('c-b', 'A-001', baseSnapshot(), {
      openRequiredTasks: [
        { id: 't2', title: 'Früher überfällig', dueDate: new Date('2026-06-01T00:00:00.000Z'), verantwortlich: null },
        { id: 't3', title: 'Später überfällig', dueDate: new Date('2026-06-10T00:00:00.000Z'), verantwortlich: null },
      ],
      openBlockers: [{ id: 'b1', title: 'Mangel B', verantwortlich: null }],
      now,
    })
    const worklist = deriveGgaProjectWorklist([cabinetA, cabinetB], now)
    // 1. beide überfälligen Maßnahmen (früheste zuerst), 2. der sicherheitsrelevante Mangel, 3. die demnächst fällige Maßnahme.
    expect(worklist.map((e) => e.title)).toEqual(['Früher überfällig', 'Später überfällig', 'Mangel B', 'Später fällig'])
    expect(worklist.map((e) => e.urgency)).toEqual([1, 1, 2, 4])
  })

  it('4b) innerhalb derselben Dringlichkeitsklasse ohne Datum entscheidet die Schrankkennung als stabiles Kriterium', () => {
    const cabinetZ = worklistCabinet('c-z', 'Z-999', baseSnapshot(), { openBlockers: [{ id: 'bz', title: 'Mangel Z', verantwortlich: null }], now })
    const cabinetA = worklistCabinet('c-a', 'A-001', baseSnapshot(), { openBlockers: [{ id: 'ba', title: 'Mangel A', verantwortlich: null }], now })
    const worklist = deriveGgaProjectWorklist([cabinetZ, cabinetA], now)
    expect(worklist.map((e) => e.kennung)).toEqual(['A-001', 'Z-999'])
  })

  it('5) der Verantwortliche wird korrekt aus der Maßnahme übernommen', () => {
    const cabinet = worklistCabinet('c1', 'K-001', baseSnapshot(), {
      openRequiredTasks: [{ id: 't1', title: 'Elektro prüfen', dueDate: null, verantwortlich: 'Anna Muster' }],
      now,
    })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist[0].verantwortlich).toBe('Anna Muster')
  })

  it('6) ein fehlender Verantwortlicher liefert null statt eines erfundenen Platzhaltertexts (neutrale Anzeige ist UI-Sache)', () => {
    const cabinet = worklistCabinet('c1', 'K-001', baseSnapshot(), {
      openRequiredTasks: [{ id: 't1', title: 'Elektro prüfen', dueDate: null, verantwortlich: null }],
      now,
    })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist[0].verantwortlich).toBeNull()
  })

  it('7) ein fehlendes dueDate funktioniert und liefert Dringlichkeit "ohne Frist", nie überfällig', () => {
    const cabinet = worklistCabinet('c1', 'K-001', baseSnapshot(), {
      openRequiredTasks: [{ id: 't1', title: 'Dokumentation nachreichen', dueDate: null, verantwortlich: null }],
      now,
    })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist[0]).toMatchObject({ urgency: 6, ueberfaellig: false, dueDate: null })
  })

  it('8) "Nachprüfung erforderlich" ohne dueDate bleibt in der Arbeitsliste sichtbar', () => {
    const cabinet = worklistCabinet('c1', 'K-001', fertigesCabinet({
      approvals: [
        { id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-05'), stageCode: 'ABNAHME' },
        { id: 'a2', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }), { now })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist).toContainEqual(expect.objectContaining({ type: 'NACHPRUEFUNG', title: 'Nachprüfung erforderlich', dueDate: null, urgency: 2 }))
  })

  it('9) "interne Freigabe anfordern" ohne dueDate bleibt in der Arbeitsliste sichtbar', () => {
    const cabinet = worklistCabinet('c1', 'K-001', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
      checklistItems: [{ id: 'c1', title: 'Elektro/VDE geprüft', completed: true, isRequired: true, sequence: 1, stageCode: 'ABNAHME' }],
    }), { now })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist).toContainEqual(expect.objectContaining({ type: 'INTERNE_FREIGABE', title: 'Interne Freigabe anfordern', dueDate: null, urgency: 2 }))
  })

  it('10) "Betreiberentscheidung abwarten" ohne dueDate bleibt sichtbar, wenn Betreiberfreigabe laut Workflow aussteht', () => {
    const cabinet = worklistCabinet('c1', 'K-001', fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REQUESTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }), { now })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist).toContainEqual(expect.objectContaining({ type: 'BETREIBERFREIGABE', title: 'Betreiberentscheidung abwarten', dueDate: null, urgency: 2 }))
  })

  it('11) ein konkreter offener Task und die davon abgeleitete generische "nächste Aktion" erzeugen keinen fachlichen Doppeleintrag', () => {
    const snapshot = baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [{ id: 't1', title: 'Soll-Abluft klären', status: 'TODO', isRequired: true, sequence: 1, stageCode: 'PLANUNG' }],
    })
    // Zur Kontrolle: deriveCabinetStatus() würde ohne die Sonderbehandlung
    // exakt denselben Titel als naechsteAktion ausgeben.
    expect(deriveCabinetStatus(snapshot, now).naechsteAktion).toBe('Soll-Abluft klären')

    const cabinet = worklistCabinet('c1', 'K-001', snapshot, {
      openRequiredTasks: [{ id: 't1', title: 'Soll-Abluft klären', dueDate: null, verantwortlich: null }],
      now,
    })
    const worklist = deriveGgaProjectWorklist([cabinet], now)
    expect(worklist).toHaveLength(1)
    expect(worklist[0]).toMatchObject({ title: 'Soll-Abluft klären', type: 'MASSNAHME' })
  })

  it('12) ein Projekt ohne GGA-Schränke liefert eine leere Arbeitsliste', () => {
    expect(deriveGgaProjectWorklist([], now)).toEqual([])
  })

  it('13) ein Projekt mit ausschließlich abgeschlossenen Schränken ohne offene Arbeit liefert eine leere Arbeitsliste', () => {
    const cabinet = worklistCabinet('c1', 'K-001', fertigesCabinet(), { openRequiredTasks: [], openBlockers: [], now })
    expect(deriveCabinetStatus(fertigesCabinet(), now).naechsteAktion).toBe('Keine offenen Punkte')
    expect(deriveGgaProjectWorklist([cabinet], now)).toEqual([])
  })
})

describe('deriveGgaControlTowerOverview (REQ-014): Projektübergreifender GGA Control Tower', () => {
  const now = new Date('2026-06-15T09:00:00.000Z')

  it('1) 0 Projekte / 0 Schränke liefert konsistente Nullwerte statt eines Fehlers', () => {
    const overview = deriveGgaControlTowerOverview([], new Set())
    expect(overview.aktiveGgaProjekte).toBe(0)
    expect(overview.gesamt.gesamt).toBe(0)
    expect(overview.projekte).toEqual([])
    expect(overview.dringendeSchraenke).toEqual([])
  })

  it('2) mehrere Projekte werden korrekt getrennt aggregiert', () => {
    const cabinets = [
      controlTowerCabinet('c1', 'A-001', 'p1', 'P-1', 'Projekt Eins', baseSnapshot()),
      controlTowerCabinet('c2', 'B-001', 'p2', 'P-2', 'Projekt Zwei', fertigesCabinet()),
    ]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1', 'p2']))
    expect(overview.projekte).toHaveLength(2)
    expect(overview.projekte.find((p) => p.projectId === 'p1')?.projectName).toBe('Projekt Eins')
    expect(overview.projekte.find((p) => p.projectId === 'p2')?.projectName).toBe('Projekt Zwei')
    expect(overview.gesamt.gesamt).toBe(2)
  })

  it('3) mehrere Schränke desselben Projekts werden im Projekt-Eintrag zusammengefasst', () => {
    const cabinets = [
      controlTowerCabinet('c1', 'A-001', 'p1', 'P-1', 'Projekt Eins', baseSnapshot()),
      controlTowerCabinet('c2', 'A-002', 'p1', 'P-1', 'Projekt Eins', baseSnapshot()),
      controlTowerCabinet('c3', 'A-003', 'p1', 'P-1', 'Projekt Eins', fertigesCabinet()),
    ]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.projekte).toHaveLength(1)
    expect(overview.projekte[0].gesamt).toBe(3)
    expect(overview.projekte[0].abgeschlossen).toBe(1)
  })

  it('4) abgeschlossen zählt korrekt — projektweit und übergreifend', () => {
    const cabinets = [
      controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', fertigesCabinet()),
      controlTowerCabinet('c2', 'A-002', 'p1', null, 'Projekt Eins', baseSnapshot()),
    ]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.gesamt.abgeschlossen).toBe(1)
    expect(overview.projekte[0].abgeschlossen).toBe(1)
  })

  it('5) offene Mängel (Blocker) zählen korrekt', () => {
    const cabinets = [controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', baseSnapshot({ blockers: [{ id: 'b1', title: 'Mangel', status: 'OPEN' }] }))]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.gesamt.mitBlocker).toBe(1)
    expect(overview.projekte[0].mitBlocker).toBe(1)
  })

  it('6) Nachprüfung erforderlich wird separat gezählt', () => {
    const cabinets = [controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', fertigesCabinet({
      approvals: [
        { id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-05'), stageCode: 'ABNAHME' },
        { id: 'a2', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.gesamt.nachpruefungErforderlich).toBe(1)
    expect(overview.gesamt.ueberfaellig).toBe(0)
  })

  it('7) überfällig wird separat gezählt', () => {
    const cabinets = [controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', fertigesCabinet({ pruefintervallMonate: 12, letztePruefungAm: new Date('2024-01-01') }), { now })]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.gesamt.ueberfaellig).toBe(1)
    expect(overview.gesamt.nachpruefungErforderlich).toBe(0)
  })

  it('8) interne Freigabe offen wird separat gezählt', () => {
    const cabinets = [controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
      ],
      checklistItems: [{ id: 'c1', title: 'Elektro/VDE geprüft', completed: true, isRequired: true, sequence: 1, stageCode: 'ABNAHME' }],
    }))]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.gesamt.freigabeOffen).toBe(1)
    expect(overview.gesamt.betreiberfreigabeAusstehend).toBe(0)
  })

  it('9) Betreiberfreigabe ausstehend wird separat gezählt', () => {
    const cabinets = [controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REQUESTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.gesamt.betreiberfreigabeAusstehend).toBe(1)
    expect(overview.gesamt.freigabeOffen).toBe(0)
  })

  it('10) Betreiberbeanstandung wird separat gezählt', () => {
    const cabinets = [controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REJECTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: new Date('2026-02-04'), stageCode: 'ABNAHME' },
      ],
    }))]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.gesamt.betreiberbeanstandung).toBe(1)
    expect(overview.gesamt.betreiberfreigabeAusstehend).toBe(0)
  })

  it('11) keine Doppelzählung — ein Schrank mit mehreren Problemen zählt in jeder betroffenen Kategorie genau einmal, aber nur ein Listeneintrag in "dringend"', () => {
    const cabinets = [controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', baseSnapshot({
      blockers: [{ id: 'b1', title: 'Mangel', status: 'OPEN' }],
    }))]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.gesamt.gesamt).toBe(1)
    expect(overview.gesamt.mitBlocker).toBe(1)
    expect(overview.gesamt.bestandsaufnahmeOffen).toBe(1)
    expect(overview.dringendeSchraenke).toHaveLength(1)
    expect(overview.dringendeSchraenke[0].gruende).toContain('MANGEL')
  })

  it('12) Projektsortierung ist deterministisch: Aufmerksamkeit > überfällig > Mängel > Nachprüfung > Projektnummer/-name', () => {
    const ruhig = controlTowerCabinet('c1', 'Z-001', 'p-ruhig', 'P-9', 'Ruhiges Projekt', fertigesCabinet())
    const wenigerDringend = controlTowerCabinet('c2', 'A-001', 'p-wenig', 'P-2', 'Wenig dringend', baseSnapshot({ blockers: [{ id: 'b1', title: 'Mangel', status: 'OPEN' }] }))
    const sehrDringend = controlTowerCabinet('c3', 'B-001', 'p-viel', 'P-1', 'Sehr dringend', baseSnapshot({
      blockers: [{ id: 'b1', title: 'Mangel 1', status: 'OPEN' }, { id: 'b2', title: 'Mangel 2', status: 'OPEN' }],
    }))
    const overview = deriveGgaControlTowerOverview([ruhig, wenigerDringend, sehrDringend], new Set())
    expect(overview.projekte.map((p) => p.projectId)).toEqual(['p-viel', 'p-wenig', 'p-ruhig'])
  })

  it('12b) innerhalb gleicher Dringlichkeit entscheidet die Projektnummer als stabiles Kriterium', () => {
    const projB = controlTowerCabinet('c1', 'K-001', 'p-b', 'P-002', 'B-Projekt', fertigesCabinet())
    const projA = controlTowerCabinet('c2', 'K-002', 'p-a', 'P-001', 'A-Projekt', fertigesCabinet())
    const overview = deriveGgaControlTowerOverview([projB, projA], new Set())
    expect(overview.projekte.map((p) => p.projectId)).toEqual(['p-a', 'p-b'])
  })

  it('13) dringende Schränke werden nach Schweregrad priorisiert: überfällig vor Mangel vor Nachprüfung vor Freigaben', () => {
    const nachpruefung = controlTowerCabinet('c1', 'N-001', 'p1', null, 'Projekt', fertigesCabinet({
      approvals: [
        { id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-05'), stageCode: 'ABNAHME' },
        { id: 'a2', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))
    const ueberfaellig = controlTowerCabinet('c2', 'U-001', 'p1', null, 'Projekt', fertigesCabinet({ pruefintervallMonate: 12, letztePruefungAm: new Date('2024-01-01') }), { now })
    const mangel = controlTowerCabinet('c3', 'M-001', 'p1', null, 'Projekt', baseSnapshot({ blockers: [{ id: 'b1', title: 'Mangel', status: 'OPEN' }] }))
    const betreiberfreigabe = controlTowerCabinet('c4', 'B-001', 'p1', null, 'Projekt', fertigesCabinet({
      approvals: [
        { id: 'internal-1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: new Date('2026-02-02'), stageCode: 'ABNAHME' },
        { id: 'op-1', status: 'REQUESTED', approvalType: 'OPERATOR_ACCEPTANCE', requestedAt: new Date('2026-02-03'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))
    const overview = deriveGgaControlTowerOverview([nachpruefung, ueberfaellig, mangel, betreiberfreigabe], new Set(), )
    expect(overview.dringendeSchraenke.map((c) => c.kennung)).toEqual(['U-001', 'M-001', 'N-001', 'B-001'])
  })

  it('14) ein unauffälliger, vollständig abgeschlossener Schrank erscheint nicht in "Dringende GGA-Schränke"', () => {
    const cabinets = [controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', fertigesCabinet())]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.dringendeSchraenke).toEqual([])
  })

  it('15) Projekt- und Schrankreferenzen für die direkte Navigation sind korrekt', () => {
    const cabinets = [controlTowerCabinet('cabinet-xyz', 'A-001', 'project-abc', 'P-9', 'Beispielprojekt', baseSnapshot({ blockers: [{ id: 'b1', title: 'Mangel', status: 'OPEN' }] }), { standort: 'Halle 3' })]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['project-abc']))
    expect(overview.projekte[0]).toMatchObject({ projectId: 'project-abc', projectNumber: 'P-9', projectName: 'Beispielprojekt' })
    expect(overview.dringendeSchraenke[0]).toMatchObject({ cabinetId: 'cabinet-xyz', projectId: 'project-abc', standort: 'Halle 3' })
  })

  it('20) "abgeschlossen" wird niemals durch die Dashboard-Aggregation selbst erzeugt — ausschließlich item.abgeschlossen (deriveCabinetStatus)', () => {
    // Ein Schrank mit offenem Blocker, aber sonst technisch bestandener interner
    // Prüfung, gilt laut Workflow trotzdem als abgeschlossen (Blocker ändert
    // lifecycleStage nicht, siehe REQ-011/012) — die Aggregation darf das nicht
    // "korrigieren" oder umgekehrt künstlich verhindern.
    const cabinets = [controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt Eins', fertigesCabinet({ blockers: [{ id: 'b1', title: 'Kleinmangel', status: 'OPEN' }] }))]
    const overview = deriveGgaControlTowerOverview(cabinets, new Set(['p1']))
    expect(overview.gesamt.abgeschlossen).toBe(1)
    expect(overview.projekte[0].abgeschlossen).toBe(1)
    expect(overview.gesamt.mitBlocker).toBe(1) // gleichzeitig weiterhin als dringend sichtbar
  })

  // GGA-Portal-Weiterentwicklung: alleSchraenke liefert dieselben, bereits
  // abgeleiteten Einträge wie dringendeSchraenke, aber vollständig (nicht nur
  // die dringenden) — Grundlage für die priorisierte Arbeitsliste auf
  // /collaboration/my-work (GGA-Portal Produktblock 6: nicht mehr im
  // Dashboard dupliziert). Keine neue Berechnung, nur zusätzliche Rückgabe.
  it('21) alleSchraenke enthält jeden Schrank genau einmal, dringende zuerst, sonst alphabetisch nach Kennung', () => {
    const ruhig = controlTowerCabinet('c1', 'Z-001', 'p1', null, 'Projekt', fertigesCabinet())
    const dringend = controlTowerCabinet('c2', 'A-001', 'p1', null, 'Projekt', baseSnapshot({ blockers: [{ id: 'b1', title: 'Mangel', status: 'OPEN' }] }))
    const ruhigAuchAlphabetischVorne = controlTowerCabinet('c3', 'B-001', 'p1', null, 'Projekt', fertigesCabinet())
    const overview = deriveGgaControlTowerOverview([ruhig, dringend, ruhigAuchAlphabetischVorne], new Set(['p1']))
    expect(overview.alleSchraenke).toHaveLength(3)
    expect(overview.alleSchraenke.map((c) => c.kennung)).toEqual(['A-001', 'B-001', 'Z-001']) // dringend (A-001) zuerst, dann alphabetisch
  })

  it('22) alleSchraenke bleibt bei 0 Schränken ein leeres Array statt eines Fehlers', () => {
    const overview = deriveGgaControlTowerOverview([], new Set())
    expect(overview.alleSchraenke).toEqual([])
  })

  // GGA-Portal-Weiterentwicklung: ein Cabinet mit NICHT_BESTANDEN Lüftung/
  // Elektro/VDE, aber sonst völlig unauffällig (kein Blocker, keine
  // Freigabe/Nachprüfung offen), war vor dieser Erweiterung in
  // dringendeSchraenke NICHT sichtbar (ggaCabinetIstDringend kennt keine
  // Prüfnachweise) — jetzt über ggaCabinetHatHandlungsbedarf sichtbar, mit
  // eigenem Grund-Badge je Prüfart.
  it('23) ein Cabinet mit ausschließlich NICHT_BESTANDEN-Prüfnachweis (sonst unauffällig) erscheint jetzt in dringendeSchraenke mit dem passenden Grund', () => {
    const cabinet = controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt', fertigesCabinet(), { nichtBestandenePruefarten: ['VDE'] })
    const overview = deriveGgaControlTowerOverview([cabinet], new Set(['p1']))
    expect(overview.dringendeSchraenke).toHaveLength(1)
    expect(overview.dringendeSchraenke[0].gruende).toContain('VDE_NICHT_BESTANDEN')
  })

  it('24) mehrere nicht bestandene Prüfarten erzeugen je einen eigenen Grund-Badge', () => {
    const cabinet = controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt', fertigesCabinet(), { nichtBestandenePruefarten: ['LUEFTUNG', 'ELEKTRO'] })
    const overview = deriveGgaControlTowerOverview([cabinet], new Set(['p1']))
    expect(overview.dringendeSchraenke[0].gruende).toEqual(expect.arrayContaining(['LUEFTUNG_NICHT_BESTANDEN', 'ELEKTRO_NICHT_BESTANDEN']))
    expect(overview.dringendeSchraenke[0].gruende).not.toContain('VDE_NICHT_BESTANDEN')
  })

  it('25) ein Cabinet ohne NICHT_BESTANDEN-Prüfnachweis und ohne sonstigen Grund bleibt weiterhin unauffällig (keine Rückwärtsänderung)', () => {
    const cabinet = controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt', fertigesCabinet())
    const overview = deriveGgaControlTowerOverview([cabinet], new Set(['p1']))
    expect(overview.dringendeSchraenke).toEqual([])
  })

  it('26) ggaCabinetHatHandlungsbedarf ist true bei NICHT_BESTANDEN-Prüfnachweis, obwohl ggaCabinetIstDringend allein false wäre — die bestehende Funktion selbst bleibt unverändert', () => {
    const cabinet = controlTowerCabinet('c1', 'A-001', 'p1', null, 'Projekt', fertigesCabinet(), { nichtBestandenePruefarten: ['ELEKTRO'] })
    expect(ggaCabinetHatHandlungsbedarf(cabinet)).toBe(true)
  })
})

describe('aktuellerGgaFortschritt (GGA-Portal-Weiterentwicklung): reine Anzeige-Auswahl unter den vier bereits abgeleiteten Fortschrittswerten', () => {
  it('wählt je nach lifecycleStage den passenden bereits abgeleiteten Fortschrittswert', () => {
    expect(aktuellerGgaFortschritt({ lifecycleStage: 'BESTAND', bestandsaufnahmeFortschritt: 40, planungsfortschritt: null, montagefortschritt: null, abnahmeChecklistFortschritt: null })).toBe(40)
    expect(aktuellerGgaFortschritt({ lifecycleStage: 'PLANUNG', bestandsaufnahmeFortschritt: 100, planungsfortschritt: 60, montagefortschritt: null, abnahmeChecklistFortschritt: null })).toBe(60)
    expect(aktuellerGgaFortschritt({ lifecycleStage: 'UMSETZUNG', bestandsaufnahmeFortschritt: 100, planungsfortschritt: 100, montagefortschritt: 30, abnahmeChecklistFortschritt: null })).toBe(30)
    expect(aktuellerGgaFortschritt({ lifecycleStage: 'PRUEFUNG_ABNAHME', bestandsaufnahmeFortschritt: 100, planungsfortschritt: 100, montagefortschritt: 100, abnahmeChecklistFortschritt: 75 })).toBe(75)
    expect(aktuellerGgaFortschritt({ lifecycleStage: 'ABGESCHLOSSEN', bestandsaufnahmeFortschritt: 100, planungsfortschritt: 100, montagefortschritt: 100, abnahmeChecklistFortschritt: 100 })).toBe(100)
  })
})

// GGA-05.1: Stage-Code-Konsistenz. Vor dieser Korrektur pflegten
// cabinet-workflow.ts, collaboration-phase2.service.ts und prisma/seed/seed.ts
// jeweils eigene Stage-Code-Listen — der Seed erzeugte PLANUNG/AUSFUEHRUNG/
// UEBERGABE, während dieses Modul zwingend KONZEPT/PLANUNG/UMSETZUNG/ABNAHME
// erwartet (3 BusinessRuleError-Pfade + 1 stiller progressForStages()→null-
// Pfad, siehe GGA-05/-05.1-Audit). GGA_FIVE_PHASE_PLAN ist jetzt die einzige
// Quelle (hier + prisma/seed/seed.ts importieren beide von hier).
describe('GGA_FIVE_PHASE_PLAN (GGA-05.1): Single Source of Truth', () => {
  it('T1a) collaboration-phase2.service.ts re-exportiert exakt dieselbe Konstante (Referenzidentität, keine zweite Definition)', () => {
    expect(GGA_FIVE_PHASE_PLAN_FROM_SERVICE).toBe(GGA_FIVE_PHASE_PLAN)
  })

  it('T1b) die kanonischen Codes sind exakt und in dieser Reihenfolge: KONZEPT, PLANUNG, UMSETZUNG, ABNAHME, ABSCHLUSS', () => {
    expect(GGA_FIVE_PHASE_PLAN.map((phase) => phase.code)).toEqual([
      GGA_STAGE_KONZEPT, GGA_STAGE_PLANUNG, GGA_STAGE_UMSETZUNG, GGA_STAGE_ABNAHME, GGA_STAGE_ABSCHLUSS,
    ])
    expect(GGA_FIVE_PHASE_PLAN.map((phase) => phase.code)).toEqual(['KONZEPT', 'PLANUNG', 'UMSETZUNG', 'ABNAHME', 'ABSCHLUSS'])
  })

  it('T1c) enthält weder AUSFUEHRUNG noch UEBERGABE (historische, inkompatible Seed-Codes)', () => {
    const codes = GGA_FIVE_PHASE_PLAN.map((phase) => phase.code)
    expect(codes).not.toContain('AUSFUEHRUNG')
    expect(codes).not.toContain('UEBERGABE')
  })

  // T4 — progressForStages(): für jede der vier Cabinet-relevanten Phasen
  // (ABSCHLUSS hat bewusst keinen eigenen Cabinet-Fortschrittswert, siehe
  // GGA-05-Audit — rein organisatorische Projektphase ohne Schrankbezug)
  // muss ein erforderlicher, offener Checklistenpunkt unter genau diesem
  // Code einen NICHT-null-Fortschritt liefern. Ein unbekannter/abweichender
  // Stage-Code würde hier still auf null zurückfallen (kein Fehler, aber
  // ein für immer bei 0% hängender Schrank) — das ist exakt der stille
  // Fehlerpfad, den GGA-05.1 schließt.
  const cabinetRelevantPhases: Array<{ code: string; field: keyof ReturnType<typeof deriveCabinetStatus> }> = [
    { code: GGA_STAGE_KONZEPT, field: 'bestandsaufnahmeFortschritt' },
    { code: GGA_STAGE_PLANUNG, field: 'planungsfortschritt' },
    { code: GGA_STAGE_UMSETZUNG, field: 'montagefortschritt' },
    { code: GGA_STAGE_ABNAHME, field: 'abnahmeChecklistFortschritt' },
  ]

  for (const { code, field } of cabinetRelevantPhases) {
    it(`T4) progressForStages liefert einen gültigen Wert (nicht null) für die kanonische Phase ${code}`, () => {
      const snapshot = baseSnapshot({
        checklistItems: [{ id: 'c1', title: 'Punkt', isRequired: true, completed: false, sequence: 1, stageCode: code }],
      })
      const status = deriveCabinetStatus(snapshot)
      expect(status[field]).not.toBeNull()
      expect(status[field]).toBe(0) // ein offener, erforderlicher Punkt → 0%, nicht null
    })
  }

  it('T4) ein Checklistenpunkt unter einem unbekannten/historischen Stage-Code (z. B. AUSFUEHRUNG) wird von keiner Phase erfasst — dokumentiert den stillen Fehlerpfad, den GGA-05.1 durch den Seed-Fix verhindert', () => {
    const snapshot = baseSnapshot({
      checklistItems: [{ id: 'c1', title: 'Punkt', isRequired: true, completed: false, sequence: 1, stageCode: 'AUSFUEHRUNG' }],
    })
    const status = deriveCabinetStatus(snapshot)
    expect(status.bestandsaufnahmeFortschritt).toBeNull()
    expect(status.planungsfortschritt).toBeNull()
    expect(status.montagefortschritt).toBeNull()
    expect(status.abnahmeChecklistFortschritt).toBeNull()
  })
})

// REQ-015 / GGA-05.2: gemeinsame Readiness-Prüfung für die Freigabe-Kette.
// Beide Prädikate lesen ausschließlich deriveCabinetStatus()-Felder — keine
// eigene Statuslogik, siehe Kommentar in cabinet-workflow.ts. Die vollständige
// Rollenmatrix + Server-Enforcement laufen als Integrationstest gegen eine
// echte DB, siehe tests/integration/gga-cabinet-db.test.ts → "REQ-015".
describe('ggaCabinetBereitFuerInterneFreigabe / ggaCabinetBereitFuerBetreiberfreigabe (REQ-015)', () => {
  it('interne Freigabe: NICHT bereit ohne jeden ABNAHME-Checklistenpunkt (kein Punkt → null → nicht bereit)', () => {
    const status = deriveCabinetStatus(baseSnapshot())
    expect(status.abnahmeChecklistFortschritt).toBeNull()
    expect(ggaCabinetBereitFuerInterneFreigabe(status)).toBe(false)
  })

  it('interne Freigabe: NICHT bereit bei teilweise abgehakter ABNAHME-Checkliste', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      checklistItems: [
        { id: 'c1', title: 'Abluft geprüft', isRequired: true, completed: true, sequence: 1, stageCode: GGA_STAGE_ABNAHME },
        { id: 'c2', title: 'Elektro/VDE geprüft', isRequired: true, completed: false, sequence: 2, stageCode: GGA_STAGE_ABNAHME },
      ],
    }))
    expect(status.abnahmeChecklistFortschritt).toBe(50)
    expect(ggaCabinetBereitFuerInterneFreigabe(status)).toBe(false)
  })

  it('interne Freigabe: bereit, wenn die vollständige ABNAHME-Checkliste abgehakt ist', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      checklistItems: [
        { id: 'c1', title: 'Abluft geprüft', isRequired: true, completed: true, sequence: 1, stageCode: GGA_STAGE_ABNAHME },
        { id: 'c2', title: 'Elektro/VDE geprüft', isRequired: true, completed: true, sequence: 2, stageCode: GGA_STAGE_ABNAHME },
      ],
    }))
    expect(status.abnahmeChecklistFortschritt).toBe(100)
    expect(ggaCabinetBereitFuerInterneFreigabe(status)).toBe(true)
  })

  it('interne Freigabe: nicht-erforderliche (optionale) Punkte zählen nicht mit — bereit auch wenn ein optionaler Punkt offen bleibt', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      checklistItems: [
        { id: 'c1', title: 'Pflicht', isRequired: true, completed: true, sequence: 1, stageCode: GGA_STAGE_ABNAHME },
        { id: 'c2', title: 'Optional', isRequired: false, completed: false, sequence: 2, stageCode: GGA_STAGE_ABNAHME },
      ],
    }))
    expect(ggaCabinetBereitFuerInterneFreigabe(status)).toBe(true)
  })

  it('Betreiberfreigabe: NICHT bereit ohne entschiedene interne ABNAHME-Freigabe (pruefstatus NICHT_GEPLANT)', () => {
    const status = deriveCabinetStatus(baseSnapshot())
    expect(status.pruefstatus).toBe('NICHT_GEPLANT')
    expect(ggaCabinetBereitFuerBetreiberfreigabe(status)).toBe(false)
  })

  it('Betreiberfreigabe: NICHT bereit bei lediglich angeforderter (noch nicht entschiedener) interner Freigabe', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      approvals: [{ id: 'a1', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: null, stageCode: GGA_STAGE_ABNAHME }],
    }))
    expect(status.pruefstatus).toBe('GEPLANT')
    expect(ggaCabinetBereitFuerBetreiberfreigabe(status)).toBe(false)
  })

  it('Betreiberfreigabe: NICHT bereit nach abgelehnter interner Freigabe (BEANSTANDET)', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      approvals: [{ id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-02'), stageCode: GGA_STAGE_ABNAHME }],
    }))
    expect(status.pruefstatus).toBe('BEANSTANDET')
    expect(ggaCabinetBereitFuerBetreiberfreigabe(status)).toBe(false)
  })

  it('Betreiberfreigabe: bereit nach genehmigter, noch gültiger interner ABNAHME-Freigabe (pruefstatus BESTANDEN)', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      approvals: [{ id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-02'), stageCode: GGA_STAGE_ABNAHME }],
    }))
    expect(status.pruefstatus).toBe('BESTANDEN')
    expect(ggaCabinetBereitFuerBetreiberfreigabe(status)).toBe(true)
  })

  it('Betreiberfreigabe: NICHT bereit, wenn die genehmigte interne Prüfung inzwischen wieder überfällig ist (UEBERFAELLIG)', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      pruefintervallMonate: 1,
      letztePruefungAm: new Date('2026-01-01'),
      approvals: [{ id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-01'), stageCode: GGA_STAGE_ABNAHME }],
    }), new Date('2026-06-01'))
    expect(status.pruefstatus).toBe('UEBERFAELLIG')
    expect(ggaCabinetBereitFuerBetreiberfreigabe(status)).toBe(false)
  })

  it('eine vollständige ABNAHME-Checkliste allein macht NICHT automatisch auch für die Betreiberfreigabe bereit — die beiden Schwellen sind fachlich unterschiedlich (Invariante 5)', () => {
    const status = deriveCabinetStatus(baseSnapshot({
      checklistItems: [{ id: 'c1', title: 'Abluft geprüft', isRequired: true, completed: true, sequence: 1, stageCode: GGA_STAGE_ABNAHME }],
    }))
    expect(ggaCabinetBereitFuerInterneFreigabe(status)).toBe(true)
    expect(ggaCabinetBereitFuerBetreiberfreigabe(status)).toBe(false)
  })
})

// REQ-015.4: isCabinetReadyForStage() ist ein reiner Adapter auf bereits
// vorhandene DerivedGgaCabinetStatus-Felder (keine neue Statuslogik) —
// siehe cabinet-workflow.ts. Membership (welche Cabinets zählen) wird hier
// bewusst NICHT getestet (das ist Aufgabe von collaboration-phase2.service.ts
// über GgaCabinet.projectId, siehe die REQ-015.4-DB-Tests) — nur die reine
// Fortschritts-zu-Bereitschaft-Abbildung je Stage-Code.
describe('isCabinetReadyForStage (REQ-015.4)', () => {
  it('KONZEPT: bereit erst nach abgeschlossener Bestandsaufnahme', () => {
    const offen = deriveCabinetStatus(baseSnapshot({}))
    expect(isCabinetReadyForStage(offen, GGA_STAGE_KONZEPT)).toBe(false)
    const fertig = deriveCabinetStatus(baseSnapshot({ bestandsaufnahmeAm: new Date('2026-01-01') }))
    expect(isCabinetReadyForStage(fertig, GGA_STAGE_KONZEPT)).toBe(true)
  })

  it('PLANUNG: bereit erst bei 100% Fortschritt der Pflichtpunkte', () => {
    const offen = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      checklistItems: [{ id: 'p1', title: 'Soll-Abluft definiert', isRequired: true, completed: false, sequence: 1, stageCode: GGA_STAGE_PLANUNG }],
    }))
    expect(isCabinetReadyForStage(offen, GGA_STAGE_PLANUNG)).toBe(false)
    const fertig = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      checklistItems: [{ id: 'p1', title: 'Soll-Abluft definiert', isRequired: true, completed: true, sequence: 1, stageCode: GGA_STAGE_PLANUNG }],
    }))
    expect(isCabinetReadyForStage(fertig, GGA_STAGE_PLANUNG)).toBe(true)
  })

  it('UMSETZUNG: bereit erst bei 100% Montagefortschritt', () => {
    const offen = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [{ id: 't1', title: 'Montage', isRequired: true, status: 'TODO', sequence: 1, stageCode: GGA_STAGE_UMSETZUNG }],
    }))
    expect(isCabinetReadyForStage(offen, GGA_STAGE_UMSETZUNG)).toBe(false)
    const fertig = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [{ id: 't1', title: 'Montage', isRequired: true, status: 'DONE', sequence: 1, stageCode: GGA_STAGE_UMSETZUNG }],
    }))
    expect(isCabinetReadyForStage(fertig, GGA_STAGE_UMSETZUNG)).toBe(true)
  })

  it('ABNAHME: bereit erst bei pruefstatus BESTANDEN (technisch geprüft UND intern APPROVED) — reine Checklisten-Vollständigkeit reicht NICHT (Invariante 5)', () => {
    const nurChecklisteFertig = deriveCabinetStatus(baseSnapshot({
      checklistItems: [{ id: 'c1', title: 'Abluft geprüft', isRequired: true, completed: true, sequence: 1, stageCode: GGA_STAGE_ABNAHME }],
    }))
    expect(isCabinetReadyForStage(nurChecklisteFertig, GGA_STAGE_ABNAHME)).toBe(false)
    const approved = deriveCabinetStatus(baseSnapshot({
      checklistItems: [{ id: 'c1', title: 'Abluft geprüft', isRequired: true, completed: true, sequence: 1, stageCode: GGA_STAGE_ABNAHME }],
      approvals: [{ id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-02'), stageCode: GGA_STAGE_ABNAHME }],
    }))
    expect(isCabinetReadyForStage(approved, GGA_STAGE_ABNAHME)).toBe(true)
  })

  it('ABNAHME: REQUESTED oder REJECTED zählen nicht als bereit', () => {
    const requested = deriveCabinetStatus(baseSnapshot({
      approvals: [{ id: 'a1', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: null, stageCode: GGA_STAGE_ABNAHME }],
    }))
    expect(isCabinetReadyForStage(requested, GGA_STAGE_ABNAHME)).toBe(false)
    const rejected = deriveCabinetStatus(baseSnapshot({
      approvals: [{ id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-02'), stageCode: GGA_STAGE_ABNAHME }],
    }))
    expect(isCabinetReadyForStage(rejected, GGA_STAGE_ABNAHME)).toBe(false)
  })

  it('ABSCHLUSS: bereit nur, wenn das Cabinet insgesamt als abgeschlossen abgeleitet ist', () => {
    const nurAbnahmeApproved = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      approvals: [{ id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-02'), stageCode: GGA_STAGE_ABNAHME }],
    }))
    // Planung/Umsetzung haben keine Pflichtpunkte -> Fortschritt null ->
    // lifecycleStage bleibt auf PLANUNG stehen, ABSCHLUSS also NICHT bereit.
    expect(isCabinetReadyForStage(nurAbnahmeApproved, GGA_STAGE_ABSCHLUSS)).toBe(false)

    const vollstaendig = deriveCabinetStatus(baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 'p1', title: 'Planung fertig', isRequired: true, status: 'DONE', sequence: 1, stageCode: GGA_STAGE_PLANUNG },
        { id: 't1', title: 'Montage fertig', isRequired: true, status: 'DONE', sequence: 1, stageCode: GGA_STAGE_UMSETZUNG },
      ],
      approvals: [{ id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-02'), stageCode: GGA_STAGE_ABNAHME }],
    }))
    expect(vollstaendig.abgeschlossen).toBe(true)
    expect(isCabinetReadyForStage(vollstaendig, GGA_STAGE_ABSCHLUSS)).toBe(true)
  })

  it('unbekannter/Nicht-GGA-Stage-Code blockiert nie (default true)', () => {
    const offen = deriveCabinetStatus(baseSnapshot({}))
    expect(isCabinetReadyForStage(offen, 'IRGENDEINE_STAGE')).toBe(true)
  })
})

// REQ-018/REQ-018.1: strukturierte Prüfnachweise Lüftung/Elektro/VDE.
// deriveCurrentPruefnachweis()/isGgaPruefartBestanden() sind reine
// Funktionen (kein DB-Zugriff) — die Membership-/Zugriffs-Logik lebt im
// Service-Layer (siehe tests/integration/gga-cabinet-pruefnachweise-db.test.ts).
describe('Prüfnachweise (REQ-018/REQ-018.1)', () => {
  function pn(overrides: Partial<GgaCabinetPruefnachweisSnapshot> = {}): GgaCabinetPruefnachweisSnapshot {
    return {
      id: 'p1', pruefart: 'LUEFTUNG', ergebnis: 'OFFEN', pruefdatum: null,
      ausfuehrendeStelle: null, bemerkung: null, documentId: null, createdAt: new Date('2026-01-01'),
      ...overrides,
    }
  }

  it('T18: fehlender Prüfnachweis (keine Datensätze) gilt als OFFEN/nicht bestanden', () => {
    expect(deriveCurrentPruefnachweis([], 'ELEKTRO')).toBeNull()
    expect(isGgaPruefartBestanden([], 'ELEKTRO')).toBe(false)
  })

  it('AC4: OFFEN gilt nicht als bestanden', () => {
    const records = [pn({ id: 'a', pruefart: 'ELEKTRO', ergebnis: 'OFFEN' })]
    expect(isGgaPruefartBestanden(records, 'ELEKTRO')).toBe(false)
  })

  it('AC5: NICHT_BESTANDEN gilt nicht als bestanden', () => {
    const records = [pn({ id: 'a', pruefart: 'VDE', ergebnis: 'NICHT_BESTANDEN' })]
    expect(isGgaPruefartBestanden(records, 'VDE')).toBe(false)
  })

  it('AC1: Lüftung/Elektro/VDE bleiben unabhängig voneinander — ein BESTANDEN bei einer Prüfart beeinflusst die anderen nicht', () => {
    const records = [
      pn({ id: 'a', pruefart: 'LUEFTUNG', ergebnis: 'BESTANDEN' }),
      pn({ id: 'b', pruefart: 'ELEKTRO', ergebnis: 'OFFEN' }),
      pn({ id: 'c', pruefart: 'VDE', ergebnis: 'NICHT_BESTANDEN' }),
    ]
    expect(isGgaPruefartBestanden(records, 'LUEFTUNG')).toBe(true)
    expect(isGgaPruefartBestanden(records, 'ELEKTRO')).toBe(false)
    expect(isGgaPruefartBestanden(records, 'VDE')).toBe(false)
  })

  it('T20/T21: Wiederholungsprüfung — die zeitlich neueste Zeile (pruefdatum, sonst createdAt) bestimmt den aktuellen Stand, Historie bleibt erhalten', () => {
    const records = [
      pn({ id: 'alt', pruefart: 'ELEKTRO', ergebnis: 'NICHT_BESTANDEN', pruefdatum: new Date('2026-01-01'), createdAt: new Date('2026-01-01') }),
      pn({ id: 'neu', pruefart: 'ELEKTRO', ergebnis: 'BESTANDEN', pruefdatum: new Date('2026-03-01'), createdAt: new Date('2026-03-01') }),
    ]
    const current = deriveCurrentPruefnachweis(records, 'ELEKTRO')
    expect(current?.id).toBe('neu')
    expect(current?.ergebnis).toBe('BESTANDEN')
    expect(isGgaPruefartBestanden(records, 'ELEKTRO')).toBe(true)
    // Historie bleibt vollständig erhalten (keine Zeile wird durch die
    // Ableitung entfernt oder überschrieben).
    expect(records).toHaveLength(2)
    expect(records.some((r) => r.id === 'alt' && r.ergebnis === 'NICHT_BESTANDEN')).toBe(true)
  })

  it('deriveCurrentPruefnachweis: ohne pruefdatum entscheidet createdAt als Fallback', () => {
    const records = [
      pn({ id: 'a', pruefart: 'VDE', ergebnis: 'NICHT_BESTANDEN', pruefdatum: null, createdAt: new Date('2026-01-01') }),
      pn({ id: 'b', pruefart: 'VDE', ergebnis: 'BESTANDEN', pruefdatum: null, createdAt: new Date('2026-02-01') }),
    ]
    expect(deriveCurrentPruefnachweis(records, 'VDE')?.id).toBe('b')
  })
})

describe('deriveGgaProjectPresentationStatus (GGA-Portal Produktblock 1): Rangfolge KRITISCH > HANDLUNGSBEDARF > ACHTUNG > IM_PLAN, ABGESCHLOSSEN nur bei echtem Projektabschluss', () => {
  it('liefert ABGESCHLOSSEN, sobald das Projekt fachlich abgeschlossen ist — unabhängig von healthStatus/dringenden Schränken', () => {
    expect(deriveGgaProjectPresentationStatus({ abgeschlossen: true, healthStatus: 'RED', dringendeSchraenkeAnzahl: 3 })).toBe('ABGESCHLOSSEN')
  })

  it('liefert KRITISCH bei healthStatus RED, auch ohne einen einzigen dringenden GGA-Schrank (rein projektweiter Blocker)', () => {
    expect(deriveGgaProjectPresentationStatus({ abgeschlossen: false, healthStatus: 'RED', dringendeSchraenkeAnzahl: 0 })).toBe('KRITISCH')
  })

  it('KRITISCH schlägt HANDLUNGSBEDARF: RED + dringende Schränke bleibt KRITISCH, nicht HANDLUNGSBEDARF', () => {
    expect(deriveGgaProjectPresentationStatus({ abgeschlossen: false, healthStatus: 'RED', dringendeSchraenkeAnzahl: 2 })).toBe('KRITISCH')
  })

  it('liefert HANDLUNGSBEDARF, wenn healthStatus nicht RED ist, aber mindestens ein GGA-Schrank Handlungsbedarf hat', () => {
    expect(deriveGgaProjectPresentationStatus({ abgeschlossen: false, healthStatus: 'GREEN', dringendeSchraenkeAnzahl: 1 })).toBe('HANDLUNGSBEDARF')
    expect(deriveGgaProjectPresentationStatus({ abgeschlossen: false, healthStatus: 'YELLOW', dringendeSchraenkeAnzahl: 1 })).toBe('HANDLUNGSBEDARF')
  })

  it('liefert ACHTUNG bei healthStatus YELLOW ohne dringende Schränke', () => {
    expect(deriveGgaProjectPresentationStatus({ abgeschlossen: false, healthStatus: 'YELLOW', dringendeSchraenkeAnzahl: 0 })).toBe('ACHTUNG')
  })

  it('liefert IM_PLAN, wenn weder healthStatus RED/YELLOW noch ein dringender Schrank vorliegt', () => {
    expect(deriveGgaProjectPresentationStatus({ abgeschlossen: false, healthStatus: 'GREEN', dringendeSchraenkeAnzahl: 0 })).toBe('IM_PLAN')
  })

  it('leitet ABGESCHLOSSEN nicht allein aus 100% Fortschritt ab — die Funktion kennt progressPercent gar nicht, nur das übergebene abgeschlossen-Flag', () => {
    // Realistischer Fall: Projekt technisch/inhaltlich fertig (100% Fortschritt
    // wäre denkbar), aber Betreiberfreigabe steht noch aus → healthStatus RED
    // oder ein dringender Schrank, project.status ist NICHT 'COMPLETED'.
    expect(deriveGgaProjectPresentationStatus({ abgeschlossen: false, healthStatus: 'RED', dringendeSchraenkeAnzahl: 1 })).not.toBe('ABGESCHLOSSEN')
  })
})

describe('deriveGgaCabinetPresentationStatus (GGA-Portal Produktblock 2): dieselbe Rangfolge wie bei Projekten, jetzt je Schrank — reine Kombination bereits vorhandener Ableitungen (ggaControlTowerReasons/betriebsstatus/abgeschlossen)', () => {
  it('KRITISCH bei offenem Blocker (MANGEL), auch ohne jedes andere Signal', () => {
    const cabinet = controlTowerCabinet('c1', 'K-01', 'p1', 'P-1', 'Projekt 1', baseSnapshot({
      blockers: [{ id: 'b1', title: 'Kabelschaden', status: 'OPEN' }],
    }))
    expect(deriveGgaCabinetPresentationStatus(cabinet)).toBe('KRITISCH')
  })

  it('KRITISCH bei nicht bestandener Prüfart (Lüftung/Elektro/VDE)', () => {
    const cabinet = controlTowerCabinet('c2', 'K-02', 'p1', 'P-1', 'Projekt 1', baseSnapshot(), { nichtBestandenePruefarten: ['VDE'] })
    expect(deriveGgaCabinetPresentationStatus(cabinet)).toBe('KRITISCH')
  })

  it('KRITISCH bei nachträglich erfasstem Blocker, SELBST WENN der Schrank lifecycleStage-technisch bereits abgeschlossen ist (offeneBlocker fließt nicht in lifecycleStage ein)', () => {
    const cabinet = controlTowerCabinet('c3', 'K-03', 'p1', 'P-1', 'Projekt 1', fertigesCabinet({
      blockers: [{ id: 'b1', title: 'Nachträglich gemeldeter Mangel', status: 'OPEN' }],
    }))
    expect(cabinet.abgeschlossen).toBe(true)
    expect(cabinet.offeneBlocker).toBe(1)
    expect(deriveGgaCabinetPresentationStatus(cabinet)).toBe('KRITISCH')
  })

  it('eine erneut überfällige Wiederholungsprüfung kippt bereits derivePruefstatus()/lifecycleStage selbst von ABGESCHLOSSEN zurück auf PRUEFUNG_ABNAHME — hier greift der normale ÜBERFÄLLIG-Fall, abgeschlossen ist dabei nie true', () => {
    const now = new Date('2027-06-01')
    const cabinet = controlTowerCabinet('c3b', 'K-03B', 'p1', 'P-1', 'Projekt 1', fertigesCabinet({
      pruefintervallMonate: 12,
      letztePruefungAm: new Date('2026-01-01'),
    }), { now })
    expect(cabinet.abgeschlossen).toBe(false)
    expect(cabinet.betriebsstatus).toBe('UEBERFAELLIG')
    expect(deriveGgaCabinetPresentationStatus(cabinet)).toBe('KRITISCH')
  })

  it('HANDLUNGSBEDARF bei Nachprüfung erforderlich, ohne dass zusätzlich ein Kritisch-Grund vorliegt', () => {
    const cabinet = controlTowerCabinet('c4', 'K-04', 'p1', 'P-1', 'Projekt 1', baseSnapshot({
      approvals: [
        { id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-05'), stageCode: 'ABNAHME' },
        { id: 'a2', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: null, stageCode: 'ABNAHME' },
      ],
    }))
    expect(cabinet.betriebsstatus).toBe('NACHPRUEFUNG_ERFORDERLICH')
    expect(deriveGgaCabinetPresentationStatus(cabinet)).toBe('HANDLUNGSBEDARF')
  })

  it('HANDLUNGSBEDARF bei offener interner Freigabe (abnahmeChecklist fertig, Prüfung noch nicht entschieden)', () => {
    const cabinet = controlTowerCabinet('c5', 'K-05', 'p1', 'P-1', 'Projekt 1', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
        { id: 't3', title: 'Abnahme-Checkliste', status: 'DONE', isRequired: true, sequence: 3, stageCode: 'ABNAHME' },
      ],
    }))
    expect(cabinet.freigabeOffen).toBe(true)
    expect(deriveGgaCabinetPresentationStatus(cabinet)).toBe('HANDLUNGSBEDARF')
  })

  it('ACHTUNG, wenn die Prüfung bald (innerhalb 30 Tagen) fällig wird, aber noch kein Handlungsbedarf-Grund vorliegt', () => {
    const letztePruefungAm = new Date('2026-01-01')
    const faelligAm = new Date('2027-01-01')
    const now = new Date(faelligAm.getTime() - 20 * 24 * 60 * 60 * 1000)
    const cabinet = controlTowerCabinet('c6', 'K-06', 'p1', 'P-1', 'Projekt 1', fertigesCabinet({ pruefintervallMonate: 12, letztePruefungAm }), { now })
    expect(cabinet.betriebsstatus).toBe('BALD_FAELLIG')
    expect(deriveGgaCabinetPresentationStatus(cabinet)).toBe('ACHTUNG')
  })

  it('ABGESCHLOSSEN nur, wenn wirklich lifecycleStage ABGESCHLOSSEN ist UND kein Kritisch-/Handlungsbedarf-/Achtung-Grund vorliegt', () => {
    const cabinet = controlTowerCabinet('c7', 'K-07', 'p1', 'P-1', 'Projekt 1', fertigesCabinet())
    expect(cabinet.abgeschlossen).toBe(true)
    expect(deriveGgaCabinetPresentationStatus(cabinet)).toBe('ABGESCHLOSSEN')
  })

  it('IM_PLAN für einen normal laufenden Schrank ohne jedes Signal (z. B. noch in Planung, keine Prüfung fällig)', () => {
    const cabinet = controlTowerCabinet('c8', 'K-08', 'p1', 'P-1', 'Projekt 1', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
    }))
    expect(deriveGgaCabinetPresentationStatus(cabinet)).toBe('IM_PLAN')
  })
})

describe('istGgaPruefpfad / direkteGgaHandlungsbedarfAktion / direkteGgaCabinetAktion (GGA-Portal Produktblock 2): welche Gründe auf die Prüfungs-/Abnahmeseite führen, welche auf die Schrankseite', () => {
  it('UEBERFAELLIG, NACHPRUEFUNG, INTERNE_FREIGABE, INTERNE_BEANSTANDUNG, BETREIBERFREIGABE, BETREIBERBEANSTANDUNG und die drei Prüfart-Badges führen zur Prüfungsseite', () => {
    for (const grund of ['UEBERFAELLIG', 'NACHPRUEFUNG', 'INTERNE_FREIGABE', 'INTERNE_BEANSTANDUNG', 'BETREIBERFREIGABE', 'BETREIBERBEANSTANDUNG', 'LUEFTUNG_NICHT_BESTANDEN', 'ELEKTRO_NICHT_BESTANDEN', 'VDE_NICHT_BESTANDEN'] as const) {
      expect(istGgaPruefpfad([grund])).toBe(true)
    }
  })

  it('MANGEL führt NICHT zur Prüfungsseite — Blocker werden auf der Schrankseite selbst gelöst', () => {
    expect(istGgaPruefpfad(['MANGEL'])).toBe(false)
  })

  it('direkteGgaHandlungsbedarfAktion() verlinkt entsprechend auf /pruefung bzw. die Schrankseite', () => {
    expect(direkteGgaHandlungsbedarfAktion('cab-1', ['VDE_NICHT_BESTANDEN'])).toEqual({ href: '/collaboration/cabinets/cab-1/pruefung', label: 'Prüfung öffnen' })
    expect(direkteGgaHandlungsbedarfAktion('cab-1', ['MANGEL'])).toEqual({ href: '/collaboration/cabinets/cab-1', label: 'Schrank öffnen' })
  })

  it('direkteGgaCabinetAktion() leitet dieselben Gründe wie die Handlungsbedarf-Badges ab (ggaControlTowerReasons) und trifft dieselbe Wahl', () => {
    const kritisch = controlTowerCabinet('c1', 'K-01', 'p1', 'P-1', 'Projekt 1', baseSnapshot({ blockers: [{ id: 'b1', title: 'X', status: 'OPEN' }] }))
    expect(direkteGgaCabinetAktion(kritisch)).toEqual({ href: '/collaboration/cabinets/c1', label: 'Öffnen' })

    const freigabeOffen = controlTowerCabinet('c2', 'K-02', 'p1', 'P-1', 'Projekt 1', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      tasks: [
        { id: 't1', title: 'Planung fertig', status: 'DONE', isRequired: true, sequence: 1, stageCode: 'PLANUNG' },
        { id: 't2', title: 'Montage fertig', status: 'DONE', isRequired: true, sequence: 2, stageCode: 'UMSETZUNG' },
        { id: 't3', title: 'Abnahme-Checkliste', status: 'DONE', isRequired: true, sequence: 3, stageCode: 'ABNAHME' },
      ],
    }))
    expect(direkteGgaCabinetAktion(freigabeOffen)).toEqual({ href: '/collaboration/cabinets/c2/pruefung', label: 'Prüfung' })
  })

  it('Produktblock 3 Abschnitt 11: routet auch dann zur Prüfungsseite, wenn naechsteAktion bereits eindeutig "Prüfung planen"/"Prüfung durchführen" ist, obwohl lifecycleStage noch nicht PRUEFUNG_ABNAHME erreicht hat (Fund aus Produktblock 2, z. B. QA-TEST-018.1-001)', () => {
    // Bestandsaufnahme abgeschlossen, keine offene Pflichtaufgabe/Checkliste,
    // kein Blocker, aber bereits eine angeforderte (GEPLANT) interne Prüfung
    // — lifecycleStage bleibt PLANUNG (planungsfortschritt < 100, da keine
    // Pflichtaufgaben definiert sind → null, nicht "fertig"). Kein Gründe-
    // Badge greift, trotzdem ist "Prüfung durchführen" der eindeutige nächste
    // Schritt.
    const cabinet = controlTowerCabinet('c9', 'K-09', 'p1', 'P-1', 'Projekt 1', baseSnapshot({
      bestandsaufnahmeAm: new Date('2026-01-01'),
      approvals: [{ id: 'a1', status: 'REQUESTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-02-01'), decidedAt: null, stageCode: 'ABNAHME' }],
    }))
    expect(cabinet.naechsteAktion).toBe('Prüfung durchführen')
    expect(cabinet.lifecycleStage).not.toBe('PRUEFUNG_ABNAHME')
    expect(ggaControlTowerReasons(cabinet)).toEqual([])
    expect(direkteGgaCabinetAktion(cabinet)).toEqual({ href: '/collaboration/cabinets/c9/pruefung', label: 'Prüfung' })
  })

  it('Produktblock 3 Abschnitt 11: bleibt bei "Öffnen", solange noch eine offene Bestandsaufnahme/Aufgabe/Checkliste den nächsten Schritt bestimmt (keine vorzeitige Umgehung)', () => {
    const nochNichtAufgenommen = controlTowerCabinet('c10', 'K-10', 'p1', 'P-1', 'Projekt 1', baseSnapshot())
    expect(nochNichtAufgenommen.naechsteAktion).toBe('Bestandsaufnahme durchführen')
    expect(direkteGgaCabinetAktion(nochNichtAufgenommen)).toEqual({ href: '/collaboration/cabinets/c10', label: 'Öffnen' })
  })
})

describe('naechsterSchrittFuerCabinet (GGA-Portal Produktblock 2): geteilte Ableitung, wiederverwendet von Dashboard und Projektarbeitsplatz', () => {
  it('nennt bei nicht bestandener Prüfart den konkreten nächsten Schritt statt der generischen naechsteAktion-Fallback-Meldung', () => {
    expect(naechsterSchrittFuerCabinet({ naechsteAktion: 'Maßnahmen abgeschlossen', nichtBestandenePruefarten: ['ELEKTRO'] })).toBe('Elektroprüfung durchführen')
    expect(naechsterSchrittFuerCabinet({ naechsteAktion: 'Maßnahmen abgeschlossen', nichtBestandenePruefarten: ['LUEFTUNG', 'VDE'] })).toBe('Lüftungsprüfung durchführen · VDE-Prüfung durchführen')
  })

  it('fällt ohne nicht bestandene Prüfart auf die bereits vorhandene naechsteAktion zurück', () => {
    expect(naechsterSchrittFuerCabinet({ naechsteAktion: 'Interne Freigabe anfordern', nichtBestandenePruefarten: [] })).toBe('Interne Freigabe anfordern')
  })
})

describe('direktAktionFuerWorklistTyp (GGA-Portal Produktblock 3/4): geteilte Aktionswahl, jetzt auch von "Meine Arbeit" verwendet — immer vollständige Pfade, nicht nur Anker', () => {
  it('MASSNAHME und MANGEL führen auf den jeweiligen Anker der Schrankseite (vollständiger Pfad)', () => {
    expect(direktAktionFuerWorklistTyp('MASSNAHME', 'cab-1', true)).toEqual({ href: '/collaboration/cabinets/cab-1#massnahmen', label: 'Maßnahme öffnen' })
    expect(direktAktionFuerWorklistTyp('MANGEL', 'cab-1', true)).toEqual({ href: '/collaboration/cabinets/cab-1#blocker', label: 'Blocker öffnen' })
  })

  it('NAECHSTE_AKTION führt je nach Bestandsaufnahmestatus auf die Bestandsaufnahme- oder die Prüfseite', () => {
    expect(direktAktionFuerWorklistTyp('NAECHSTE_AKTION', 'cab-1', false)).toEqual({ href: '/collaboration/cabinets/cab-1/bestandsaufnahme', label: 'Bestandsaufnahme öffnen' })
    expect(direktAktionFuerWorklistTyp('NAECHSTE_AKTION', 'cab-1', true)).toEqual({ href: '/collaboration/cabinets/cab-1/pruefung', label: 'Prüfung öffnen' })
  })

  it('alle sicherheitsrelevanten Typen (Beanstandung/Überfällig/Nachprüfung/Freigaben) führen auf die Prüfseite', () => {
    for (const type of ['BEANSTANDUNG', 'PRUEFUNG_UEBERFAELLIG', 'NACHPRUEFUNG', 'INTERNE_FREIGABE', 'BETREIBERFREIGABE'] as const) {
      expect(direktAktionFuerWorklistTyp(type, 'cab-1', true)).toEqual({ href: '/collaboration/cabinets/cab-1/pruefung', label: 'Prüfung öffnen' })
    }
  })
})

describe('deriveGgaProjectWorklist: verantwortlichUserId (GGA-Portal Produktblock 4)', () => {
  it('reicht verantwortlichUserId für Maßnahmen und Mängel durch, ohne den bestehenden Anzeigenamen zu verändern', () => {
    const cabinet = worklistCabinet('c1', 'K-001', baseSnapshot(), {
      openRequiredTasks: [{ id: 't1', title: 'Elektro prüfen', dueDate: null, verantwortlich: 'Anna Muster', verantwortlichUserId: 'user-anna' }],
      openBlockers: [{ id: 'b1', title: 'Kabelschaden', verantwortlich: 'Ben Beispiel', verantwortlichUserId: 'user-ben' }],
    })
    const entries = deriveGgaProjectWorklist([cabinet])
    const massnahme = entries.find((e) => e.type === 'MASSNAHME')
    const mangel = entries.find((e) => e.type === 'MANGEL')
    expect(massnahme?.verantwortlich).toBe('Anna Muster')
    expect(massnahme?.verantwortlichUserId).toBe('user-anna')
    expect(mangel?.verantwortlich).toBe('Ben Beispiel')
    expect(mangel?.verantwortlichUserId).toBe('user-ben')
  })

  it('lässt verantwortlichUserId bei allen anderen Eintragstypen bewusst null (kein zuverlässiger Einzel-Verantwortlicher im Datenmodell — CollaborationApproval/GgaCabinetPruefnachweis haben kein responsibleMembershipId)', () => {
    const cabinet = worklistCabinet('c1', 'K-001', baseSnapshot({
      approvals: [{ id: 'a1', status: 'REJECTED', approvalType: 'INTERNAL', requestedAt: new Date('2026-01-01'), decidedAt: new Date('2026-01-02'), stageCode: 'ABNAHME' }],
    }))
    const entries = deriveGgaProjectWorklist([cabinet])
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.verantwortlichUserId === null)).toBe(true)
  })

  it('ohne verantwortlichUserId im Input bleibt der Eintrag null (rückwärtskompatibel zu bestehenden Aufrufern ohne diese Angabe)', () => {
    const cabinet = worklistCabinet('c1', 'K-001', baseSnapshot(), {
      openRequiredTasks: [{ id: 't1', title: 'Alte Aufgabe ohne userId', dueDate: null, verantwortlich: 'Anna Muster' }],
    })
    const entries = deriveGgaProjectWorklist([cabinet])
    expect(entries[0]?.verantwortlichUserId).toBeNull()
  })
})

// GGA-Portal Produktblock 7: "Meine Arbeit" — vollständige persönliche
// Arbeitswarteschlange. Schließt die bekannte Scope-Lücke aus Produktblock 4
// (Tasks/Blocker ohne cabinetId wurden komplett aus der Liste gefiltert).
describe('deriveGgaProjektPhasenWorklist (GGA-Portal Produktblock 7 Abschnitt 2-8, 12-13): Projekt-/Phasen-Arbeit ohne Schrankbezug', () => {
  function projektTask(overrides: Partial<GgaProjektPhasenTaskInput> = {}): GgaProjektPhasenTaskInput {
    return {
      id: 't1', title: 'Aufnahme', status: 'IN_PROGRESS', isRequired: true, dueDate: null, cabinetId: null,
      stage: { title: 'Konzept' }, project: { id: 'p1', projectNumber: 'GGA-0001', name: 'GGA Lagerplanung' },
      responsibleMembership: null,
      ...overrides,
    }
  }
  function projektBlocker(overrides: Partial<GgaProjektPhasenBlockerInput> = {}): GgaProjektPhasenBlockerInput {
    return {
      id: 'b1', title: 'GVS Massname', status: 'OPEN', cabinetId: null,
      stage: { title: 'Konzept' }, project: { id: 'p1', projectNumber: 'GGA-0001', name: 'GGA Lagerplanung' },
      responsibleMembership: null,
      ...overrides,
    }
  }

  it('T3: Projekt-Task mit echter responsibleMembershipId (cabinetId null) erscheint mit zustaendigkeit MEINE', () => {
    const entries = deriveGgaProjektPhasenWorklist([projektTask({ responsibleMembership: { userId: 'user-1' } })], [], 'user-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('PROJEKT_MASSNAHME')
    expect(entries[0].zustaendigkeit).toBe('MEINE')
  })

  it('T4: Projekt-Blocker mit echter responsibleMembershipId (cabinetId null) erscheint mit zustaendigkeit MEINE', () => {
    const entries = deriveGgaProjektPhasenWorklist([], [projektBlocker({ responsibleMembership: { userId: 'user-1' } })], 'user-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('PROJEKT_MANGEL')
    expect(entries[0].zustaendigkeit).toBe('MEINE')
    expect(entries[0].praesentationsStatus).toBe('KRITISCH')
  })

  it('T5: Phasen-Task übernimmt den echten Stage-Titel (keine erfundene Phase)', () => {
    const entries = deriveGgaProjektPhasenWorklist([projektTask({ stage: { title: 'Planung' }, responsibleMembership: { userId: 'user-1' } })], [], 'user-1')
    expect(entries[0].stageTitle).toBe('Planung')
  })

  it('T6: Phasen-Blocker übernimmt den echten Stage-Titel; ein Blocker ganz ohne Stage (rein projektweit) zeigt stageTitle null statt einer erfundenen Phase', () => {
    const mitStage = deriveGgaProjektPhasenWorklist([], [projektBlocker({ stage: { title: 'Umsetzung' }, responsibleMembership: { userId: 'user-1' } })], 'user-1')
    expect(mitStage[0].stageTitle).toBe('Umsetzung')
    const ohneStage = deriveGgaProjektPhasenWorklist([], [projektBlocker({ stage: null })], 'user-1')
    expect(ohneStage[0].stageTitle).toBeNull()
  })

  it('T7: fremd zugewiesener Task (responsibleMembership eines anderen Users) erscheint als TEAM, nicht MEINE', () => {
    const entries = deriveGgaProjektPhasenWorklist([projektTask({ responsibleMembership: { userId: 'other-user' } })], [], 'user-1')
    expect(entries[0].zustaendigkeit).toBe('TEAM')
  })

  it('T8: Task ohne responsibleMembershipId erscheint als TEAM — keine erfundene Zuweisung über Projektmitgliedschaft/Stage/sonstige Proxys', () => {
    const entries = deriveGgaProjektPhasenWorklist([projektTask({ responsibleMembership: null })], [], 'user-1')
    expect(entries[0].zustaendigkeit).toBe('TEAM')
  })

  it('T11: erledigte (DONE) oder übersprungene (SKIPPED) Projekt-/Phasen-Aufgaben werden nicht aufgenommen', () => {
    expect(deriveGgaProjektPhasenWorklist([projektTask({ status: 'DONE' })], [], 'user-1')).toHaveLength(0)
    expect(deriveGgaProjektPhasenWorklist([projektTask({ status: 'SKIPPED' })], [], 'user-1')).toHaveLength(0)
  })

  it('T12: gelöste/abgelehnte Blocker (Status ≠ OPEN) werden nicht aufgenommen', () => {
    expect(deriveGgaProjektPhasenWorklist([], [projektBlocker({ status: 'RESOLVED' })], 'user-1')).toHaveLength(0)
  })

  it('optionale (nicht erforderliche) Projekt-/Phasen-Aufgabe wird nicht aufgenommen — identische Regel wie bei Schrank-Maßnahmen (isRequired)', () => {
    expect(deriveGgaProjektPhasenWorklist([projektTask({ isRequired: false })], [], 'user-1')).toHaveLength(0)
  })

  it('T13/Abschnitt 4: eine Task MIT cabinetId wird von dieser Funktion ignoriert (gehört zur bestehenden Schrank-Worklist) — strukturell disjunkte Partitionierung statt titelbasierter Deduplizierung, auch bei identischem Titel', () => {
    const cabinetTask = projektTask({ id: 'shared-id', cabinetId: 'cab-1', title: 'Gleicher Titel', responsibleMembership: { userId: 'user-1' } })
    const projektNurTask = projektTask({ id: 'shared-id-2', cabinetId: null, title: 'Gleicher Titel', responsibleMembership: { userId: 'user-1' } })
    const entries = deriveGgaProjektPhasenWorklist([cabinetTask, projektNurTask], [], 'user-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('task-shared-id-2')
  })

  it('nutzt tagesUrgency() identisch zur Schrank-Maßnahme (Abschnitt 8, keine zweite Prioritäts-Engine): überfällige Projekt-/Phasen-Aufgabe erhält urgency=1, ueberfaellig=true, HANDLUNGSBEDARF', () => {
    const entries = deriveGgaProjektPhasenWorklist([projektTask({ dueDate: new Date('2020-01-01'), responsibleMembership: { userId: 'user-1' } })], [], 'user-1', new Date('2026-09-20'))
    expect(entries[0].urgency).toBe(1)
    expect(entries[0].ueberfaellig).toBe(true)
    expect(entries[0].praesentationsStatus).toBe('HANDLUNGSBEDARF')
  })

  it('Aufgabe ohne Fälligkeitsdatum erhält urgency=6 (ohne Frist) und praesentationsStatus IM_PLAN, nicht überfällig', () => {
    const entries = deriveGgaProjektPhasenWorklist([projektTask({ dueDate: null, responsibleMembership: { userId: 'user-1' } })], [], 'user-1')
    expect(entries[0].urgency).toBe(6)
    expect(entries[0].ueberfaellig).toBe(false)
    expect(entries[0].praesentationsStatus).toBe('IM_PLAN')
  })

  it('Abschnitt 7: Direktaktion einer Projekt-/Phasen-Aufgabe führt zum bestehenden Projektseiten-Anker #aufgaben (keine neue Route)', () => {
    expect(direktAktionFuerProjektArbeit('PROJEKT_MASSNAHME', 'p1')).toEqual({ href: '/collaboration/projects/p1#aufgaben', label: 'Aufgabe öffnen' })
  })

  it('Abschnitt 7: Direktaktion eines Projekt-/Phasen-Blockers führt zum bestehenden Projektseiten-Anker #blocker (keine neue Route)', () => {
    expect(direktAktionFuerProjektArbeit('PROJEKT_MANGEL', 'p1')).toEqual({ href: '/collaboration/projects/p1#blocker', label: 'Blocker öffnen' })
  })

  it('Abschnitt 8: praesentationsStatusFuerProjektArbeit ordnet ausschließlich das bestehende GgaPresentationStatus-Vokabular zu, ohne neue Statuslogik', () => {
    expect(praesentationsStatusFuerProjektArbeit('PROJEKT_MANGEL', false)).toBe('KRITISCH')
    expect(praesentationsStatusFuerProjektArbeit('PROJEKT_MASSNAHME', true)).toBe('HANDLUNGSBEDARF')
    expect(praesentationsStatusFuerProjektArbeit('PROJEKT_MASSNAHME', false)).toBe('IM_PLAN')
  })

  it('Abschnitt 12 (GVS-Massname-Testfall): offener, cabinetId-loser Blocker ohne responsibleMembershipId erscheint ehrlich als TEAM, nicht MEINE — Zuweisung wird nicht künstlich erzeugt, um den Test grün zu bekommen', () => {
    const entries = deriveGgaProjektPhasenWorklist(
      [],
      [projektBlocker({ id: 'gvs-1', title: 'GVS Massname', status: 'OPEN', cabinetId: null, stage: { title: 'Konzept' }, responsibleMembership: null })],
      'admin-user',
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].zustaendigkeit).toBe('TEAM')
    expect(entries[0].praesentationsStatus).toBe('KRITISCH')
  })

  it('mischt Tasks und Blocker mehrerer Projekte korrekt getrennt (projectId/projectNumber/projectName je Eintrag aus dem jeweils eigenen Datensatz, kein Vermischen)', () => {
    const entries = deriveGgaProjektPhasenWorklist(
      [projektTask({ id: 't-a', project: { id: 'p1', projectNumber: 'GGA-0001', name: 'Lagerplanung' }, responsibleMembership: { userId: 'user-1' } })],
      [projektBlocker({ id: 'b-a', project: { id: 'p2', projectNumber: 'GGA-0002', name: 'Zweitprojekt' }, responsibleMembership: { userId: 'user-1' } })],
      'user-1',
    )
    expect(entries.find((e) => e.type === 'PROJEKT_MASSNAHME')?.projectId).toBe('p1')
    expect(entries.find((e) => e.type === 'PROJEKT_MANGEL')?.projectId).toBe('p2')
  })
})
