import { describe, expect, it } from 'vitest'
import { deriveCabinetStatus, formatGgaBetriebsstatusLabel, type GgaCabinetSnapshot } from '@/lib/collaboration/cabinet-workflow'

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
