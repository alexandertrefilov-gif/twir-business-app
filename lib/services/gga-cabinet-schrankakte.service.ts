// Baut die digitale GGA-Schrankakte (Abschnitte A–N) ausschließlich aus
// bereits vorhandenen Daten zusammen — keine neuen Felder, keine zweite
// Datenhaltung, kein zweites PDF-Template. Reine Aggregation für den
// PDF-Export, mit zielgruppenabhängiger Filterung (INTERNAL/OPERATOR).

import { format } from 'date-fns'
import { getGgaCabinetDetail, getGgaCabinetAuditHistory } from '@/lib/services/gga-cabinet.service'
import { getCompanySnapshot } from '@/lib/services/settings.service'
import { loadCompanyLogoForPdf } from '@/lib/services/company-logo-rendering.service'
import { deriveCabinetStatus, GGA_EX_ASSESSMENT_LABELS, GGA_LIFECYCLE_STAGE_LABELS, formatGgaBetriebsstatusLabel } from '@/lib/collaboration/cabinet-workflow'
import type { GgaCabinetSchrankaktePdfData, SchrankakteSection } from '@/lib/pdf-templates/gga-cabinet-schrankakte.template'

export type SchrankakteAudience = 'INTERNAL' | 'OPERATOR'

const taskStatusLabels: Record<string, string> = { TODO: 'Offen', IN_PROGRESS: 'In Arbeit', BLOCKED: 'Blockiert', DONE: 'Erledigt', SKIPPED: 'Übersprungen' }
const approvalStatusLabels: Record<string, string> = { REQUESTED: 'Angefragt', APPROVED: 'Freigegeben', REJECTED: 'Abgelehnt' }
const entityTypeLabels: Record<string, string> = {
  gga_cabinet: 'Schrank', collaboration_task: 'Maßnahme', collaboration_checklist_item: 'Checkliste',
  collaboration_blocker: 'Blocker', collaboration_approval: 'Freigabe', collaboration_document: 'Dokument',
}
// Für audience=OPERATOR erlaubte Historie-Kategorien: technische Prüf-
// Checklisten IMMER, Freigaben/Dokumente NUR mit erkennbar betreiber-
// bezogenem metadata.reason (interne Approval-/Upload-Aktionen setzen dieses
// Feld nicht und fallen dadurch automatisch heraus — keine Positivliste
// einzelner Nutzer/E-Mails nötig).
const EXTERNAL_RELEVANT_DOCUMENT_REASONS = new Set(['Dokument für Betreiber freigegeben'])
const EXTERNAL_RELEVANT_APPROVAL_REASONS = new Set(['Betreiberfreigabe angefordert', 'Betreiberfreigabe erteilt', 'Betreiberfreigabe abgelehnt (Beanstandung)'])

function decimalToStr(value: unknown, unit: string): string {
  return value === null || value === undefined ? '–' : `${value} ${unit}`
}
function fmtDate(date: Date | null): string {
  return date ? format(date, 'dd.MM.yyyy') : '–'
}
function displayName(person: { firstName: string; lastName: string } | null | undefined, fallbackEmail: string | null): string {
  if (person) return `${person.firstName} ${person.lastName}`
  return fallbackEmail ?? 'System'
}

export async function getGgaCabinetSchrankaktePdfData(cabinetId: string, audience: SchrankakteAudience = 'INTERNAL'): Promise<GgaCabinetSchrankaktePdfData> {
  const [cabinet, history, company] = await Promise.all([
    getGgaCabinetDetail(cabinetId),
    getGgaCabinetAuditHistory(cabinetId),
    getCompanySnapshot(),
  ])
  const logo = await loadCompanyLogoForPdf(company.logoStorageKey ?? company.logoPath)

  const status = cabinet.status
  const abnahmeChecklist = cabinet.checklistItems.filter((c) => c.stage.code === 'ABNAHME')
  const findAbnahmeItem = (title: string) => abnahmeChecklist.find((c) => c.title === title)
  const isOperator = audience === 'OPERATOR'

  const sections: SchrankakteSection[] = [
    { key: 'A', title: 'A. Projektdaten', rows: [
      { label: 'Projekt', value: cabinet.project.name },
      { label: 'Projektnummer', value: cabinet.project.projectNumber ?? '–' },
    ] },
    { key: 'B', title: 'B. Schrankidentifikation', rows: [
      { label: 'Kennung', value: cabinet.kennung },
      { label: 'Bezeichnung', value: cabinet.bezeichnung },
      { label: 'Hersteller / Typ', value: [cabinet.herstellerName, cabinet.herstellerTyp].filter(Boolean).join(' ') || '–' },
      { label: 'Seriennummer', value: cabinet.seriennummer ?? '–' },
      { label: 'Baujahr', value: cabinet.baujahr ? String(cabinet.baujahr) : '–' },
      { label: 'Status', value: GGA_LIFECYCLE_STAGE_LABELS[status.lifecycleStage] },
    ] },
    { key: 'C', title: 'C. Standort', rows: [
      { label: 'Gebäude', value: cabinet.gebaeude ?? '–' },
      { label: 'Ebene', value: cabinet.ebene ?? '–' },
      { label: 'Raum', value: cabinet.raumbezeichnung ?? '–' },
      { label: 'Standortbeschreibung', value: cabinet.standortBeschreibung ?? '–' },
    ] },
    { key: 'D', title: 'D. Bestandsaufnahme', rows: [
      { label: 'Status', value: status.bestandsaufnahmeAbgeschlossen ? 'Abgeschlossen' : 'Offen' },
      { label: 'Durchgeführt am', value: fmtDate(cabinet.bestandsaufnahmeAm) },
      // Freitext-Bestandsnotiz kann interne Kommentare enthalten — für den
      // Betreiber nicht ausgegeben.
      ...(isOperator ? [] : [{ label: 'Bestandsnotiz', value: cabinet.bestandsBeschreibung ?? '–' }]),
    ] },
    { key: 'E', title: 'E. Technische Bestandsdaten', rows: [
      { label: 'Nutzungsart', value: cabinet.nutzungsart ?? '–' },
      { label: 'Lagerklasse', value: cabinet.lagerklasse ?? '–' },
      { label: 'Max. Lagermenge', value: decimalToStr(cabinet.maxLagermengeKg, 'kg') },
      { label: 'Abluft vorhanden', value: cabinet.abluftVorhanden ? 'Ja' : 'Nein' },
      { label: 'Abluft-Überwachung', value: cabinet.abluftUeberwachung ? 'Ja' : 'Nein' },
      { label: 'Elektrisch ausgestattet', value: cabinet.elektrischAusgestattet ? 'Ja' : 'Nein' },
      { label: 'Spannung (Bestand)', value: decimalToStr(cabinet.spannungVolt, 'V') },
      { label: 'Potentialausgleich (Bestand)', value: cabinet.potentialausgleich ? 'Vorhanden' : 'Nicht vorhanden' },
      { label: 'Ex-Schutz-Bewertung', value: GGA_EX_ASSESSMENT_LABELS[cabinet.exAssessmentStatus] },
      { label: 'Ex-Zonen-Klassifikation', value: cabinet.exZoneKlassifikation ?? '–' },
    ] },
    { key: 'F', title: 'F. Soll-Planung', rows: [
      { label: 'Anschlussdurchmesser Soll', value: cabinet.abluftAnschlussdurchmesserSollMm ? `${cabinet.abluftAnschlussdurchmesserSollMm} mm` : '–' },
      { label: 'Volumenstrom Soll', value: decimalToStr(cabinet.abluftVolumenstromSollM3h, 'm³/h') },
      { label: 'Prüfintervall', value: cabinet.pruefintervallMonate ? `${cabinet.pruefintervallMonate} Monate` : '–' },
      { label: 'Prüfpflicht-Normbezug', value: cabinet.pruefpflichtNorm ?? '–' },
    ] },
    // G (Maßnahmen) und H (Umsetzung) sind interne Planungsdetails — nicht
    // Bestandteil der externen Schrankakte (siehe externe Schrankdetailseite,
    // die ebenfalls keinen Maßnahmen-Abschnitt zeigt).
    ...(isOperator ? [] : [
      { key: 'G', title: 'G. Maßnahmen', rows: cabinet.tasks.map((t) => ({ label: t.title, value: `${taskStatusLabels[t.status]}${t.dueDate ? ` · fällig ${fmtDate(t.dueDate)}` : ''}${t.responsibleMembership?.user ? ` · ${t.responsibleMembership.user.firstName} ${t.responsibleMembership.user.lastName}` : ''}` })) },
      { key: 'H', title: 'H. Umsetzung', rows: [
        { label: 'Umsetzungsfortschritt', value: status.montagefortschritt === null ? 'Keine Umsetzungs-Maßnahmen' : `${status.montagefortschritt}%` },
        ...cabinet.tasks.filter((t) => t.stage.code === 'UMSETZUNG').map((t) => ({ label: t.title, value: taskStatusLabels[t.status] })),
      ] },
    ] as SchrankakteSection[]),
    { key: 'I', title: 'I. Soll-/Ist-Vergleich', rows: [
      { label: 'Volumenstrom Soll → Ist', value: `${decimalToStr(cabinet.abluftVolumenstromSollM3h, 'm³/h')} → ${decimalToStr(cabinet.abluftVolumenstromIstM3h, 'm³/h')}` },
      { label: 'Anschlussdurchmesser Soll → Umsetzung', value: `${cabinet.abluftAnschlussdurchmesserSollMm ? `${cabinet.abluftAnschlussdurchmesserSollMm} mm` : '–'} → ${status.montagefortschritt === 100 ? 'erledigt' : 'offen'}` },
      { label: 'Ex-Bewertung → Prüfnachweis', value: `${GGA_EX_ASSESSMENT_LABELS[cabinet.exAssessmentStatus]} → ${findAbnahmeItem('Ex-Anforderungen erfüllt')?.completed ? 'geprüft' : 'nicht geprüft'}` },
      { label: 'Elektro/VDE-Anforderung → Prüfnachweis', value: `${cabinet.elektrischAusgestattet ? 'ausgestattet' : 'nicht ausgestattet'} → ${findAbnahmeItem('Elektro/VDE geprüft')?.completed ? 'geprüft' : 'nicht geprüft'}` },
    ] },
    { key: 'J', title: 'J. Prüfung', rows: [
      { label: 'Betriebsstatus', value: formatGgaBetriebsstatusLabel(status.betriebsstatus, status.betriebsstatusTageBisFaellig) },
      { label: 'Letzte Prüfung', value: fmtDate(cabinet.letztePruefungAm) },
      ...abnahmeChecklist.map((c) => ({ label: c.title, value: c.completed ? 'Geprüft' : 'Nicht geprüft' })),
    ] },
    // K: für den Betreiber nur die eigenen Betreiberfreigabe-Runden — keine
    // internen Freigabe-Vorgänge/-Namen.
    { key: 'K', title: 'K. Freigaben', rows: cabinet.approvals
      .filter((a) => !isOperator || a.approvalType === 'OPERATOR_ACCEPTANCE')
      .map((a) => ({
        label: `${a.approvalType === 'OPERATOR_ACCEPTANCE' ? 'Betreiberfreigabe' : a.stage.title} — ${approvalStatusLabels[a.status]}`,
        value: isOperator
          ? `${a.decidedBy ? `Entschieden von ${a.decidedBy.firstName} ${a.decidedBy.lastName}` : 'Noch nicht entschieden'}${a.decisionNote ? ` — ${a.decisionNote}` : ''}`
          : `Angefragt von ${a.requestedBy.firstName} ${a.requestedBy.lastName}${a.decidedBy ? `, entschieden von ${a.decidedBy.firstName} ${a.decidedBy.lastName}` : ''}${a.decisionNote ? ` — ${a.decisionNote}` : ''}`,
      })) },
    // L (Mängel/Nacharbeiten aus internen Blockern) ist für den Betreiber
    // nicht Bestandteil der Akte — die relevante Beanstandungs-Erzählung
    // steckt bereits vollständig in K (abgelehnte Betreiberfreigabe + Grund).
    ...(isOperator ? [] : [
      { key: 'L', title: 'L. Mängel / Nacharbeiten', rows: cabinet.blockers.map((b) => ({ label: b.title, value: `${b.status === 'OPEN' ? 'Offen' : 'Gelöst'}${b.cause ? ` — Ursache: ${b.cause}` : ''}${b.resolution ? ` — Nacharbeit: ${b.resolution}` : ''}` })) },
    ] as SchrankakteSection[]),
    { key: 'M', title: 'M. Dokumente / Fotos', rows: cabinet.documents
      .filter((d) => !isOperator || d.visibility === 'EXTERNAL')
      .map((d) => ({ label: d.originalName, value: `${d.documentKind} · hochgeladen von ${d.uploadedBy.firstName} ${d.uploadedBy.lastName} am ${format(d.createdAt, 'dd.MM.yyyy')}` })) },
  ]

  const historyRows = history
    .filter((entry) => {
      if (!isOperator) return true
      if (entry.entityType === 'collaboration_checklist_item') return true
      if (entry.entityType === 'collaboration_approval') {
        const reason = (entry.metadata as { reason?: string } | null)?.reason
        return !!reason && EXTERNAL_RELEVANT_APPROVAL_REASONS.has(reason)
      }
      if (entry.entityType === 'collaboration_document') {
        const reason = (entry.metadata as { reason?: string } | null)?.reason
        return !!reason && EXTERNAL_RELEVANT_DOCUMENT_REASONS.has(reason)
      }
      return false // gga_cabinet, collaboration_task, collaboration_blocker: intern
    })
    .map((entry) => ({
      at: format(entry.createdAt, 'dd.MM.yyyy HH:mm'),
      bereich: entityTypeLabels[entry.entityType] ?? entry.entityType,
      aktion: entry.action,
      // Anzeigename statt E-Mail — insbesondere für die externe Ansicht.
      von: displayName(entry.user, isOperator ? null : entry.userEmail),
    }))

  return {
    cabinetLabel: `${cabinet.kennung} — ${cabinet.bezeichnung}`,
    projectName: cabinet.project.name,
    generatedAt: format(new Date(), 'dd.MM.yyyy HH:mm'),
    company: { companyName: company.companyName },
    logoDataUri: logo?.dataUri,
    logoScale: company.logoScale,
    logoSourceWidth: logo?.width,
    logoSourceHeight: logo?.height,
    sections,
    historyRows,
  }
}
