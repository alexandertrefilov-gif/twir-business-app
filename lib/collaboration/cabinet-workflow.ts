// lib/collaboration/cabinet-workflow.ts
// Reine, zustandslose Ableitungslogik für den GGA-Cabinet-Status.
// Speichert NICHTS — Planungs-/Montagefortschritt und Prüfstatus werden bei
// jedem Aufruf aus den verknüpften Tasks/Checklistenpunkten/Blockern/
// Approvals berechnet (siehe GGA-Cabinet-Report, Abschnitt "Statusableitung").

export type GgaCabinetTaskSnapshot = {
  id: string
  title: string
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'SKIPPED'
  isRequired: boolean
  sequence: number
  stageCode: string
}

export type GgaCabinetChecklistSnapshot = {
  id: string
  title: string
  isRequired: boolean
  completed: boolean
  sequence: number
  stageCode: string
}

export type GgaCabinetBlockerSnapshot = {
  id: string
  title: string
  status: 'OPEN' | 'RESOLVED'
}

export type GgaCabinetApprovalSnapshot = {
  id: string
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED'
  approvalType: 'INTERNAL' | 'OPERATOR_ACCEPTANCE'
  requestedAt: Date
  decidedAt: Date | null
  stageCode: string
}

export type GgaCabinetSnapshot = {
  bestandsaufnahmeAm: Date | null
  pruefintervallMonate: number | null
  letztePruefungAm: Date | null
  tasks: GgaCabinetTaskSnapshot[]
  checklistItems: GgaCabinetChecklistSnapshot[]
  blockers: GgaCabinetBlockerSnapshot[]
  approvals: GgaCabinetApprovalSnapshot[]
}

export type GgaCabinetPruefstatus = 'NICHT_GEPLANT' | 'GEPLANT' | 'BESTANDEN' | 'UEBERFAELLIG' | 'BEANSTANDET'

// Betreiberfreigabe — ausschließlich aus approvalType === 'OPERATOR_ACCEPTANCE'
// abgeleitet, niemals aus decidedBy.role oder stageId (siehe Freigabe-Vorgabe).
export type GgaCabinetBetreiberstatus = 'NICHT_ANGEFORDERT' | 'AUSSTEHEND' | 'BEANSTANDET' | 'ERTEILT'

// Einheitliches, nutzerfacing "Betriebsstatus"-Label — ersetzt die bisherige
// Pruefstatus-Anzeige überall (intern + Betreiberportal). Rein abgeleitet aus
// pruefstatus/betreiberstatus/Prüffrist — kein zusätzliches Speicherfeld.
// FAELLIG_IN_TAGEN führt den exakten Tage-Countdown separat mit, da der Text
// ("Prüfung in 86 Tagen") den Zahlenwert enthält.
export type GgaCabinetBetriebsstatus =
  | 'BETRIEBSBEREIT'
  | 'FAELLIG_IN_TAGEN'
  | 'BALD_FAELLIG'
  | 'UEBERFAELLIG'
  | 'MANGEL_OFFEN'
  // Noch nie geprüft — keine Prüfungshistorie vorhanden.
  | 'ERSTPRUEFUNG_ERFORDERLICH'
  // Es existiert bereits eine Prüfungs-/Mangelhistorie (ein früherer
  // Approval-Zyklus wurde bereits entschieden) und nach Nacharbeit muss
  // erneut geprüft werden.
  | 'NACHPRUEFUNG_ERFORDERLICH'

// Vorlauf vor der berechneten Fälligkeit, ab dem "bald fällig" statt des
// Tage-Countdowns angezeigt wird.
const BALD_FAELLIG_VORLAUF_TAGE = 30

// Der Gesamt-Lebenszyklus eines Cabinets — ausschließlich abgeleitet, nie
// gespeichert. Jede Stufe entspricht exakt einem Punkt der geforderten
// Kette BESTAND → PLANUNG → UMSETZUNG → PRÜFUNG/ABNAHME → ABGESCHLOSSEN.
export type GgaCabinetLifecycleStage = 'BESTAND' | 'PLANUNG' | 'UMSETZUNG' | 'PRUEFUNG_ABNAHME' | 'ABGESCHLOSSEN'

export type DerivedGgaCabinetStatus = {
  // Ob die Bestandsaufnahme abgeschlossen ist, kommt direkt aus dem echten
  // Zeitstempel bestandsaufnahmeAm (gesetzt durch den Aufnahme-Assistenten,
  // Schritt "Aufnahme abschließen") — kein zusätzlicher künstlicher Statuswert.
  bestandsaufnahmeAbgeschlossen: boolean
  // Fortschritt der KONZEPT-Phase (Bestandsaufnahme-Checkliste/-Aufgaben),
  // rein informativ — die verbindliche Abschlussmarkierung ist obiges Feld.
  bestandsaufnahmeFortschritt: number | null
  // Fortschritt der PLANUNG-Phase (Maßnahmen/Checklistenpunkte)
  planungsfortschritt: number | null
  // Fortschritt der UMSETZUNG-Phase (Maßnahmen/Checklistenpunkte). Eine
  // Umsetzung gilt erst bei 100% als abgeschlossen — offene erforderliche
  // Maßnahmen verhindern das automatisch, weil progressForStages sie zählt.
  montagefortschritt: number | null
  // Fortschritt der ABNAHME-Checkliste (Abluft/Elektro/Ex/Dokumentation
  // geprüft) — unabhängig vom formalen Freigabestatus (Approval).
  abnahmeChecklistFortschritt: number | null
  // Interner/technischer Prüfstatus — ab dieser Phase ausschließlich aus
  // INTERNAL-Approvals abgeleitet (nie mehr aus OPERATOR_ACCEPTANCE).
  pruefstatus: GgaCabinetPruefstatus
  // Betreiberfreigabe — vollständig getrennt vom internen Prüfstatus.
  betreiberstatus: GgaCabinetBetreiberstatus
  offeneBlocker: number
  naechsteAktion: string
  lifecycleStage: GgaCabinetLifecycleStage
  // Control-Tower-taugliche Einzelsignale, alle rein abgeleitet:
  pruefungOffen: boolean       // technische Prüfarbeit (ABNAHME-Checkliste) noch nicht vollständig
  freigabeOffen: boolean       // interne Prüfarbeit fertig, aber noch keine entschiedene interne Freigabe
  nacharbeitErforderlich: boolean // interne oder Betreiber-Freigabe wurde abgelehnt
  // "Technisch geprüft" != "Betreiberfreigabe erteilt" (Trennungsgebot) —
  // abgeschlossen ist ein Cabinet erst, wenn zusätzlich keine offene/
  // abgelehnte Betreiberfreigabe aussteht.
  abgeschlossen: boolean
  betreiberfreigabeAusstehend: boolean
  betreiberbeanstandung: boolean
  betreiberfreigabeErteilt: boolean
  // Einheitliches Anzeige-Label (siehe GgaCabinetBetriebsstatus oben).
  betriebsstatus: GgaCabinetBetriebsstatus
  // Nur bei betriebsstatus === 'FAELLIG_IN_TAGEN' gesetzt (Tage bis zur
  // berechneten Fälligkeit, ganzzahlig aufgerundet).
  betriebsstatusTageBisFaellig: number | null
}

const INTAKE_STAGE_CODES = new Set(['KONZEPT'])
const PLANNING_STAGE_CODES = new Set(['PLANUNG'])
const EXECUTION_STAGE_CODES = new Set(['UMSETZUNG'])
const INSPECTION_STAGE_CODES = new Set(['ABNAHME'])

function progressForStages(
  tasks: GgaCabinetTaskSnapshot[],
  checklistItems: GgaCabinetChecklistSnapshot[],
  stageCodes: Set<string>,
): number | null {
  const relevantTasks = tasks.filter((task) => task.isRequired && stageCodes.has(task.stageCode))
  const relevantChecklist = checklistItems.filter((item) => item.isRequired && stageCodes.has(item.stageCode))
  const total = relevantTasks.length + relevantChecklist.length
  if (total === 0) return null
  const done = relevantTasks.filter((task) => ['DONE', 'SKIPPED'].includes(task.status)).length
    + relevantChecklist.filter((item) => item.completed).length
  return Math.round((done / total) * 100)
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

function derivePruefstatus(cabinet: GgaCabinetSnapshot, now: Date): GgaCabinetPruefstatus {
  const inspectionApprovals = cabinet.approvals
    .filter((approval) => INSPECTION_STAGE_CODES.has(approval.stageCode) && approval.approvalType === 'INTERNAL')
    .sort((a, b) => (b.decidedAt ?? b.requestedAt).getTime() - (a.decidedAt ?? a.requestedAt).getTime())

  const latest = inspectionApprovals[0]
  if (!latest) return 'NICHT_GEPLANT'
  if (latest.status === 'REQUESTED') return 'GEPLANT'
  if (latest.status === 'REJECTED') return 'BEANSTANDET'

  // APPROVED: bestanden, außer die Prüffrist ist inzwischen wieder abgelaufen
  if (cabinet.letztePruefungAm && cabinet.pruefintervallMonate) {
    if (monthsBetween(cabinet.letztePruefungAm, now) >= cabinet.pruefintervallMonate) return 'UEBERFAELLIG'
  }
  return 'BESTANDEN'
}

function addMonthsToDate(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  result.setMonth(result.getMonth() + months)
  return result
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

function deriveBetriebsstatus(
  pruefstatus: GgaCabinetPruefstatus,
  betreiberstatus: GgaCabinetBetreiberstatus,
  cabinet: GgaCabinetSnapshot,
  now: Date,
): { status: GgaCabinetBetriebsstatus; tageBisFaellig: number | null } {
  // Ein offener Mangel — intern oder beim Betreiber festgestellt — hat
  // immer Vorrang vor jeder Fristenbetrachtung.
  if (pruefstatus === 'BEANSTANDET' || betreiberstatus === 'BEANSTANDET') {
    return { status: 'MANGEL_OFFEN', tageBisFaellig: null }
  }
  // Noch nie geprüft: keinerlei Prüfungshistorie vorhanden.
  if (pruefstatus === 'NICHT_GEPLANT') {
    return { status: 'ERSTPRUEFUNG_ERFORDERLICH', tageBisFaellig: null }
  }
  // Eine (Nach-)Prüfung wurde angefordert, aber noch nicht entschieden.
  // Nur dann "Nachprüfung", wenn bereits eine frühere, bereits entschiedene
  // Prüfung existiert (Prüfungs-/Mangelhistorie) — sonst ist es weiterhin
  // die erste, lediglich schon terminierte Prüfung.
  if (pruefstatus === 'GEPLANT') {
    const hasDecidedHistory = cabinet.approvals.some((approval) =>
      approval.approvalType === 'INTERNAL' && INSPECTION_STAGE_CODES.has(approval.stageCode) && approval.status !== 'REQUESTED')
    return { status: hasDecidedHistory ? 'NACHPRUEFUNG_ERFORDERLICH' : 'ERSTPRUEFUNG_ERFORDERLICH', tageBisFaellig: null }
  }
  if (pruefstatus === 'UEBERFAELLIG') {
    return { status: 'UEBERFAELLIG', tageBisFaellig: null }
  }
  // pruefstatus === 'BESTANDEN': ohne bekannte Frist bleibt es bei der
  // generischen Aussage — mit Frist wird der Countdown zur Kernaussage.
  if (!cabinet.letztePruefungAm || !cabinet.pruefintervallMonate) {
    return { status: 'BETRIEBSBEREIT', tageBisFaellig: null }
  }
  const faelligAm = addMonthsToDate(cabinet.letztePruefungAm, cabinet.pruefintervallMonate)
  const tageBisFaellig = daysBetween(now, faelligAm)
  if (tageBisFaellig <= BALD_FAELLIG_VORLAUF_TAGE) {
    return { status: 'BALD_FAELLIG', tageBisFaellig: null }
  }
  return { status: 'FAELLIG_IN_TAGEN', tageBisFaellig }
}

function deriveBetreiberstatus(cabinet: GgaCabinetSnapshot): GgaCabinetBetreiberstatus {
  const operatorApprovals = cabinet.approvals
    .filter((approval) => approval.approvalType === 'OPERATOR_ACCEPTANCE')
    .sort((a, b) => (b.decidedAt ?? b.requestedAt).getTime() - (a.decidedAt ?? a.requestedAt).getTime())

  const latest = operatorApprovals[0]
  if (!latest) return 'NICHT_ANGEFORDERT'
  if (latest.status === 'REQUESTED') return 'AUSSTEHEND'
  if (latest.status === 'REJECTED') return 'BEANSTANDET'
  return 'ERTEILT'
}

export function deriveCabinetStatus(cabinet: GgaCabinetSnapshot, now = new Date()): DerivedGgaCabinetStatus {
  const bestandsaufnahmeAbgeschlossen = cabinet.bestandsaufnahmeAm !== null
  const bestandsaufnahmeFortschritt = progressForStages(cabinet.tasks, cabinet.checklistItems, INTAKE_STAGE_CODES)
  const planungsfortschritt = progressForStages(cabinet.tasks, cabinet.checklistItems, PLANNING_STAGE_CODES)
  const montagefortschritt = progressForStages(cabinet.tasks, cabinet.checklistItems, EXECUTION_STAGE_CODES)
  const abnahmeChecklistFortschritt = progressForStages(cabinet.tasks, cabinet.checklistItems, INSPECTION_STAGE_CODES)
  const pruefstatus = derivePruefstatus(cabinet, now)
  const betreiberstatus = deriveBetreiberstatus(cabinet)
  const offeneBlocker = cabinet.blockers.filter((blocker) => blocker.status === 'OPEN').length

  const planungFertig = planungsfortschritt !== null && planungsfortschritt >= 100
  const umsetzungFertig = montagefortschritt !== null && montagefortschritt >= 100
  // Betreiberfreigabe blockiert den Abschluss nur, wenn sie tatsächlich in
  // Gang gesetzt wurde (AUSSTEHEND/BEANSTANDET) — ein Cabinet ohne jemals
  // angeforderte Betreiberfreigabe ist dadurch nicht blockiert.
  const betreiberBlockiertAbschluss = betreiberstatus === 'AUSSTEHEND' || betreiberstatus === 'BEANSTANDET'

  const lifecycleStage: GgaCabinetLifecycleStage = !bestandsaufnahmeAbgeschlossen ? 'BESTAND'
    : !planungFertig ? 'PLANUNG'
    : !umsetzungFertig ? 'UMSETZUNG'
    : pruefstatus !== 'BESTANDEN' || betreiberBlockiertAbschluss ? 'PRUEFUNG_ABNAHME'
    : 'ABGESCHLOSSEN'

  const nacharbeitErforderlich = pruefstatus === 'BEANSTANDET' || betreiberstatus === 'BEANSTANDET'
  const abnahmeChecklistFertig = abnahmeChecklistFortschritt !== null && abnahmeChecklistFortschritt >= 100
  const pruefungOffen = lifecycleStage === 'PRUEFUNG_ABNAHME' && pruefstatus !== 'BEANSTANDET' && (pruefstatus === 'UEBERFAELLIG' || !abnahmeChecklistFertig)
  const freigabeOffen = lifecycleStage === 'PRUEFUNG_ABNAHME' && pruefstatus !== 'BEANSTANDET' && abnahmeChecklistFertig && pruefstatus !== 'UEBERFAELLIG' && pruefstatus !== 'BESTANDEN'
  const abgeschlossen = lifecycleStage === 'ABGESCHLOSSEN'
  const betreiberfreigabeAusstehend = betreiberstatus === 'AUSSTEHEND'
  const betreiberbeanstandung = betreiberstatus === 'BEANSTANDET'
  const betreiberfreigabeErteilt = betreiberstatus === 'ERTEILT'
  const { status: betriebsstatus, tageBisFaellig: betriebsstatusTageBisFaellig } = deriveBetriebsstatus(pruefstatus, betreiberstatus, cabinet, now)

  const naechsteAktion = (() => {
    const blocker = [...cabinet.blockers].find((item) => item.status === 'OPEN')
    if (blocker) return blocker.title
    const openTask = [...cabinet.tasks]
      .filter((task) => task.isRequired && !['DONE', 'SKIPPED'].includes(task.status))
      .sort((a, b) => a.sequence - b.sequence)[0]
    if (openTask) return openTask.title
    const openChecklist = [...cabinet.checklistItems]
      .filter((item) => item.isRequired && !item.completed)
      .sort((a, b) => a.sequence - b.sequence)[0]
    if (openChecklist) return openChecklist.title
    if (!bestandsaufnahmeAbgeschlossen) return 'Bestandsaufnahme durchführen'
    if (pruefstatus === 'UEBERFAELLIG') return 'Prüfung überfällig — Termin vereinbaren'
    if (pruefstatus === 'BEANSTANDET') return 'Beanstandung nachbessern'
    if (betreiberbeanstandung) return 'Beanstandung bearbeiten'
    if (betreiberfreigabeAusstehend) return 'Betreiberentscheidung abwarten'
    if (freigabeOffen) return 'Betreiberfreigabe anfordern'
    if (pruefstatus === 'NICHT_GEPLANT') return 'Prüfung planen'
    if (pruefstatus === 'GEPLANT') return 'Prüfung durchführen'
    return 'Keine offenen Punkte'
  })()

  return {
    bestandsaufnahmeAbgeschlossen, bestandsaufnahmeFortschritt, planungsfortschritt, montagefortschritt,
    abnahmeChecklistFortschritt, pruefstatus, betreiberstatus, offeneBlocker, naechsteAktion, lifecycleStage,
    pruefungOffen, freigabeOffen, nacharbeitErforderlich, abgeschlossen,
    betreiberfreigabeAusstehend, betreiberbeanstandung, betreiberfreigabeErteilt,
    betriebsstatus, betriebsstatusTageBisFaellig,
  }
}

// ── Control-Tower-Aggregation (REQ-012) ──────────────────────
// Rein berechnet aus bereits abgeleiteten Einzelschrank-Status — keine
// zweite Statuslogik, keine DB-Zugriffe. gga-cabinet.service.ts liefert
// die pro Schrank abgeleiteten Werte an, diese Funktion aggregiert sie nur
// noch projektweit. Dadurch ist die vollständige Aggregation ohne
// Testdatenbank unit-testbar.

export type GgaCabinetControlTowerEntry = { id: string; kennung: string } & DerivedGgaCabinetStatus

export type GgaCabinetControlTowerSummary = {
  gesamt: number
  bestandsaufnahmeOffen: number
  planungOffen: number
  umsetzungOffen: number
  pruefungOffen: number
  nachpruefungErforderlich: number
  ueberfaellig: number
  freigabeOffen: number
  nacharbeitErforderlich: number
  abgeschlossen: number
  mitBlocker: number
  aufmerksamkeitErforderlich: number
  betreiberfreigabeAusstehend: number
  betreiberbeanstandung: number
  betreiberfreigabeErteilt: number
  cabinets: Array<{
    id: string; kennung: string; lifecycleStage: GgaCabinetLifecycleStage; betreiberstatus: GgaCabinetBetreiberstatus
    naechsteAktion: string; offeneBlocker: number; aufmerksamkeitErforderlich: boolean
  }>
}

// Ein Schrank braucht sichtbare Aufmerksamkeit, wenn irgendein sicherheits-
// oder freigaberelevanter Zustand offen ist. Bewusst eine Vereinigung
// mehrerer, bereits existierender Einzelsignale — kein neuer Status, keine
// neue Ableitung. nacharbeitErforderlich deckt zusätzlich eine bereits
// abgelehnte (aber noch nicht neu angeforderte) Prüfung/Betreiberentscheidung
// ab, die sonst weder in "Nachprüfung erforderlich" noch in
// "Betreiberfreigabe ausstehend" auftaucht (der Betriebsstatus zeigt dafür
// MANGEL_OFFEN, siehe deriveBetriebsstatus oben).
export function ggaCabinetBrauchtAufmerksamkeit(item: DerivedGgaCabinetStatus): boolean {
  return item.offeneBlocker > 0
    || item.betriebsstatus === 'NACHPRUEFUNG_ERFORDERLICH'
    || item.freigabeOffen
    || item.betreiberfreigabeAusstehend
    || item.nacharbeitErforderlich
}

export function deriveGgaCabinetControlTowerSummary(entries: GgaCabinetControlTowerEntry[]): GgaCabinetControlTowerSummary {
  return {
    gesamt: entries.length,
    bestandsaufnahmeOffen: entries.filter((item) => !item.bestandsaufnahmeAbgeschlossen).length,
    planungOffen: entries.filter((item) => item.bestandsaufnahmeAbgeschlossen && (item.planungsfortschritt === null || item.planungsfortschritt < 100)).length,
    umsetzungOffen: entries.filter((item) => item.lifecycleStage === 'UMSETZUNG').length,
    // pruefungOffen: technische Prüfarbeit (ABNAHME-Checkliste) noch nicht
    // abgeschlossen. nachpruefungErforderlich: ein früherer Prüfzyklus wurde
    // bereits entschieden und danach erneut angefordert — beide Signale
    // können sich für denselben Schrank überschneiden, sie beantworten aber
    // unterschiedliche Fragen ("ist die Prüfarbeit fertig?" vs. "ist das schon
    // die wiederholte Prüfung?") und werden deshalb bewusst getrennt gezählt.
    pruefungOffen: entries.filter((item) => item.pruefungOffen).length,
    nachpruefungErforderlich: entries.filter((item) => item.betriebsstatus === 'NACHPRUEFUNG_ERFORDERLICH').length,
    ueberfaellig: entries.filter((item) => item.betriebsstatus === 'UEBERFAELLIG').length,
    freigabeOffen: entries.filter((item) => item.freigabeOffen).length,
    nacharbeitErforderlich: entries.filter((item) => item.nacharbeitErforderlich).length,
    // abgeschlossen zählt ausschließlich über item.abgeschlossen, also exakt
    // über deriveCabinetStatus()/lifecycleStage === 'ABGESCHLOSSEN' — niemals
    // über eine eigene UI-Bedingung (Single Source of Truth, siehe REQ-012).
    abgeschlossen: entries.filter((item) => item.abgeschlossen).length,
    mitBlocker: entries.filter((item) => item.offeneBlocker > 0).length,
    aufmerksamkeitErforderlich: entries.filter(ggaCabinetBrauchtAufmerksamkeit).length,
    // Zusätzliche, rein abgeleitete Betreiber-Flags (Abschnitt 20) — kein
    // zweiter Lifecycle, nur zusätzliche Sichten auf denselben Zustand.
    betreiberfreigabeAusstehend: entries.filter((item) => item.betreiberfreigabeAusstehend).length,
    betreiberbeanstandung: entries.filter((item) => item.betreiberbeanstandung).length,
    betreiberfreigabeErteilt: entries.filter((item) => item.betreiberfreigabeErteilt).length,
    // Für "Wo hängt welcher Schrank und warum?" — pro Cabinet Stufe + nächste Aktion.
    cabinets: entries.map((item) => ({
      id: item.id, kennung: item.kennung, lifecycleStage: item.lifecycleStage, betreiberstatus: item.betreiberstatus,
      naechsteAktion: item.naechsteAktion, offeneBlocker: item.offeneBlocker, aufmerksamkeitErforderlich: ggaCabinetBrauchtAufmerksamkeit(item),
    })),
  }
}

// ── Projekt-Arbeitsliste "Fristen & nächste Aktionen" (REQ-013) ──────────
// Reine Ableitung — keine DB-Zugriffe, keine neue Statuslogik. Liest
// ausschließlich bereits vorhandene Daten (offene CollaborationTask/-Blocker
// je Schrank) und bereits abgeleitete DerivedGgaCabinetStatus-Felder. Erzeugt
// keine neuen Fristen und ändert nie einen Workflow-Status.

export type GgaWorklistEntryType =
  | 'MASSNAHME'              // konkrete offene, erforderliche CollaborationTask
  | 'MANGEL'                 // offener CollaborationBlocker
  | 'BEANSTANDUNG'           // interne oder Betreiber-Prüfung abgelehnt, noch nicht neu angefordert
  | 'PRUEFUNG_UEBERFAELLIG'  // Prüfintervall abgelaufen (betriebsstatus UEBERFAELLIG)
  | 'NACHPRUEFUNG'           // frühere Prüfung entschieden, erneute Prüfung bereits angefordert
  | 'INTERNE_FREIGABE'       // Abnahme-Checkliste fertig, interne Freigabe noch nicht angefordert/entschieden
  | 'BETREIBERFREIGABE'      // Betreiberentscheidung aussteht
  | 'NAECHSTE_AKTION'        // Rest-Fallback aus deriveCabinetStatus().naechsteAktion (z.B. Bestandsaufnahme/Checkliste/Prüfung planen)

// 1=überfällig, 2=sicherheitsrelevant ohne erledigte Freigabe/Nachprüfung,
// 3=heute fällig, 4=demnächst fällig, 5=sonstige offene nächste Aktion,
// 6=ohne Frist. Numerisch, damit die Sortierung eindeutig und testbar bleibt.
export type GgaWorklistUrgency = 1 | 2 | 3 | 4 | 5 | 6
export const GGA_WORKLIST_URGENCY_LABELS: Record<GgaWorklistUrgency, string> = {
  1: 'Überfällig',
  2: 'Sicherheitsrelevant',
  3: 'Heute fällig',
  4: 'Demnächst fällig',
  5: 'Offen',
  6: 'Ohne Frist',
}

export const GGA_WORKLIST_URGENCY_BADGE_CLASS: Record<GgaWorklistUrgency, string> = {
  1: 'bg-red-100 text-red-800',
  2: 'bg-amber-100 text-amber-800',
  3: 'bg-amber-100 text-amber-800',
  4: 'bg-stone-100 text-stone-700',
  5: 'bg-stone-100 text-stone-600',
  6: 'bg-stone-100 text-stone-500',
}

export type GgaWorklistEntry = {
  cabinetId: string
  kennung: string
  standort: string | null
  title: string
  type: GgaWorklistEntryType
  dueDate: Date | null
  verantwortlich: string | null
  urgency: GgaWorklistUrgency
  ueberfaellig: boolean
  // Nur innerhalb urgency===4 relevant: Frist liegt innerhalb des kurzen
  // Vorlaufs (siehe AUFGABE_DEMNAECHST_VORLAUF_TAGE) — rein visuelle
  // Zusatzinformation, ändert nie die Sortierklasse selbst.
  baldFaellig: boolean
}

export type GgaWorklistCabinetTask = { id: string; title: string; dueDate: Date | null; verantwortlich: string | null }
export type GgaWorklistCabinetBlocker = { id: string; title: string; verantwortlich: string | null }

export type GgaWorklistCabinetInput = {
  id: string
  kennung: string
  standort: string | null
  status: DerivedGgaCabinetStatus
  openRequiredTasks: GgaWorklistCabinetTask[]
  openBlockers: GgaWorklistCabinetBlocker[]
}

// Aufgaben ohne eigenes Fälligkeitsdatum haben keinen "bald fällig"-Vorlauf.
// Eigener, kleinerer Vorlauf als bei der mehrmonatigen Prüfintervall-Logik
// (BALD_FAELLIG_VORLAUF_TAGE = 30 Tage dort) — Maßnahmen sind feingranularer.
const AUFGABE_DEMNAECHST_VORLAUF_TAGE = 7

function istGleicherKalendertag(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function tagesUrgency(dueDate: Date, now: Date): { urgency: GgaWorklistUrgency; ueberfaellig: boolean; baldFaellig: boolean } {
  if (dueDate.getTime() < now.getTime()) return { urgency: 1, ueberfaellig: true, baldFaellig: false }
  if (istGleicherKalendertag(dueDate, now)) return { urgency: 3, ueberfaellig: false, baldFaellig: false }
  const tageBisFaellig = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return { urgency: 4, ueberfaellig: false, baldFaellig: tageBisFaellig <= AUFGABE_DEMNAECHST_VORLAUF_TAGE }
}

export function deriveGgaProjectWorklist(cabinets: GgaWorklistCabinetInput[], now = new Date()): GgaWorklistEntry[] {
  const entries: GgaWorklistEntry[] = []
  const sicherheitsrelevant = (title: string, type: GgaWorklistEntryType, cabinet: GgaWorklistCabinetInput) =>
    entries.push({ cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort, title, type, dueDate: null, verantwortlich: null, urgency: 2 as const, ueberfaellig: false, baldFaellig: false })

  for (const cabinet of cabinets) {
    const usedTitles = new Set<string>()

    for (const blocker of cabinet.openBlockers) {
      usedTitles.add(blocker.title)
      entries.push({
        cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort,
        title: blocker.title, type: 'MANGEL', dueDate: null, verantwortlich: blocker.verantwortlich,
        urgency: 2, ueberfaellig: false, baldFaellig: false,
      })
    }

    for (const task of cabinet.openRequiredTasks) {
      usedTitles.add(task.title)
      const { urgency, ueberfaellig, baldFaellig } = task.dueDate ? tagesUrgency(task.dueDate, now) : { urgency: 6 as const, ueberfaellig: false, baldFaellig: false }
      entries.push({
        cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort,
        title: task.title, type: 'MASSNAHME', dueDate: task.dueDate, verantwortlich: task.verantwortlich,
        urgency, ueberfaellig, baldFaellig,
      })
    }

    // Beanstandung: interne oder Betreiber-Prüfung wurde abgelehnt und noch
    // nicht neu angefordert — betriebsstatus zeigt dafür MANGEL_OFFEN, hat
    // aber (anders als hier) keinen eigenen Kennzahlnamen im Control-Tower.
    if (cabinet.status.nacharbeitErforderlich) {
      const title = cabinet.status.pruefstatus === 'BEANSTANDET' ? 'Beanstandung nachbessern' : 'Beanstandung bearbeiten'
      usedTitles.add(title)
      sicherheitsrelevant(title, 'BEANSTANDUNG', cabinet)
    }
    if (cabinet.status.betriebsstatus === 'UEBERFAELLIG') {
      const title = 'Prüfung überfällig — Termin vereinbaren'
      usedTitles.add(title)
      entries.push({ cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort, title, type: 'PRUEFUNG_UEBERFAELLIG', dueDate: null, verantwortlich: null, urgency: 1, ueberfaellig: true, baldFaellig: false })
    }
    if (cabinet.status.betriebsstatus === 'NACHPRUEFUNG_ERFORDERLICH') {
      const title = 'Nachprüfung erforderlich'
      usedTitles.add(title)
      sicherheitsrelevant(title, 'NACHPRUEFUNG', cabinet)
    }
    if (cabinet.status.freigabeOffen) {
      const title = 'Interne Freigabe anfordern'
      usedTitles.add(title)
      sicherheitsrelevant(title, 'INTERNE_FREIGABE', cabinet)
    }
    if (cabinet.status.betreiberfreigabeAusstehend) {
      const title = 'Betreiberentscheidung abwarten'
      usedTitles.add(title)
      sicherheitsrelevant(title, 'BETREIBERFREIGABE', cabinet)
    }

    // Rest-Fallback: nur wenn keiner der obigen, konkreteren Einträge diesen
    // Schrank bereits repräsentiert (kein offener Blocker/keine offene
    // Maßnahme/keine der vier Sicherheits-Flags) — verhindert einen
    // fachlichen Doppeleintrag (REQ-013 Phase 7).
    const hatKonkretenEintrag = cabinet.openBlockers.length > 0 || cabinet.openRequiredTasks.length > 0
      || cabinet.status.nacharbeitErforderlich || cabinet.status.betriebsstatus === 'UEBERFAELLIG'
      || cabinet.status.betriebsstatus === 'NACHPRUEFUNG_ERFORDERLICH' || cabinet.status.freigabeOffen || cabinet.status.betreiberfreigabeAusstehend
    if (!hatKonkretenEintrag && cabinet.status.naechsteAktion !== 'Keine offenen Punkte' && !usedTitles.has(cabinet.status.naechsteAktion)) {
      entries.push({
        cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort,
        title: cabinet.status.naechsteAktion, type: 'NAECHSTE_AKTION', dueDate: null, verantwortlich: null,
        urgency: 5, ueberfaellig: false, baldFaellig: false,
      })
    }
  }

  return entries.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency - b.urgency
    if (a.dueDate && b.dueDate) { const diff = a.dueDate.getTime() - b.dueDate.getTime(); if (diff !== 0) return diff }
    else if (a.dueDate && !b.dueDate) return -1
    else if (!a.dueDate && b.dueDate) return 1
    return a.kennung.localeCompare(b.kennung) || a.cabinetId.localeCompare(b.cabinetId)
  })
}

/** Formatiert das Betriebsstatus-Label, inkl. Tage-Countdown wo zutreffend. */
export function formatGgaBetriebsstatusLabel(status: GgaCabinetBetriebsstatus, tageBisFaellig: number | null): string {
  switch (status) {
    case 'BETRIEBSBEREIT': return 'Betriebsbereit'
    case 'FAELLIG_IN_TAGEN': return `Prüfung in ${tageBisFaellig} Tagen`
    case 'BALD_FAELLIG': return 'Prüfung bald fällig'
    case 'UEBERFAELLIG': return 'Prüfung überfällig'
    case 'MANGEL_OFFEN': return 'Mangel offen'
    case 'ERSTPRUEFUNG_ERFORDERLICH': return 'Erstprüfung erforderlich'
    case 'NACHPRUEFUNG_ERFORDERLICH': return 'Nachprüfung erforderlich'
  }
}

export const GGA_BETRIEBSSTATUS_BADGE_CLASS: Record<GgaCabinetBetriebsstatus, string> = {
  BETRIEBSBEREIT: 'bg-green-100 text-green-800',
  FAELLIG_IN_TAGEN: 'bg-stone-100 text-stone-700',
  BALD_FAELLIG: 'bg-amber-100 text-amber-800',
  UEBERFAELLIG: 'bg-red-100 text-red-800',
  MANGEL_OFFEN: 'bg-red-100 text-red-800',
  ERSTPRUEFUNG_ERFORDERLICH: 'bg-stone-100 text-stone-600',
  NACHPRUEFUNG_ERFORDERLICH: 'bg-amber-100 text-amber-800',
}

export const GGA_BETREIBERSTATUS_LABELS: Record<GgaCabinetBetreiberstatus, string> = {
  NICHT_ANGEFORDERT: 'Nicht angefordert',
  AUSSTEHEND: 'Betreiberfreigabe ausstehend',
  BEANSTANDET: 'Betreiberbeanstandung',
  ERTEILT: 'Betreiberfreigabe erteilt',
}

export const GGA_LIFECYCLE_STAGE_LABELS: Record<GgaCabinetLifecycleStage, string> = {
  BESTAND: 'Bestand',
  PLANUNG: 'Planung',
  UMSETZUNG: 'Umsetzung',
  PRUEFUNG_ABNAHME: 'Prüfung / Abnahme',
  ABGESCHLOSSEN: 'Abgeschlossen',
}

export const GGA_PRUEFSTATUS_LABELS: Record<GgaCabinetPruefstatus, string> = {
  NICHT_GEPLANT: 'Nicht geplant',
  GEPLANT: 'Geplant',
  BESTANDEN: 'Bestanden',
  UEBERFAELLIG: 'Überfällig',
  BEANSTANDET: 'Beanstandet',
}

export const GGA_EX_ASSESSMENT_LABELS: Record<'NOT_ASSESSED' | 'REQUIRED' | 'NOT_REQUIRED', string> = {
  NOT_ASSESSED: 'Noch nicht bewertet',
  REQUIRED: 'Erforderlich',
  NOT_REQUIRED: 'Nicht erforderlich',
}
