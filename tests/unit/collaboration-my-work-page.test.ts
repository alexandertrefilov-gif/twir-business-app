import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('"Meine Arbeit" — persönliche Arbeitsoberfläche (GGA-Portal Produktblock 4)', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'app/(collaboration)/collaboration/my-work/page.tsx'),
    'utf8',
  )

  it('lädt ausschließlich bereits bestehende, bereits autorisierte Aggregationen — keine neue Task-Engine, kein neuer Datenzugriffspfad', () => {
    expect(page).toContain("import { getGgaControlTowerOverview } from '@/lib/services/gga-cabinet.service'")
    expect(page).toContain("import { getVisibleCollaborationTasks, getVisibleCollaborationBlockers, getCurrentCollaborationUserId } from '@/lib/services/collaboration-phase2.service'")
    expect(page).toContain('getGgaControlTowerOverview(),')
    expect(page).toContain('getVisibleCollaborationTasks(),')
    expect(page).toContain("getVisibleCollaborationBlockers({ status: 'OPEN' }),")
  })

  it('priorisiert ausschließlich über die bereits bestehende REQ-013-Ableitung (deriveGgaProjectWorklist) — keine zweite Prioritäts-Engine', () => {
    expect(page).toContain('const worklistEntries = deriveGgaProjectWorklist(worklistInputs)')
  })

  it('ergänzt REQ-018.1-Prüfartausfälle als eigene Einträge und sortiert Cabinet- und Projekt-/Phasen-Einträge gemeinsam mit demselben Dringlichkeits-/Frist-Schema (keine zweite Sortierlogik)', () => {
    expect(page).toContain("cabinet.nichtBestandenePruefarten.map((pruefart) => ({")
    expect(page).toContain('if (a.urgency !== b.urgency) return a.urgency - b.urgency')
    expect(page).toContain("return a.problem.localeCompare(b.problem) || a.id.localeCompare(b.id)")
  })

  it('T1/T2: unterscheidet "Meine Aufgabe" von "Team / Projekt" für Schrank-Arbeit ausschließlich über das bereits vorhandene, zuverlässige responsibleMembershipId (Aufgaben/Blocker) — keine erfundene Zuordnung', () => {
    expect(page).toContain("zustaendigkeit: entry.verantwortlichUserId !== null && entry.verantwortlichUserId === currentUserId ? 'MEINE' as const : 'TEAM' as const,")
    expect(page).toContain('verantwortlichUserId: task.responsibleMembership?.userId ?? null,')
    expect(page).toContain('verantwortlichUserId: blocker.responsibleMembership?.userId ?? null,')
  })

  it('T9/T10: lässt Prüfungen/Freigaben/Nachprüfungen/Beanstandungen konsequent ohne Einzel-Verantwortlichen (verantwortlichUserId bleibt null), da CollaborationApproval/GgaCabinetPruefnachweis kein responsibleMembershipId besitzen', () => {
    expect(page).toContain('dueDate: null as Date | null, verantwortlichUserId: null as string | null,')
  })

  it('GGA-Portal Produktblock 7 Abschnitt 2/4/15: schließt die Scope-Lücke über die zentrale, exportierte Funktion deriveGgaProjektPhasenWorklist() — keine zweite, parallele Task-/Blocker-Auswertung in der Seite selbst', () => {
    expect(page).toContain('deriveGgaProjektPhasenWorklist,')
    expect(page).toContain('const projektPhasenEntries = deriveGgaProjektPhasenWorklist(tasks, blockers, currentUserId, now)')
  })

  it('Abschnitt 6: zeigt "Projektweit" statt eines erfundenen Schrank-Werts, wenn ein Arbeitspunkt keinem Schrank zugeordnet ist (bereits etablierte UI-Sprache, siehe Dashboard "projektweiter Blocker")', () => {
    expect(page).toContain('<span className="text-muted-foreground">Projektweit</span>')
  })

  it('Abschnitt 6: zeigt die Phase je Zeile — Schrank-Zeilen über die bestehende Lifecycle-Label-SSOT, Projekt-/Phasen-Zeilen über den echten Stage-Titel, sonst "–" statt eines Fake-Werts', () => {
    expect(page).toContain('stageTitle: GGA_LIFECYCLE_STAGE_LABELS[cabinet.lifecycleStage],')
    expect(page).toContain('{z.stageTitle ?? \'–\'}')
  })

  it('zeigt Status/Fortschritt-Sprache aus Produktblock 1-3 (GGA_STATUS_LABELS) UND die bereits bestehende Worklist-Dringlichkeit (GGA_WORKLIST_URGENCY_LABELS) getrennt', () => {
    expect(page).toContain('GGA_WORKLIST_URGENCY_BADGE_CLASS[z.urgency]')
    expect(page).toContain('GGA_STATUS_BADGE_CLASS[z.praesentationsStatus]')
    expect(page).toContain('praesentationsStatus: deriveGgaCabinetPresentationStatus(cabinet),')
  })

  it('zeigt kompakten Kopfbereich mit genau den geforderten Kennzahlen (Offen/Überfällig/Kritisch/Prüfungen/Freigaben), keine großen Dashboard-Karten', () => {
    expect(page).toContain('Offen</p><p className="mt-1 text-xl font-600">{offen}</p>')
    expect(page).toContain('Überfällig</p><p')
    expect(page).toContain('Kritisch</p><p')
    expect(page).toContain('Prüfungen</p><p')
    expect(page).toContain('Freigaben</p><p')
  })

  it('zeigt je Zeile Projekt, Phase, Schrank, was offen ist, nächsten Schritt, Frist und direkte Aktion (Abschnitt 5/6/11 — Phase neu in Produktblock 7, ersetzt die vormalige separate Bereich/Standort-Spalte gemäß dem in Abschnitt 6 vorgegebenen Spaltenset)', () => {
    expect(page).toContain('<th className="px-3 py-2 font-600">Projekt</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Phase</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Schrank</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Was ist offen?</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Nächster Schritt</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Frist</th>')
    expect(page).toContain('<th className="px-3 py-2 font-600">Aktion</th>')
  })

  it('verwendet für die direkte Aktion ausschließlich die bereits zentralisierte Funktion aus Produktblock 2/3 — keine neue Aktion implementiert', () => {
    expect(page).toContain('direktAktionFuerWorklistTyp,')
    expect(page).toContain('aktion: direktAktionFuerWorklistTyp(entry.type as GgaWorklistEntryType, entry.cabinetId, cabinet.bestandsaufnahmeAbgeschlossen),')
  })

  it('T15: bietet die in Abschnitt 9 geforderten Filter inkl. des neu ergänzten "Aufgaben"-Filters (echter Nutzwert, da jetzt auch Projekt-/Phasen-Aufgaben in die AUFGABE-Kategorie fallen) und eine Suche über Projekt/Phase/Schrankkennung/Standort, nur mit bereits vorhandenen Daten', () => {
    expect(page).toContain("alle: 'Alle', meine: 'Meine', team: 'Team', kritisch: 'Kritisch', ueberfaellig: 'Überfällig', aufgaben: 'Aufgaben', pruefungen: 'Prüfungen', freigaben: 'Freigaben', blocker: 'Blocker',")
    expect(page).toContain("case 'meine': return zeile.zustaendigkeit === 'MEINE'")
    expect(page).toContain("case 'team': return zeile.zustaendigkeit === 'TEAM'")
    expect(page).toContain("case 'kritisch': return zeile.praesentationsStatus === 'KRITISCH'")
    expect(page).toContain("case 'ueberfaellig': return zeile.ueberfaellig")
    expect(page).toContain("case 'aufgaben': return zeile.kategorie === 'AUFGABE'")
    expect(page).toContain('placeholder="Projekt, Phase, Schrank, Standort …"')
  })

  it('T14: die Suche schließt Stage-Titel (Phase) UND den Arbeitspunkt-Titel (problem) mit ein — ein projektweiter Eintrag hat weder kennung noch standort und wäre sonst über die Suche gar nicht auffindbar (per Browser-QA als echter Fund entdeckt: Suche nach "GVS" fand den Blocker "GVS Massname" zunächst nicht)', () => {
    expect(page).toContain('`${z.projectNumber ?? \'\'} ${z.projectName} ${z.kennung ?? \'\'} ${z.standort ?? \'\'} ${z.stageTitle ?? \'\'} ${z.problem}`.toLowerCase().includes(searchLower)')
  })

  it('T16: KPI-Zahlen (Offen/Überfällig/Kritisch/Prüfungen/Freigaben) werden ausschließlich aus der vollständigen zeilen-Liste berechnet — steigen automatisch korrekt mit, wenn Projekt-/Phasen-Einträge hinzukommen, keine separate/hartkodierte Zahl', () => {
    expect(page).toContain('const offen = zeilen.length')
    expect(page).toContain("const ueberfaellig = zeilen.filter((z) => z.ueberfaellig).length")
    expect(page).toContain("const kritisch = zeilen.filter((z) => z.praesentationsStatus === 'KRITISCH').length")
  })

  it('T17: die direkte Aktion führt für Projekt-/Phasen-Einträge zu den bestehenden Projektseiten-Ankern, für Schrank-Einträge weiterhin zur zentralisierten Cabinet-SSOT — keine neue Detailroute', () => {
    expect(page).toContain('aktion: entry.aktion,')
    expect(page).toContain('aktion: direktAktionFuerWorklistTyp(entry.type as GgaWorklistEntryType, entry.cabinetId, cabinet.bestandsaufnahmeAbgeschlossen),')
  })

  it('T18: die bestehende Cabinet-Arbeit (Schrank-Maßnahmen/-Mängel/REQ-018.1) bleibt unverändert über worklistEntries/pruefartEntries und deriveGgaCabinetPresentationStatus abgeleitet — keine Regression durch die Scope-Erweiterung', () => {
    expect(page).toContain('const worklistEntries = deriveGgaProjectWorklist(worklistInputs)')
    expect(page).toContain('praesentationsStatus: deriveGgaCabinetPresentationStatus(cabinet),')
    expect(page).toContain("if (!task.cabinetId || !task.isRequired || ['DONE', 'SKIPPED'].includes(task.status)) continue")
  })

  it('zeigt standardmäßig keine erledigte Arbeit (nur offene, erforderliche Aufgaben und offene Blocker fließen ein)', () => {
    expect(page).toContain("if (!task.cabinetId || !task.isRequired || ['DONE', 'SKIPPED'].includes(task.status)) continue")
    expect(page).toContain("getVisibleCollaborationBlockers({ status: 'OPEN' })")
  })

  it('unterscheidet den Leerzustand "keine offene Arbeit" von "keine Treffer in dieser Filteransicht" — keine erfundenen Empfehlungen', () => {
    expect(page).toContain('Aktuell keine offenen Arbeitspunkte.')
    expect(page).toContain('Projekte öffnen →')
    expect(page).toContain('Keine Arbeitspunkte in dieser Ansicht.')
  })

  it('baut keine große Karte pro Arbeitspunkt und begrenzt die Liste nicht künstlich mit .slice()', () => {
    expect(page).not.toMatch(/sichtbareZeilen\.slice\(/)
    expect(page).toContain('<table className="w-full min-w-[1180px] text-sm">')
  })
})

describe('"Meine Arbeit" — Navigation (GGA-Portal Produktblock 4 Abschnitt 3)', () => {
  const shell = readFileSync(
    resolve(process.cwd(), 'components/collaboration/CollaborationShell.tsx'),
    'utf8',
  )

  it('bietet einen klaren Einstieg "Meine Arbeit" in der Hauptnavigation, ohne die bestehende Startseite (Übersicht) zu ersetzen', () => {
    expect(shell).toContain('<Link href="/collaboration/my-work" className="text-blue-700 hover:underline">Meine Arbeit</Link>')
    expect(shell).toContain('<Link href="/collaboration/dashboard" className="text-blue-700 hover:underline">Übersicht</Link>')
  })
})
