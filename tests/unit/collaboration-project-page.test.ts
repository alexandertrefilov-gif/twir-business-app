import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Collaboration-Projektseite (Projektarbeitsplatz, GGA-Portal Produktblock 2)', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'app/(collaboration)/collaboration/projects/[id]/page.tsx'),
    'utf8',
  )

  it('übersetzt einen verborgenen oder fremden Projektzugriff weiterhin in 404', () => {
    expect(page).toContain("import { notFound } from 'next/navigation'")
    expect(page).toContain('error instanceof NotFoundError')
    expect(page).toContain('notFound()')
  })

  it('lädt Schränke über dieselbe, bereits für das Dashboard gebaute Cross-Projekt-Ableitung (REQ-014), nur auf dieses Projekt gefiltert — kein zweiter Query-Pfad', () => {
    expect(page).toContain("import { getGgaControlTowerOverview } from '@/lib/services/gga-cabinet.service'")
    expect(page).toContain('const gga = await getGgaControlTowerOverview()')
    expect(page).toContain("gga.alleSchraenke.filter((cabinet) => cabinet.projectId === id)")
    expect(page).toContain("gga.dringendeSchraenke.filter((cabinet) => cabinet.projectId === id)")
  })

  it('zeigt den kompakten Projektkopf mit Standort/Bereich und den geforderten GGA-Kennzahlen (keine großen leeren KPI-Karten)', () => {
    expect(page).toContain("[project.location, project.building, project.floor].filter(Boolean).join(' · ')")
    expect(page).toContain('Schränke</p><p className="mt-1 text-xl font-600">{projectCabinets.length}')
    expect(page).toContain('Handlungsbedarf</p><p')
    expect(page).toContain('Prüfungen offen</p><p')
    expect(page).toContain('Freigaben offen</p><p')
    expect(page).toContain('Mängel/Blocker offen</p><p')
  })

  it('zeigt den Phasenfortschritt als reine visuelle Übersetzung von deriveStageStatuses() (✓/●/○/!) — keine neue Stage-Logik', () => {
    expect(page).toContain("COMPLETED: { symbol: '✓'")
    expect(page).toContain("IN_PROGRESS: { symbol: '●'")
    expect(page).toContain("NOT_STARTED: { symbol: '○'")
    expect(page).toContain("BLOCKED: { symbol: '!'")
    expect(page).toContain('STAGE_SYMBOL[entry.stage.derivedStatus].symbol')
  })

  it('zeigt Handlungsbedarf mit Schrank/Bereich/Phase/Grund/nächstem Schritt/direkter Aktion, nur für dieses Projekt', () => {
    expect(page).toContain('const aktion = direkteGgaHandlungsbedarfAktion(cabinet.cabinetId, cabinet.gruende)')
    expect(page).toContain('GGA_LIFECYCLE_STAGE_LABELS[cabinet.lifecycleStage]')
    expect(page).toContain('Nächster Schritt:</span> {naechsterSchrittFuerCabinet(cabinet)}')
    expect(page).toContain('Kein Handlungsbedarf — alle GGA-Schränke dieses Projekts im grünen Bereich.')
  })

  it('zeigt die Schrankmatrix als kompakte Tabelle mit den geforderten Spalten inkl. getrennter Fortschritt/Status-Spalten', () => {
    expect(page).toContain('<th className="px-5 py-2 font-600">Schrank</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Bereich / Ort</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Phase</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Fortschritt</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Status</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Prüfung</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Freigabe</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Nächster Schritt</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Aktion</th>')
  })

  it('trennt Fortschritt und Status/Ampel in der Schrankmatrix strikt (eigene Spalten, eigene Ableitungen)', () => {
    expect(page).toContain('const status = deriveGgaCabinetPresentationStatus(cabinet)')
    expect(page).toContain('<ProgressBar value={aktuellerGgaFortschritt(cabinet)} />')
    expect(page).toContain('GGA_STATUS_BADGE_CLASS[status]')
    expect(page).toContain('GGA_STATUS_LABELS[status]')
  })

  it('verlinkt Schrank und direkte Aktion auf die bereits vorhandenen Seiten (Schrankakte/Prüfung) — keine neue Bearbeitungsseite', () => {
    expect(page).toContain('href={`/collaboration/cabinets/${cabinet.id}`}')
    expect(page).toContain('const aktion = direkteGgaCabinetAktion(cabinet)')
  })

  it('sortiert die Schrankmatrix nach Arbeitsrelevanz (Kritisch vor Handlungsbedarf vor Achtung vor normal vor Abgeschlossen), dann nach Kennung', () => {
    expect(page).toContain('GGA_PRESENTATION_STATUS_RANK[deriveGgaCabinetPresentationStatus(a)]')
    expect(page).toContain('GGA_PRESENTATION_STATUS_RANK[deriveGgaCabinetPresentationStatus(b)]')
    expect(page).toContain("return rankA - rankB || a.kennung.localeCompare(b.kennung)")
  })

  it('bietet die sieben geforderten Filter (inkl. Blockiert) und eine Schranksuche über URL-Query-Parameter, ohne neue Filterarchitektur', () => {
    expect(page).toContain("alle: 'Alle', handlungsbedarf: 'Handlungsbedarf', 'in-arbeit': 'In Arbeit', pruefung: 'Prüfung', freigabe: 'Freigabe', blockiert: 'Blockiert', abgeschlossen: 'Abgeschlossen'")
    expect(page).toContain("case 'blockiert': return cabinet.offeneBlocker > 0")
    expect(page).toContain('<input type="search" name="q" defaultValue={search} placeholder="Schrank suchen …"')
    expect(page).toContain('searchParams: Promise<Record<string, string | string[] | undefined>>')
  })

  it('behandelt "keine Schränke im Projekt" und "keine Schränke in dieser Filteransicht" als zwei unterschiedliche Leerzustände', () => {
    expect(page).toContain('Noch keine GGA-Schränke in diesem Projekt.')
    expect(page).toContain('Keine Schränke in dieser Ansicht.')
  })

  it('behält bestehende Projektfunktionen unverändert bei: Projektphasen mit Stage-Aktionen, Aufgaben, Checkliste, Blocker, Freigaben, Team, Aktivitäten', () => {
    expect(page).toContain('<CollaborationStageActions stage={stage} role={project.role} projectId={project.id} memberships={project.memberships} showCreationForms={canSeeCreationForms} />')
    expect(page).toContain('Aufgaben <span')
    expect(page).toContain('Checkliste <span')
    expect(page).toContain('Offene Blocker <span')
    expect(page).toContain('Ausstehende Freigaben <span')
    expect(page).toContain('Team <span')
    expect(page).toContain('Aktivitätsverlauf')
  })

  it('bietet weiterhin die bestehenden Projektstatus-Übergangsaktionen (REQ-016) unverändert', () => {
    expect(page).toContain('<CollaborationProjectStatusActions projectId={project.id} role={project.role} allowedTransitions={allowedProjectTransitions} />')
    expect(page).toContain('getProjectCompletionBlocker(project.stages) === null')
  })
})

describe('Projekt-Timeline (GGA-Portal Produktblock 5)', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'app/(collaboration)/collaboration/projects/[id]/page.tsx'),
    'utf8',
  )

  it('zeigt aktuelle Phase, Fortschritt, Status/Health und Nächster Schritt bereits im Kopfbereich — nicht neu berechnet, nur zusätzlich angezeigt', () => {
    expect(page).toContain("const aktuellePhase = project.stages.find((stage) => stage.derivedStatus === 'IN_PROGRESS')")
    expect(page).toContain('Aktuelle Phase</p><p className="mt-1 text-sm font-600">{aktuellePhase?.title ??')
    expect(page).toContain('Nächster Schritt</p><p className="mt-1 text-lg font-600 text-stone-900">{project.nextAction}</p>')
  })

  it('bietet für die aktuelle Phase maximal EINE primäre Direktaktion, in derselben Priorität wie deriveNextAction() (blockiert > Freigabe > Aufgabe > Checkliste > Phase)', () => {
    expect(page).toContain('function projektDirekteAktion(')
    expect(page).toContain("if (stages.some((s) => s.derivedStatus === 'BLOCKED') || offeneBlockerAnzahl > 0) return { href: '#blocker'")
    expect(page).toContain("if (stages.some((s) => s.derivedStatus === 'WAITING_FOR_APPROVAL')) return { href: '#freigaben'")
    expect(page).toContain('{direkteAktion && <Link href={direkteAktion.href}')
  })

  it('leitet den Fortschritt je Phase über die zentrale, jetzt in project-workflow.ts exportierte calculateStageProgress() ab und trennt ihn strikt vom derivedStatus — keine falsche 100%-Interpretation, keine zweite Berechnung in der Seite', () => {
    expect(page).toContain('calculateStageProgress, deriveStageDependencyWaitReason,')
    expect(page).toContain('fortschritt: calculateStageProgress(stage),')
    expect(page).toContain('{COLLABORATION_STAGE_STATUS_LABELS[entry.stage.derivedStatus]}')
    expect(page).toContain('{entry.fortschritt}%')
  })

  it('macht Phasenabhängigkeiten sichtbar, ausschließlich über die zentrale deriveStageDependencyWaitReason()/satisfiesRequiredStatus()-Prüfung — keine zweite Dependency-Logik in der Seite', () => {
    expect(page).toContain('const wartetAuf = deriveStageDependencyWaitReason(stage, project.stages, (status) => COLLABORATION_STAGE_STATUS_LABELS[status])')
  })

  it('zeigt offene Punkte/Blocker je Phase und den nächsten relevanten Schritt über getStageCompletionBlocker() — keine zweite Vollständigkeitsprüfung', () => {
    expect(page).toContain('getStageCompletionBlocker,')
    expect(page).toContain('const reason = getStageCompletionBlocker(stage)')
    expect(page).toContain('offene Punkt')
  })

  it('verknüpft Handlungsbedarf mit der Timeline (welche Phase betrifft es), statt ihn zu duplizieren — Klick führt auf die bestehende, gefilterte Schrankmatrix', () => {
    expect(page).toContain('const handlungsbedarfInPhase = schraenkeInPhase.filter(ggaCabinetHatHandlungsbedarf).length')
    expect(page).toContain('href={`/collaboration/projects/${id}?filter=handlungsbedarf#schrankmatrix`}')
  })

  it('zeigt Schränke je Phase nur über die bereits bestehende GGA-05.1-Phasenausrichtung (STAGE_CODE_TO_LIFECYCLE), keine künstliche Stage-Membership', () => {
    expect(page).toContain('const STAGE_CODE_TO_LIFECYCLE: Record<string,')
    expect(page).toContain("KONZEPT: 'BESTAND', PLANUNG: 'PLANUNG', UMSETZUNG: 'UMSETZUNG', ABNAHME: 'PRUEFUNG_ABNAHME', ABSCHLUSS: 'ABGESCHLOSSEN',")
  })

  it('stellt den Aktivitätsverlauf direkt unterhalb der Timeline dar (Abschnitt 6/7), nicht mehr in der unteren Team-Sektion', () => {
    expect(page).toContain('{/* Aktivitätsverlauf (Produktblock 5 Abschnitt 6/7): direkt unterhalb der Timeline')
    const timelineIndex = page.indexOf('Projekt-Timeline (Produktblock 5')
    const activityIndex = page.indexOf('id="activity-title"')
    const schrankmatrixIndex = page.indexOf('id="schrankmatrix"')
    expect(timelineIndex).toBeGreaterThan(-1)
    expect(activityIndex).toBeGreaterThan(timelineIndex)
    expect(activityIndex).toBeLessThan(schrankmatrixIndex)
  })
})
