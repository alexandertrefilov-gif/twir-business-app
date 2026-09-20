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

// GGA-05.1: Single Source of Truth für die fünf kanonischen GGA-Projektphasen
// — vorher parallel als GGA_FIVE_PHASE_PLAN in collaboration-phase2.service.ts
// UND (mit abweichenden Codes AUSFUEHRUNG/UEBERGABE) in prisma/seed/seed.ts
// gepflegt, was reale BusinessRuleError-Abbrüche und stille null-Ergebnisse
// in progressForStages() zur Folge hatte (siehe PROJECT_MAP → Invariante 13).
// Dieses Modul ist absichtlich abhängigkeitsfrei (kein Import von prisma/zod)
// — collaboration-phase2.service.ts UND prisma/seed/seed.ts importieren beide
// von hier, damit eine zweite, manuell gepflegte Code-Liste nicht mehr
// entstehen kann.
export const GGA_STAGE_KONZEPT = 'KONZEPT'
export const GGA_STAGE_PLANUNG = 'PLANUNG'
export const GGA_STAGE_UMSETZUNG = 'UMSETZUNG'
export const GGA_STAGE_ABNAHME = 'ABNAHME'
export const GGA_STAGE_ABSCHLUSS = 'ABSCHLUSS'

export const GGA_FIVE_PHASE_PLAN = [
  { code: GGA_STAGE_KONZEPT, title: 'Konzept', weight: 10, requiresApproval: false },
  { code: GGA_STAGE_PLANUNG, title: 'Planung', weight: 20, requiresApproval: true },
  { code: GGA_STAGE_UMSETZUNG, title: 'Umsetzung', weight: 35, requiresApproval: false },
  { code: GGA_STAGE_ABNAHME, title: 'Abnahme', weight: 25, requiresApproval: true },
  { code: GGA_STAGE_ABSCHLUSS, title: 'Abschluss', weight: 10, requiresApproval: false },
] as const

const INTAKE_STAGE_CODES = new Set([GGA_STAGE_KONZEPT])
const PLANNING_STAGE_CODES = new Set([GGA_STAGE_PLANUNG])
const EXECUTION_STAGE_CODES = new Set([GGA_STAGE_UMSETZUNG])
const INSPECTION_STAGE_CODES = new Set([GGA_STAGE_ABNAHME])

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
    if (freigabeOffen) return 'Interne Freigabe anfordern'
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

// ── Freigabe-Kette — gemeinsame Readiness-Prüfung (REQ-015 / GGA-05.2) ──
// Beide Funktionen lesen ausschließlich den bereits bestehenden
// deriveCabinetStatus()-Output (dieselbe Quelle, die auch die UI speist) —
// keine neue, dritte Statuslogik. Unterschiedliche Schwellen sind fachlich
// korrekt und dürfen nicht auf eine gemeinsame Bedingung reduziert werden
// (siehe PROJECT_MAP → Invariante 5): die interne Freigabe setzt eine
// vollständige ABNAHME-Checkliste voraus (die technische Prüfarbeit ist
// erledigt und kann zur Entscheidung vorgelegt werden); die Betreiber-
// freigabe setzt zusätzlich eine bereits erteilte, noch gültige interne
// Freigabe voraus (pruefstatus === 'BESTANDEN') — technisch geprüft ist
// nicht gleichbedeutend mit Betreiberfreigabe erteilt.
export function ggaCabinetBereitFuerInterneFreigabe(status: DerivedGgaCabinetStatus): boolean {
  return status.abnahmeChecklistFortschritt !== null && status.abnahmeChecklistFortschritt >= 100
}

export function ggaCabinetBereitFuerBetreiberfreigabe(status: DerivedGgaCabinetStatus): boolean {
  return status.pruefstatus === 'BESTANDEN'
}

// REQ-015.4: reine Readiness-Abbildung je kanonischem GGA-Stage-Code auf
// bereits vorhandene, abgeleitete DerivedGgaCabinetStatus-Felder — KEINE
// neue Statuslogik, nur ein Adapter. Membership (welche Cabinets zählen)
// wird NICHT hier entschieden, sondern vom Aufrufer aus GgaCabinet.projectId
// bestimmt (siehe collaboration-phase2.service.ts) — diese Funktion
// beantwortet ausschließlich "ist EIN bereits bekanntes Cabinet für DIESE
// Phase fertig". Ein unbekannter/Nicht-GGA-Stage-Code blockiert nichts
// (default true), damit Nicht-GGA-Projekte unberührt bleiben.
export function isCabinetReadyForStage(status: DerivedGgaCabinetStatus, stageCode: string): boolean {
  switch (stageCode) {
    case GGA_STAGE_KONZEPT:
      return status.bestandsaufnahmeAbgeschlossen
    case GGA_STAGE_PLANUNG:
      return status.planungsfortschritt !== null && status.planungsfortschritt >= 100
    case GGA_STAGE_UMSETZUNG:
      return status.montagefortschritt !== null && status.montagefortschritt >= 100
    case GGA_STAGE_ABNAHME:
      // Dieselbe Schwelle wie ggaCabinetBereitFuerBetreiberfreigabe():
      // technisch geprüft UND intern freigegeben (APPROVED), nicht nur
      // Checkliste vollständig — deckt sich mit dem in REQ-015.3
      // reproduzierten Bypass-Szenario (Cabinet A "vollständig + APPROVED").
      return status.pruefstatus === 'BESTANDEN'
    case GGA_STAGE_ABSCHLUSS:
      return status.abgeschlossen
    default:
      return true
  }
}

// ── Strukturierte Prüfnachweise Lüftung/Elektro/VDE (REQ-018/REQ-018.1) ──
// Reine, zustandslose Ableitung — kein Prisma-/Zod-Import (Modulkonvention,
// siehe Dateikopf), daher eigene String-Literal-Typen statt der
// generierten Prisma-Enums (analog zu GgaCabinetApprovalSnapshot.status
// oben).
export type GgaPruefart = 'LUEFTUNG' | 'ELEKTRO' | 'VDE'
export type GgaPruefergebnis = 'OFFEN' | 'BESTANDEN' | 'NICHT_BESTANDEN'

export type GgaCabinetPruefnachweisSnapshot = {
  id: string
  pruefart: GgaPruefart
  ergebnis: GgaPruefergebnis
  pruefdatum: Date | null
  ausfuehrendeStelle: string | null
  bemerkung: string | null
  documentId: string | null
  createdAt: Date
}

// Mehrere Zeilen je (Cabinet, Prüfart) über die Zeit sind ausdrücklich
// zulässig (Wiederholungsprüfung nach NICHT_BESTANDEN) — der "aktuelle"
// Stand wird rein abgeleitet, exakt nach demselben Muster wie
// derivePruefstatus() oben: zeitlich neueste Zeile (pruefdatum, sonst
// createdAt als Fallback für noch unentschiedene/frisch angelegte
// Zeilen) je Prüfart gewinnt. Kein Datensatz für eine Prüfart ist KEIN
// Fehlerzustand — bedeutet fachlich schlicht OFFEN (siehe REQ-018
// Grundsatz: "ein fehlender Prüfnachweis gilt ebenfalls als OFFEN").
export function deriveCurrentPruefnachweis(
  records: GgaCabinetPruefnachweisSnapshot[],
  pruefart: GgaPruefart,
): GgaCabinetPruefnachweisSnapshot | null {
  const relevant = [...records]
    .filter((record) => record.pruefart === pruefart)
    .sort((a, b) => (b.pruefdatum ?? b.createdAt).getTime() - (a.pruefdatum ?? a.createdAt).getTime())
  return relevant[0] ?? null
}

// OFFEN und NICHT_BESTANDEN gelten beide als nicht erfüllt — nur BESTANDEN
// erfüllt eine erforderliche Prüfung (REQ-018 A3/A4/A7).
export function isGgaPruefartBestanden(records: GgaCabinetPruefnachweisSnapshot[], pruefart: GgaPruefart): boolean {
  return deriveCurrentPruefnachweis(records, pruefart)?.ergebnis === 'BESTANDEN'
}

export const GGA_PRUEFART_LABELS: Record<GgaPruefart, string> = {
  LUEFTUNG: 'Lüftung', ELEKTRO: 'Elektro', VDE: 'VDE',
}

export const GGA_PRUEFERGEBNIS_LABELS: Record<GgaPruefergebnis, string> = {
  OFFEN: 'Offen', BESTANDEN: 'Bestanden', NICHT_BESTANDEN: 'Nicht bestanden',
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

// REQ-014: wie ggaCabinetBrauchtAufmerksamkeit, ergänzt um
// betriebsstatus === 'UEBERFAELLIG'. Bekannte Lücke der obigen, unveränderten
// REQ-012-Bedingung: eine abgelaufene Prüffrist allein (ohne zusätzlichen
// offenen Blocker/ausstehende Freigabe) löst dort kein aufmerksamkeitErforderlich
// aus, obwohl der GGA Control Tower "überfällig" explizit als eigene
// Sicherheits-Kennzahl verlangt. Bewusst NICHT in ggaCabinetBrauchtAufmerksamkeit
// selbst korrigiert (kein Wiederaufgreifen von REQ-011–013) — stattdessen hier
// um genau dieses eine, bereits vorhandene Signal ergänzt.
export function ggaCabinetIstDringend(item: DerivedGgaCabinetStatus): boolean {
  return ggaCabinetBrauchtAufmerksamkeit(item) || item.betriebsstatus === 'UEBERFAELLIG'
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
  // GGA-Portal Produktblock 4: die userId hinter "verantwortlich" (sofern
  // bekannt) — ausschließlich für MASSNAHME/MANGEL gesetzt, weil nur
  // CollaborationTask/-Blocker ein zuverlässiges responsibleMembershipId
  // haben. Alle anderen Eintragstypen (Prüfung/Freigabe/Nachprüfung/
  // Beanstandung/generischer Fallback) haben in diesem Datenmodell KEINEN
  // zuverlässigen Einzel-Verantwortlichen (CollaborationApproval hat gar
  // kein responsibleMembershipId, GgaCabinetPruefnachweis auch nicht) —
  // bleiben deshalb bewusst null, statt eine Zuordnung zu erfinden.
  verantwortlichUserId: string | null
  urgency: GgaWorklistUrgency
  ueberfaellig: boolean
  // Nur innerhalb urgency===4 relevant: Frist liegt innerhalb des kurzen
  // Vorlaufs (siehe AUFGABE_DEMNAECHST_VORLAUF_TAGE) — rein visuelle
  // Zusatzinformation, ändert nie die Sortierklasse selbst.
  baldFaellig: boolean
}

export type GgaWorklistCabinetTask = { id: string; title: string; dueDate: Date | null; verantwortlich: string | null; verantwortlichUserId?: string | null }
export type GgaWorklistCabinetBlocker = { id: string; title: string; verantwortlich: string | null; verantwortlichUserId?: string | null }

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

// GGA-Portal Produktblock 7 Abschnitt 8: exportiert (war zuvor datei-lokal),
// damit die persönliche Arbeitsoberfläche (/collaboration/my-work) dieselbe
// Fristigkeits-Einstufung für Projekt-/Phasen-Aufgaben (ohne cabinetId)
// wiederverwenden kann, statt eine zweite, konkurrierende Priorität-Engine
// zu bauen — identische Regel wie für Schrank-Maßnahmen.
export function tagesUrgency(dueDate: Date, now: Date): { urgency: GgaWorklistUrgency; ueberfaellig: boolean; baldFaellig: boolean } {
  if (dueDate.getTime() < now.getTime()) return { urgency: 1, ueberfaellig: true, baldFaellig: false }
  if (istGleicherKalendertag(dueDate, now)) return { urgency: 3, ueberfaellig: false, baldFaellig: false }
  const tageBisFaellig = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return { urgency: 4, ueberfaellig: false, baldFaellig: tageBisFaellig <= AUFGABE_DEMNAECHST_VORLAUF_TAGE }
}

export function deriveGgaProjectWorklist(cabinets: GgaWorklistCabinetInput[], now = new Date()): GgaWorklistEntry[] {
  const entries: GgaWorklistEntry[] = []
  const sicherheitsrelevant = (title: string, type: GgaWorklistEntryType, cabinet: GgaWorklistCabinetInput) =>
    entries.push({ cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort, title, type, dueDate: null, verantwortlich: null, verantwortlichUserId: null, urgency: 2 as const, ueberfaellig: false, baldFaellig: false })

  for (const cabinet of cabinets) {
    const usedTitles = new Set<string>()

    for (const blocker of cabinet.openBlockers) {
      usedTitles.add(blocker.title)
      entries.push({
        cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort,
        title: blocker.title, type: 'MANGEL', dueDate: null, verantwortlich: blocker.verantwortlich, verantwortlichUserId: blocker.verantwortlichUserId ?? null,
        urgency: 2, ueberfaellig: false, baldFaellig: false,
      })
    }

    for (const task of cabinet.openRequiredTasks) {
      usedTitles.add(task.title)
      const { urgency, ueberfaellig, baldFaellig } = task.dueDate ? tagesUrgency(task.dueDate, now) : { urgency: 6 as const, ueberfaellig: false, baldFaellig: false }
      entries.push({
        cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort,
        title: task.title, type: 'MASSNAHME', dueDate: task.dueDate, verantwortlich: task.verantwortlich, verantwortlichUserId: task.verantwortlichUserId ?? null,
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
      entries.push({ cabinetId: cabinet.id, kennung: cabinet.kennung, standort: cabinet.standort, title, type: 'PRUEFUNG_UEBERFAELLIG', dueDate: null, verantwortlich: null, verantwortlichUserId: null, urgency: 1, ueberfaellig: true, baldFaellig: false })
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
        title: cabinet.status.naechsteAktion, type: 'NAECHSTE_AKTION', dueDate: null, verantwortlich: null, verantwortlichUserId: null,
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

// ── Projektübergreifender GGA Control Tower (REQ-014) ────────────────────
// Reine Aggregation über bereits abgeleitete Einzelschrank-Status, genau wie
// deriveGgaCabinetControlTowerSummary() (REQ-012), nur projektübergreifend.
// Keine neue Statuslogik, keine DB-Zugriffe — der Service liefert die pro
// Schrank bereits abgeleiteten Werte inkl. Projektbezug an.

export type GgaControlTowerCabinetEntry = {
  id: string; kennung: string; standort: string | null; projectId: string; projectNumber: string | null; projectName: string
  // GGA-Portal-Weiterentwicklung: welche Prüfarten AKTUELL (neueste Zeile je
  // Prüfart, siehe deriveCurrentPruefnachweis()) NICHT_BESTANDEN sind — reine
  // Zusatzinformation für die Dashboard-Anzeige, KEINE neue fachliche
  // Wahrheit (der zugrunde liegende GgaCabinetPruefnachweis-Datensatz und
  // dessen Ableitung über deriveCurrentPruefnachweis() bleiben unverändert;
  // hier wird nur zusätzlich zusammengefasst, WELCHE Prüfarten das betrifft).
  // Bewusst NICHT Teil von DerivedGgaCabinetStatus/GgaCabinetSnapshot — das
  // bliebe sonst ein Kernmodell, das jeder der zahlreichen deriveCabinetStatus()-
  // Aufrufer (Schrankseite, Freigabe-Gates, Schrankakte, …) zusätzlich mit
  // Prüfnachweis-Daten befüllen müsste, obwohl nur der REQ-014-Control-Tower
  // das hier benötigt.
  nichtBestandenePruefarten: GgaPruefart[]
} & DerivedGgaCabinetStatus

export type GgaControlTowerProjectSummary = GgaCabinetControlTowerSummary & {
  projectId: string
  projectNumber: string | null
  projectName: string
  // Anzahl Schränke mit ggaCabinetHatHandlungsbedarf() === true — konsistent
  // mit dringendeSchraenke unten, anders als das (unveränderte) REQ-012-Feld
  // aufmerksamkeitErforderlich oben, das UEBERFAELLIG allein nicht erfasst.
  dringendeSchraenkeAnzahl: number
}

// Genau die in REQ-014 Phase 4 vorgegebenen sechs Badges, plus eine interne
// Beanstandung (abgelehnte interne Prüfung, noch nicht neu angefordert) —
// ohne diese siebte Badge hätte ein Teil der "dringend"-Menge (nacharbeit-
// Erforderlich über pruefstatus, nicht über betreiberstatus) keinen sichtbaren
// Grund, obwohl Phase 4 verlangt, dass jeder Eintrag einen Grund zeigt.
// GGA-Portal-Weiterentwicklung: drei weitere Badges für je Prüfart NICHT
// BESTANDEN — dieselbe Erweiterung wie oben, nur die Anzeige-Seite.
export type GgaControlTowerReasonBadge =
  | 'UEBERFAELLIG' | 'MANGEL' | 'INTERNE_BEANSTANDUNG' | 'NACHPRUEFUNG' | 'INTERNE_FREIGABE' | 'BETREIBERFREIGABE' | 'BETREIBERBEANSTANDUNG'
  | 'LUEFTUNG_NICHT_BESTANDEN' | 'ELEKTRO_NICHT_BESTANDEN' | 'VDE_NICHT_BESTANDEN'

export const GGA_CONTROL_TOWER_REASON_LABELS: Record<GgaControlTowerReasonBadge, string> = {
  UEBERFAELLIG: 'Überfällig',
  MANGEL: 'Mangel',
  INTERNE_BEANSTANDUNG: 'Beanstandung (intern)',
  NACHPRUEFUNG: 'Nachprüfung',
  INTERNE_FREIGABE: 'Interne Freigabe',
  BETREIBERFREIGABE: 'Betreiberfreigabe',
  BETREIBERBEANSTANDUNG: 'Betreiberbeanstandung',
  LUEFTUNG_NICHT_BESTANDEN: 'Lüftung nicht bestanden',
  ELEKTRO_NICHT_BESTANDEN: 'Elektro nicht bestanden',
  VDE_NICHT_BESTANDEN: 'VDE nicht bestanden',
}

// GGA-Portal-Weiterentwicklung: erweitert ggaCabinetIstDringend() um die
// Prüfnachweis-NICHT_BESTANDEN-Signale, OHNE die bestehende, bereits an
// anderer Stelle genutzte Funktion selbst zu verändern (ggaCabinetIstDringend
// bleibt exakt wie vor REQ-014/GGA-05.1 definiert). Ausschließlich für den
// REQ-014-Control-Tower (GgaControlTowerCabinetEntry) — berührt keine
// REQ-015.x-Freigabe-/Completion-Gates, die ausschließlich pruefstatus
// (aus entschiedenen CollaborationApproval-Zeilen) lesen, nie diese Funktion.
export function ggaCabinetHatHandlungsbedarf(cabinet: GgaControlTowerCabinetEntry): boolean {
  return ggaCabinetIstDringend(cabinet) || cabinet.nichtBestandenePruefarten.length > 0
}

// Rangfolge ausschließlich für die Anzeige-Sortierung der "Dringende
// GGA-Schränke"-Liste — eigene, transparente Darstellungsreihenfolge, ändert
// keinen Workflow-Zustand und keine Freigabe-/Prüf-Priorität. GGA-Portal
// Produktblock 2: Ränge 1-3 gelten zusätzlich als "kritisch" (siehe
// deriveGgaCabinetPresentationStatus() unten) — export, damit dort keine
// zweite, parallele Rangliste entsteht.
export const GGA_CONTROL_TOWER_REASON_RANK: Record<GgaControlTowerReasonBadge, number> = {
  UEBERFAELLIG: 1,
  MANGEL: 2, LUEFTUNG_NICHT_BESTANDEN: 2, ELEKTRO_NICHT_BESTANDEN: 2, VDE_NICHT_BESTANDEN: 2,
  INTERNE_BEANSTANDUNG: 3, BETREIBERBEANSTANDUNG: 3,
  NACHPRUEFUNG: 4, INTERNE_FREIGABE: 5, BETREIBERFREIGABE: 6,
}

// GGA-Portal Produktblock 2: exportiert (war zuvor file-lokal), damit sowohl
// deriveGgaCabinetPresentationStatus() als auch die direkte Aktionswahl
// (direkteGgaCabinetAktion()) dieselbe, bereits für die Handlungsbedarf-Badges
// verwendete Gründe-Ableitung wiederverwenden — keine zweite Berechnung.
export function ggaControlTowerReasons(item: GgaControlTowerCabinetEntry): GgaControlTowerReasonBadge[] {
  const reasons: GgaControlTowerReasonBadge[] = []
  if (item.betriebsstatus === 'UEBERFAELLIG') reasons.push('UEBERFAELLIG')
  if (item.offeneBlocker > 0) reasons.push('MANGEL')
  if (item.nichtBestandenePruefarten.includes('LUEFTUNG')) reasons.push('LUEFTUNG_NICHT_BESTANDEN')
  if (item.nichtBestandenePruefarten.includes('ELEKTRO')) reasons.push('ELEKTRO_NICHT_BESTANDEN')
  if (item.nichtBestandenePruefarten.includes('VDE')) reasons.push('VDE_NICHT_BESTANDEN')
  if (item.nacharbeitErforderlich && item.pruefstatus === 'BEANSTANDET') reasons.push('INTERNE_BEANSTANDUNG')
  if (item.betreiberbeanstandung) reasons.push('BETREIBERBEANSTANDUNG')
  if (item.betriebsstatus === 'NACHPRUEFUNG_ERFORDERLICH') reasons.push('NACHPRUEFUNG')
  if (item.freigabeOffen) reasons.push('INTERNE_FREIGABE')
  if (item.betreiberfreigabeAusstehend) reasons.push('BETREIBERFREIGABE')
  return reasons
}

// GGA-Portal Produktblock 2: welche Gründe konkrete Prüf-/Freigabearbeit auf
// der bestehenden Prüfungs-/Abnahmeseite bedeuten (dort werden laut Seite
// auch Nachprüfung, interne Freigabe UND Betreiberfreigabe angefordert/
// entschieden — siehe app/(collaboration)/collaboration/cabinets/[id]/
// pruefung/page.tsx: canRequestBetreiberfreigabe, betreiberstatus). MANGEL
// bleibt bewusst ausgeschlossen — Blocker werden auf der Schrankseite selbst
// gelöst (GgaCabinetBlockerList dort, nicht auf /pruefung).
export function istGgaPruefpfad(gruende: GgaControlTowerReasonBadge[]): boolean {
  return gruende.some((g) => g === 'UEBERFAELLIG' || g === 'NACHPRUEFUNG' || g === 'INTERNE_FREIGABE' || g === 'INTERNE_BEANSTANDUNG'
    || g === 'BETREIBERFREIGABE' || g === 'BETREIBERBEANSTANDUNG'
    || g === 'LUEFTUNG_NICHT_BESTANDEN' || g === 'ELEKTRO_NICHT_BESTANDEN' || g === 'VDE_NICHT_BESTANDEN')
}

// Direkte Aktion für einen Handlungsbedarf-Eintrag (nur cabinetId + bereits
// abgeleitete Gründe bekannt, z. B. GgaControlTowerUrgentCabinet).
export function direkteGgaHandlungsbedarfAktion(cabinetId: string, gruende: GgaControlTowerReasonBadge[]): { href: string; label: string } {
  return istGgaPruefpfad(gruende)
    ? { href: `/collaboration/cabinets/${cabinetId}/pruefung`, label: 'Prüfung öffnen' }
    : { href: `/collaboration/cabinets/${cabinetId}`, label: 'Schrank öffnen' }
}

// Direkte Aktion für einen vollständigen Schrank-Eintrag (Schrank-Arbeits-
// liste/-matrix, kein gruende-Kontext vorausgesetzt) — leitet dieselben
// Gründe über ggaControlTowerReasons() ab, damit beide Funktionen niemals
// auseinanderlaufen können.
//
// GGA-Portal Produktblock 3 Abschnitt 11 (bekannter Fund aus Produktblock 2):
// betriebsstatus ERSTPRUEFUNG_ERFORDERLICH kann auftreten, bevor lifecycleStage
// PRUEFUNG_ABNAHME erreicht ist (Beispiel QA-TEST-018.1-001: lifecycleStage
// noch PLANUNG, aber pruefstatus bereits GEPLANT — kein offener Blocker/
// keine offene Pflichtaufgabe/kein offener Checklistenpunkt mehr). In diesem
// Fall lieferte istGgaPruefpfad(ggaControlTowerReasons(...)) bislang `false`
// (keiner der Gründe-Badges trifft zu), obwohl naechsteAktion bereits
// eindeutig "Prüfung planen"/"Prüfung durchführen" sagt.
//
// Diese beiden Texte erscheinen in deriveCabinetStatus() AUSSCHLIESSLICH,
// wenn kein Blocker/keine offene Aufgabe/kein offener Checklistenpunkt mehr
// vorliegt UND die Bestandsaufnahme abgeschlossen ist (siehe naechsteAktion
// oben) — der einzige eindeutig abgeleitete nächste Schritt ist dann
// tatsächlich die Prüfung. Die Prüfseite selbst sperrt diesen Zugriff
// fachlich NICHT: app/.../cabinets/[id]/pruefung/page.tsx zeigt bei noch
// offener Planung/Umsetzung nur einen Hinweistext (lifecycleWarning), lässt
// die Seite aber vollständig bedienbar — kein Server-Guard verlangt
// lifecycleStage === 'PRUEFUNG_ABNAHME'. Diese Erweiterung umgeht also keine
// fachliche Workflow-Sperre, sie führt nur früher zu einer ohnehin bereits
// zulässigen Seite. Für alle anderen Fälle (z. B. lifecycleStage BESTAND/
// PLANUNG mit noch offener Bestandsaufnahme/Aufgabe) bleibt das bisherige
// Verhalten unverändert (→ Schrankseite).
export function direkteGgaCabinetAktion(cabinet: GgaControlTowerCabinetEntry): { href: string; label: string } {
  const gehtZurPruefung = istGgaPruefpfad(ggaControlTowerReasons(cabinet))
    || cabinet.naechsteAktion === 'Prüfung planen' || cabinet.naechsteAktion === 'Prüfung durchführen'
  return gehtZurPruefung
    ? { href: `/collaboration/cabinets/${cabinet.id}/pruefung`, label: 'Prüfung' }
    : { href: `/collaboration/cabinets/${cabinet.id}`, label: 'Öffnen' }
}

// Vokabular aus dem Auftrag (GGA-Portal-Weiterentwicklung Abschnitt 5 /
// Produktblock 2 Abschnitt 7): bei nicht bestandener Prüfart den konkreten
// nächsten Schritt nennen, statt der generischen naechsteAktion-Fallback-
// Meldung (z. B. "Maßnahmen abgeschlossen"). Reine UI-Übersetzung von bereits
// vorhandenen Daten (nichtBestandenePruefarten) — keine neue Statuslogik.
// Für ALLE anderen Fälle bleibt naechsteAktion (deriveCabinetStatus(),
// bereits datengetrieben aus echten Blocker-/Aufgaben-/Checklistentiteln)
// unverändert die Quelle — hier wird nichts zweites berechnet.
export const GGA_PRUEFART_NAECHSTER_SCHRITT: Record<GgaPruefart, string> = {
  LUEFTUNG: 'Lüftungsprüfung durchführen',
  ELEKTRO: 'Elektroprüfung durchführen',
  VDE: 'VDE-Prüfung durchführen',
}
export function naechsterSchrittFuerCabinet(cabinet: Pick<GgaControlTowerCabinetEntry, 'naechsteAktion' | 'nichtBestandenePruefarten'>): string {
  if (cabinet.nichtBestandenePruefarten.length > 0) {
    return cabinet.nichtBestandenePruefarten.map((pruefart) => GGA_PRUEFART_NAECHSTER_SCHRITT[pruefart]).join(' · ')
  }
  return cabinet.naechsteAktion
}

// GGA-Portal Produktblock 3/4: direkte Aktion je Handlungsbedarf-/Worklist-
// Eintrag, abgeleitet aus dem bereits vorhandenen Eintragstyp (REQ-013,
// deriveGgaProjectWorklist) — verlinkt ausschließlich auf bereits bestehende
// Seiten/Ankerpunkte der Schrankseite, keine neue Bearbeitungsseite. Immer
// vollständige Pfade (nicht nur "#anchor"), damit dieselbe Funktion sowohl
// von der Schrankseite selbst (Produktblock 3) als auch von schrankübergreifenden
// Seiten wie "Meine Arbeit" (Produktblock 4) verwendet werden kann.
export function direktAktionFuerWorklistTyp(type: GgaWorklistEntryType, cabinetId: string, bestandsaufnahmeAbgeschlossen: boolean): { href: string; label: string } {
  switch (type) {
    case 'MASSNAHME': return { href: `/collaboration/cabinets/${cabinetId}#massnahmen`, label: 'Maßnahme öffnen' }
    case 'MANGEL': return { href: `/collaboration/cabinets/${cabinetId}#blocker`, label: 'Blocker öffnen' }
    case 'NAECHSTE_AKTION': return bestandsaufnahmeAbgeschlossen
      ? { href: `/collaboration/cabinets/${cabinetId}/pruefung`, label: 'Prüfung öffnen' }
      : { href: `/collaboration/cabinets/${cabinetId}/bestandsaufnahme`, label: 'Bestandsaufnahme öffnen' }
    default: return { href: `/collaboration/cabinets/${cabinetId}/pruefung`, label: 'Prüfung öffnen' }
  }
}

// ── Projekt-/Phasen-Arbeit ohne Schrankbezug (GGA-Portal Produktblock 7) ──
// Schließt die bekannte Scope-Lücke aus Produktblock 4: CollaborationTask/
// -Blocker OHNE cabinetId (Projekt- oder Phasenarbeit, z. B. ein Blocker wie
// "GVS Massname" direkt an einer Projektphase) wurden bislang komplett aus
// "Meine Arbeit" gefiltert. Dieselbe REQ-013-Grundregel (Kritisch → Über-
// fällig → Handlungsbedarf → regulär offen, exakt dieselbe tagesUrgency()-
// Fristigkeit wie bei Schrank-Maßnahmen) wird hier auf den nicht-cabinet-
// gebundenen Fall angewendet — keine zweite, konkurrierende Prioritäts-
// Engine. Exportiert (statt Seiten-lokal), weil Abschnitt 13 echtes
// Verhalten mit konstruierten Fixtures prüft, nicht nur Quelltext.
export type GgaProjektPhasenTaskInput = {
  id: string
  title: string
  status: string
  isRequired: boolean
  dueDate: Date | null
  cabinetId: string | null
  stage: { title: string }
  project: { id: string; projectNumber: string | null; name: string }
  responsibleMembership: { userId: string } | null
}
export type GgaProjektPhasenBlockerInput = {
  id: string
  title: string
  status: string
  cabinetId: string | null
  stage: { title: string } | null
  project: { id: string; projectNumber: string | null; name: string }
  responsibleMembership: { userId: string } | null
}
export type GgaProjektPhasenEntryType = 'PROJEKT_MASSNAHME' | 'PROJEKT_MANGEL'
export type GgaProjektPhasenWorklistEntry = {
  id: string
  type: GgaProjektPhasenEntryType
  projectId: string
  projectNumber: string | null
  projectName: string
  stageTitle: string | null
  title: string
  dueDate: Date | null
  urgency: GgaWorklistUrgency
  ueberfaellig: boolean
  zustaendigkeit: 'MEINE' | 'TEAM'
  praesentationsStatus: GgaPresentationStatus
  aktion: { href: string; label: string }
}

// Abschnitt 7: navigiert ausschließlich zu den bereits bestehenden Projekt-
// seiten-Ankern (#aufgaben/#blocker, siehe Produktblock 2/5) — keine neue
// Detailroute nur für Produktblock 7.
export function direktAktionFuerProjektArbeit(type: GgaProjektPhasenEntryType, projectId: string): { href: string; label: string } {
  return type === 'PROJEKT_MASSNAHME'
    ? { href: `/collaboration/projects/${projectId}#aufgaben`, label: 'Aufgabe öffnen' }
    : { href: `/collaboration/projects/${projectId}#blocker`, label: 'Blocker öffnen' }
}

// Abschnitt 8: dünne Präsentations-Normalisierung — anders als bei einem GGA-
// Schrank gibt es kein aggregiertes "Objekt", dessen Gesamtstatus abgeleitet
// werden könnte; der einzelne Arbeitspunkt IST hier das Objekt. Ein offener
// Blocker erhält dieselbe Schwere wie ein Schrank-Mangel (KRITISCH); eine
// überfällige Aufgabe HANDLUNGSBEDARF, eine reguläre Aufgabe IM_PLAN —
// dasselbe bestehende GgaPresentationStatus-Vokabular, keine neue Statuslogik.
export function praesentationsStatusFuerProjektArbeit(type: GgaProjektPhasenEntryType, ueberfaellig: boolean): GgaPresentationStatus {
  if (type === 'PROJEKT_MANGEL') return 'KRITISCH'
  return ueberfaellig ? 'HANDLUNGSBEDARF' : 'IM_PLAN'
}

// Abschnitt 3/4/5: eine echte, persistierte responsibleMembershipId ist die
// einzige zulässige Quelle für "Meine Aufgabe" (Abschnitt 3) — Projekt-
// mitgliedschaft, Stage-Zugehörigkeit oder sonstige Proxys bleiben bewusst
// unberücksichtigt. cabinetId ist hier NIE ein Pflichtfilter mehr (Abschnitt
// 4): task/blocker.cabinetId === null schließt einen sichtbaren, offenen,
// zugewiesenen Arbeitspunkt nicht mehr aus. Filtert intern selbst nach
// cabinetId===null + offen-Status, damit die Funktion für sich genommen
// direkt mit konstruierten Fixtures testbar ist (T1-T12).
export function deriveGgaProjektPhasenWorklist(
  tasks: GgaProjektPhasenTaskInput[],
  blockers: GgaProjektPhasenBlockerInput[],
  currentUserId: string,
  now = new Date(),
): GgaProjektPhasenWorklistEntry[] {
  const taskEntries: GgaProjektPhasenWorklistEntry[] = tasks
    .filter((task) => !task.cabinetId && task.isRequired && !['DONE', 'SKIPPED'].includes(task.status))
    .map((task) => {
      const { urgency, ueberfaellig } = task.dueDate ? tagesUrgency(task.dueDate, now) : { urgency: 6 as const, ueberfaellig: false }
      return {
        id: `task-${task.id}`, type: 'PROJEKT_MASSNAHME' as const,
        projectId: task.project.id, projectNumber: task.project.projectNumber, projectName: task.project.name,
        stageTitle: task.stage.title, title: task.title, dueDate: task.dueDate, urgency, ueberfaellig,
        zustaendigkeit: task.responsibleMembership?.userId === currentUserId ? 'MEINE' as const : 'TEAM' as const,
        praesentationsStatus: praesentationsStatusFuerProjektArbeit('PROJEKT_MASSNAHME', ueberfaellig),
        aktion: direktAktionFuerProjektArbeit('PROJEKT_MASSNAHME', task.project.id),
      }
    })
  const blockerEntries: GgaProjektPhasenWorklistEntry[] = blockers
    .filter((blocker) => !blocker.cabinetId && blocker.status === 'OPEN')
    .map((blocker) => ({
      id: `blocker-${blocker.id}`, type: 'PROJEKT_MANGEL' as const,
      projectId: blocker.project.id, projectNumber: blocker.project.projectNumber, projectName: blocker.project.name,
      stageTitle: blocker.stage?.title ?? null, title: blocker.title, dueDate: null, urgency: 2 as GgaWorklistUrgency, ueberfaellig: false,
      zustaendigkeit: blocker.responsibleMembership?.userId === currentUserId ? 'MEINE' as const : 'TEAM' as const,
      praesentationsStatus: praesentationsStatusFuerProjektArbeit('PROJEKT_MANGEL', false),
      aktion: direktAktionFuerProjektArbeit('PROJEKT_MANGEL', blocker.project.id),
    }))
  return [...taskEntries, ...blockerEntries]
}

export type GgaControlTowerUrgentCabinet = {
  cabinetId: string
  kennung: string
  projectId: string
  projectNumber: string | null
  projectName: string
  standort: string | null
  lifecycleStage: GgaCabinetLifecycleStage
  betriebsstatus: GgaCabinetBetriebsstatus
  betriebsstatusTageBisFaellig: number | null
  naechsteAktion: string
  gruende: GgaControlTowerReasonBadge[]
  // Wie aktuellerGgaFortschritt() unten — für "Phase · Fortschritt" in der
  // Handlungsbedarf-Anzeige, ohne dass die UI selbst zwischen den vier
  // Phasen-Fortschrittsfeldern wählen muss.
  fortschritt: number | null
  // Durchgereicht wie oben bei GgaControlTowerCabinetEntry — damit die UI bei
  // nicht bestandener Prüfart einen spezifischeren "Nächster Schritt" zeigen
  // kann (z. B. "VDE-Prüfung durchführen") statt nur des generischen
  // naechsteAktion-Fallbacks (der bei noch unvollständiger Checkliste z. B.
  // "Maßnahmen abgeschlossen" zeigen kann, unabhängig vom eigentlichen Grund).
  nichtBestandenePruefarten: GgaPruefart[]
}

export type GgaControlTowerOverview = {
  aktiveGgaProjekte: number
  gesamt: GgaCabinetControlTowerSummary
  projekte: GgaControlTowerProjectSummary[]
  dringendeSchraenke: GgaControlTowerUrgentCabinet[]
  // GGA-Portal-Arbeitsoberfläche: dieselben, bereits abgeleiteten Einträge,
  // die auch dringendeSchraenke speist — hier vollständig (nicht nur die
  // dringenden), für die projektübergreifende, priorisierte Arbeitsliste auf
  // /collaboration/my-work (GGA-Portal Produktblock 6: nicht mehr zusätzlich
  // im Dashboard dupliziert). Keine neue Berechnung, nur zusätzliche
  // Rückgabe bereits vorhandener Werte. Sortierung: dringend zuerst (deckt
  // sich mit dringendeSchraenke), sonst alphabetisch nach Kennung.
  alleSchraenke: GgaControlTowerCabinetEntry[]
}

export function deriveGgaControlTowerOverview(
  cabinets: GgaControlTowerCabinetEntry[],
  activeProjectIds: ReadonlySet<string>,
): GgaControlTowerOverview {
  const gesamt = deriveGgaCabinetControlTowerSummary(cabinets)

  const byProject = new Map<string, GgaControlTowerCabinetEntry[]>()
  for (const cabinet of cabinets) {
    const list = byProject.get(cabinet.projectId)
    if (list) list.push(cabinet)
    else byProject.set(cabinet.projectId, [cabinet])
  }

  const projekte: GgaControlTowerProjectSummary[] = Array.from(byProject.entries()).map(([projectId, projectCabinets]) => {
    const summary = deriveGgaCabinetControlTowerSummary(projectCabinets)
    const first = projectCabinets[0]
    const dringendeSchraenkeAnzahl = projectCabinets.filter(ggaCabinetHatHandlungsbedarf).length
    return { ...summary, projectId, projectNumber: first.projectNumber, projectName: first.projectName, dringendeSchraenkeAnzahl }
  })

  // Sortierung exakt nach REQ-014 Phase 3: 1) sicherheitsrelevante
  // Aufmerksamkeit zuerst, 2) meiste überfällige Schränke, 3) meiste offene
  // Mängel, 4) Nachprüfung erforderlich, 5) stabil nach Projektnummer/-name.
  projekte.sort((a, b) => {
    const aAufmerksamkeit = a.dringendeSchraenkeAnzahl > 0 ? 0 : 1
    const bAufmerksamkeit = b.dringendeSchraenkeAnzahl > 0 ? 0 : 1
    if (aAufmerksamkeit !== bAufmerksamkeit) return aAufmerksamkeit - bAufmerksamkeit
    if (a.ueberfaellig !== b.ueberfaellig) return b.ueberfaellig - a.ueberfaellig
    if (a.mitBlocker !== b.mitBlocker) return b.mitBlocker - a.mitBlocker
    if (a.nachpruefungErforderlich !== b.nachpruefungErforderlich) return b.nachpruefungErforderlich - a.nachpruefungErforderlich
    return (a.projectNumber ?? '').localeCompare(b.projectNumber ?? '') || a.projectName.localeCompare(b.projectName)
  })

  const dringendeSchraenke: GgaControlTowerUrgentCabinet[] = cabinets
    .filter(ggaCabinetHatHandlungsbedarf)
    .map((cabinet) => ({
      cabinetId: cabinet.id, kennung: cabinet.kennung, projectId: cabinet.projectId, projectNumber: cabinet.projectNumber, projectName: cabinet.projectName,
      standort: cabinet.standort, lifecycleStage: cabinet.lifecycleStage, betriebsstatus: cabinet.betriebsstatus,
      betriebsstatusTageBisFaellig: cabinet.betriebsstatusTageBisFaellig, naechsteAktion: cabinet.naechsteAktion,
      gruende: ggaControlTowerReasons(cabinet), fortschritt: aktuellerGgaFortschritt(cabinet),
      nichtBestandenePruefarten: cabinet.nichtBestandenePruefarten,
    }))
    .sort((a, b) => {
      const rankA = Math.min(...a.gruende.map((reason) => GGA_CONTROL_TOWER_REASON_RANK[reason]))
      const rankB = Math.min(...b.gruende.map((reason) => GGA_CONTROL_TOWER_REASON_RANK[reason]))
      if (rankA !== rankB) return rankA - rankB
      return a.kennung.localeCompare(b.kennung) || a.cabinetId.localeCompare(b.cabinetId)
    })

  const aktiveGgaProjekte = Array.from(byProject.keys()).filter((projectId) => activeProjectIds.has(projectId)).length

  const alleSchraenke = [...cabinets].sort((a, b) => {
    const aDringend = ggaCabinetHatHandlungsbedarf(a) ? 0 : 1
    const bDringend = ggaCabinetHatHandlungsbedarf(b) ? 0 : 1
    if (aDringend !== bDringend) return aDringend - bDringend
    return a.kennung.localeCompare(b.kennung) || a.id.localeCompare(b.id)
  })

  return { aktiveGgaProjekte, gesamt, projekte, dringendeSchraenke, alleSchraenke }
}

// GGA-Portal-Weiterentwicklung: reine Anzeige-Auswahl, WELCHER der vier
// bereits abgeleiteten Fortschrittswerte (bestandsaufnahmeFortschritt/
// planungsfortschritt/montagefortschritt/abnahmeChecklistFortschritt) zur
// aktuellen Phase passt — keine neue Berechnung, deriveCabinetStatus()
// liefert alle vier bereits.
export function aktuellerGgaFortschritt(status: Pick<DerivedGgaCabinetStatus, 'lifecycleStage' | 'bestandsaufnahmeFortschritt' | 'planungsfortschritt' | 'montagefortschritt' | 'abnahmeChecklistFortschritt'>): number | null {
  switch (status.lifecycleStage) {
    case 'BESTAND': return status.bestandsaufnahmeFortschritt
    case 'PLANUNG': return status.planungsfortschritt
    case 'UMSETZUNG': return status.montagefortschritt
    case 'PRUEFUNG_ABNAHME': return status.abnahmeChecklistFortschritt
    case 'ABGESCHLOSSEN': return 100
  }
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

// ── GGA-Portal Produktblock 1+2: geteilte Status-/Ampel-Sprache ──────────
// Fortschritt (progressPercent/aktuellerGgaFortschritt) und Situation
// (Status/Ampel) müssen laut Auftrag getrennt bleiben — ein Projekt oder
// Schrank kann weit fortgeschritten und trotzdem kritisch sein. Dieser Typ
// und seine Labels/Badge-Klassen sind bewusst NICHT projektspezifisch
// benannt (ursprünglich GgaProjectPresentationStatus, in Produktblock 2
// umbenannt) — Produktblock 2 verlangt explizit dieselbe Sprache auch für
// einzelne Schränke ("Analog zu Produktblock 1", "Gleiche Sprache für
// Statusfarben, Badges"). Die Ableitungen selbst (deriveGgaProjectPresenta-
// tionStatus/deriveGgaCabinetPresentationStatus) bleiben getrennt, weil ihre
// Eingaben fachlich verschieden sind — nur das Ergebnis-Vokabular ist geteilt.
export type GgaPresentationStatus = 'KRITISCH' | 'HANDLUNGSBEDARF' | 'ACHTUNG' | 'IM_PLAN' | 'ABGESCHLOSSEN'

export const GGA_STATUS_LABELS: Record<GgaPresentationStatus, string> = {
  KRITISCH: 'Kritisch',
  HANDLUNGSBEDARF: 'Handlungsbedarf',
  ACHTUNG: 'Achtung',
  IM_PLAN: 'Im Plan',
  ABGESCHLOSSEN: 'Abgeschlossen',
}

export const GGA_STATUS_BADGE_CLASS: Record<GgaPresentationStatus, string> = {
  KRITISCH: 'bg-red-50 text-red-700',
  HANDLUNGSBEDARF: 'bg-orange-100 text-orange-800',
  ACHTUNG: 'bg-amber-50 text-amber-700',
  IM_PLAN: 'bg-emerald-50 text-emerald-700',
  ABGESCHLOSSEN: 'bg-emerald-100 text-emerald-800',
}

// Arbeitsrelevante Sortierung (Produktblock 2 Abschnitt 10): Kritisch vor
// Handlungsbedarf vor Achtung vor "normal in Arbeit" (Im Plan) vor
// Abgeschlossen — der wichtigste Schrank/das wichtigste Projekt steht oben.
export const GGA_PRESENTATION_STATUS_RANK: Record<GgaPresentationStatus, number> = {
  KRITISCH: 1, HANDLUNGSBEDARF: 2, ACHTUNG: 3, IM_PLAN: 4, ABGESCHLOSSEN: 5,
}

// Rangfolge exakt wie im Auftrag (Produktblock 1 Abschnitt 4): KRITISCH
// schlägt HANDLUNGSBEDARF schlägt ACHTUNG schlägt IM PLAN. ABGESCHLOSSEN nur
// bei echtem, fachlichem Projektabschluss (project.status === 'COMPLETED',
// REQ-016) — ausdrücklich NICHT allein aus 100 % Fortschritt abgeleitet, denn
// progressPercent kann 100 erreichen, während z. B. die Betreiberfreigabe noch
// aussteht. Kombiniert nur bereits vorhandene, andernorts abgeleitete Signale
// (project.healthStatus aus calculateProjectHealth()/projectBlocker,
// dringendeSchraenkeAnzahl aus ggaCabinetHatHandlungsbedarf()) — keine neue
// Statuslogik. Absichtlich abhängigkeitsfrei (kein Prisma-Enum-Import) — der
// Aufrufer übergibt bereits das Boolean/den String-Wert.
export function deriveGgaProjectPresentationStatus(input: {
  abgeschlossen: boolean
  healthStatus: 'RED' | 'YELLOW' | 'GREEN'
  dringendeSchraenkeAnzahl: number
}): GgaPresentationStatus {
  if (input.abgeschlossen) return 'ABGESCHLOSSEN'
  if (input.healthStatus === 'RED') return 'KRITISCH'
  if (input.dringendeSchraenkeAnzahl > 0) return 'HANDLUNGSBEDARF'
  if (input.healthStatus === 'YELLOW') return 'ACHTUNG'
  return 'IM_PLAN'
}

// GGA-Portal Produktblock 2 (Abschnitt 6/10): dieselbe Rangfolge, jetzt für
// einen einzelnen Schrank. Wiederverwendet ausschließlich bereits vorhandene
// Ableitungen: ggaControlTowerReasons() (dieselben Gründe wie die
// Handlungsbedarf-Badges) und GGA_CONTROL_TOWER_REASON_RANK (dieselbe
// Schweregrad-Einstufung wie die Sortierung der dringenden Schränke) — kein
// zweites, paralleles Cabinet-State-Machine. Ränge 1-3 (ÜBERFÄLLIG, MANGEL/
// Prüfart NICHT_BESTANDEN, Beanstandung) gelten als "kritisch" — dieselbe
// Schwere, die dort optisch zuerst gruppiert wird. Ränge 4-6 (Nachprüfung,
// interne/Betreiberfreigabe) gelten als "Handlungsbedarf". Ohne jeden Grund,
// aber mit betriebsstatus 'BALD_FAELLIG' (ein Signal, das ggaCabinetHat-
// Handlungsbedarf() bewusst NICHT einschließt, weil es noch keine Aktion
// erfordert) gilt als "Achtung". abgeschlossen wird ERST NACH den
// Kritisch/Handlungsbedarf-Prüfungen ausgewertet: offeneBlocker fließt NICHT
// in lifecycleStage ein (siehe deriveCabinetStatus oben), ein bereits
// lifecycleStage-technisch abgeschlossener Schrank kann also trotzdem einen
// nachträglich erfassten, offenen Blocker haben — der muss weiterhin als
// "Kritisch" erscheinen statt als "Abgeschlossen" zu gelten. (Eine erneut
// überfällige Wiederholungsprüfung hingegen lässt derivePruefstatus() bereits
// selbst von 'BESTANDEN' auf 'UEBERFAELLIG' kippen, wodurch lifecycleStage
// automatisch von ABGESCHLOSSEN zurück auf PRUEFUNG_ABNAHME wechselt — dort
// deckt der normale ÜBERFÄLLIG-Fall das bereits ab, ohne dass abgeschlossen
// dabei je true wäre.)
export function deriveGgaCabinetPresentationStatus(cabinet: GgaControlTowerCabinetEntry): GgaPresentationStatus {
  const gruende = ggaControlTowerReasons(cabinet)
  if (gruende.some((g) => GGA_CONTROL_TOWER_REASON_RANK[g] <= 3)) return 'KRITISCH'
  if (gruende.length > 0) return 'HANDLUNGSBEDARF'
  if (cabinet.betriebsstatus === 'BALD_FAELLIG') return 'ACHTUNG'
  if (cabinet.abgeschlossen) return 'ABGESCHLOSSEN'
  return 'IM_PLAN'
}
