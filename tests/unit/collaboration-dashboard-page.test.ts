import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(
  resolve(process.cwd(), 'app/(collaboration)/collaboration/dashboard/page.tsx'),
  'utf8',
)

describe('Collaboration-Dashboard (GGA Control Tower, REQ-014 + GGA-Portal-Weiterentwicklung)', () => {
  it('lädt den projektübergreifenden GGA Control Tower über die dafür vorgesehene Service-Funktion', () => {
    expect(page).toContain("import { getGgaControlTowerOverview } from '@/lib/services/gga-cabinet.service'")
    expect(page).toContain('const gga = await getGgaControlTowerOverview()')
  })

  it('leitet die Direkt-Aktion für die Handlungsbedarf-Vorschau ausschließlich über die zentrale, geteilte Funktion ab (cabinet-workflow.ts) — keine eigene/zweite Statuslogik in der Seite', () => {
    expect(page).toContain('direkteGgaHandlungsbedarfAktion,')
    expect(page).toContain('const aktion = direkteGgaHandlungsbedarfAktion(cabinet.cabinetId, cabinet.gruende)')
    expect(page).not.toContain('function istPruefpfad')
  })

  it('nennt bei nicht bestandener Prüfart den konkreten nächsten Schritt über die zentrale, geteilte Ableitung (cabinet-workflow.ts) statt der generischen Checklisten-Fallback-Meldung', () => {
    expect(page).toContain('naechsterSchrittFuerCabinet,')
    expect(page).toContain('Nächster Schritt:</span> {naechsterSchrittFuerCabinet(cabinet)}')
  })

  it('macht den Unterschied zwischen projektweitem Blocker und GGA-Schrank-Handlungsbedarf je Projektkarte explizit und nennt beide Gründe gemeinsam, falls beide zutreffen, statt die beiden Statusmodelle zu vermischen', () => {
    expect(page).toContain("if (dringend > 0) ursacheTeile.push(`${dringend} Schrank${dringend === 1 ? '' : 'e'} mit Handlungsbedarf`)")
    expect(page).toContain("if (presentationStatus === 'KRITISCH' && projektweiterBlocker) ursacheTeile.push('projektweiter Blocker (kein GGA-Schrank betroffen)')")
    expect(page).toContain('const projektweiterBlocker = project.offeneProjektweiteBlocker > 0')
  })
})

describe('GGA-Portal Produktblock 6 (Dashboard Consolidation) — explizite Prüfkriterien T1-T10', () => {
  it('T1: nur eine KPI-Reihe vorhanden (vormals zwei teilweise redundante Reihen), keine zweite KPI-Reihe darunter', () => {
    expect(page).not.toContain('GGA-Arbeitsoberfläche')
    expect(page).not.toContain('GGA CONTROL TOWER')
    // sechs KPI-Kacheln (GGA-Projekte/GGA-Schränke/Kritisch-Handlungsbedarf/
    // Prüfungen offen/Freigaben offen/Abgeschlossen), keine zweite Reihe.
    expect((page.match(/mt-1 text-xl font-600/g) ?? []).length).toBe(6)
  })

  it('T2: Projektmatrix vorhanden und bleibt das Zentrum des Dashboards', () => {
    expect(page).toContain('id="matrix-title"')
    expect(page).toContain('sichtbareProjekte.map((card) =>')
  })

  it('T3: Projektstatus je Karte sichtbar (Text, nicht nur Farbe)', () => {
    expect(page).toContain('GGA_STATUS_LABELS[card.presentationStatus]')
  })

  it('T4: Projektfortschritt je Karte sichtbar', () => {
    expect(page).toContain("{card.progressPercent === null ? '–' : `${card.progressPercent} %`}")
  })

  it('T5: Status und Fortschritt bleiben getrennte Dimensionen (zwei eigene Felder/Anzeigen auf der Karte, keine Verwechslung)', () => {
    expect(page).toContain('progressPercent: project.progressPercent,')
    expect(page).toContain('presentationStatus, ursache,')
    expect(page).toContain('GGA_STATUS_BADGE_CLASS[card.presentationStatus]')
  })

  it('T6: kritisches Projekt bleibt priorisiert sichtbar (Kritisch-Badge auf der Karte, eigener KPI-Wert, eigener Matrixfilter)', () => {
    expect(page).toContain("case 'kritisch': return card.presentationStatus === 'KRITISCH'")
    expect(page).toContain('{matrixHandlungsbedarf}')
  })

  it('T7: vollständige Cross-Projekt-Schrank-Arbeitsliste nicht mehr vorhanden (dupliziert /my-work und die Projekt-Schrankmatrix, skaliert dort schlecht)', () => {
    expect(page).not.toContain('Schrank-Arbeitsliste')
    expect(page).not.toContain('function matchesFilter')
    expect(page).not.toContain('function ProgressBar')
    expect(page).not.toContain('aktuellerGgaFortschritt')
    expect(page).not.toContain('direkteGgaCabinetAktion')
  })

  it('T8: klar sichtbarer, nicht überdimensionierter Link zu /collaboration/my-work vorhanden (Kopfzeile, unabhängig vom Handlungsbedarf-Zustand)', () => {
    expect(page).toContain('href="/collaboration/my-work" className="text-sm font-600 text-blue-700 hover:underline">Meine Arbeit öffnen →')
  })

  it('T9: keine lokale Next-Step-Duplikation neu eingeführt — die Handlungsbedarf-Vorschau nutzt exakt dieselbe SSOT wie zuvor, keine zweite Ableitung', () => {
    expect(page).toContain('{naechsterSchrittFuerCabinet(cabinet)}')
    expect(page).not.toContain('cabinet.naechsteAktion')
  })

  it('T10: "Projekt öffnen" funktioniert weiterhin — jede Karte verlinkt direkt auf die bestehende Projektseite', () => {
    expect(page).toContain('href={`/collaboration/projects/${card.id}`}')
    expect(page).toContain('Projekt öffnen →')
  })

  it('Handlungsbedarf-Vorschau (Abschnitt 6): maximal 5 Einträge, reine Anzeige-Kappung der bereits bestehenden, sortierten dringendeSchraenke-Liste, mit Link zur vollständigen Arbeitsliste', () => {
    expect(page).toContain('const dringendeVorschau = gga.dringendeSchraenke.slice(0, 5)')
    expect(page).toContain('dringendeVorschau.length > 0 && <section')
    expect(page).toContain('href="/collaboration/my-work" className="text-sm font-600 text-blue-700 hover:underline">Alle Arbeitspunkte öffnen →')
  })

  it('Freigaben offen (Abschnitt 3): globale KPI ist Summe bereits vorhandener, globaler Cabinet-Summary-Felder — keine neue Berechnung', () => {
    expect(page).toContain('const freigabenOffenGesamt = gga.gesamt.freigabeOffen + gga.gesamt.betreiberfreigabeAusstehend')
  })

  it('keine Architekturänderung: weiterhin dieselben Service-/SSOT-Importe, keine neuen Businessfunktionen in der Seite definiert', () => {
    expect(page).toContain("import { getVisibleCollaborationProjects } from '@/lib/services/collaboration-project.service'")
    expect(page).toContain('deriveGgaProjectPresentationStatus,')
  })
})

describe('Projektmatrix (GGA-Portal Produktblock 1)', () => {
  it('baut jede Projektkarte nur für Projekte mit mindestens einem GGA-Schrank, als Join über bereits vorhandene Kennzahlen (kein neuer Datenzugriff)', () => {
    expect(page).toContain('.filter((project) => ggaProjectSummaryById.has(project.id))')
    expect(page).toContain('buildProjectMatrixCard(project, ggaProjectSummaryById.get(project.id)!, ggaCabinetBlockersByProject.get(project.id) ?? 0)')
    expect(page).toContain('const ggaProjectSummaryById = new Map(gga.projekte.map((summary) => [summary.projectId, summary]))')
  })

  it('trennt Fortschritt (%) und Situation (Status/Ampel) strikt auf der Karte — beides eigene Felder, keine Verwechslung', () => {
    expect(page).toContain('progressPercent: project.progressPercent,')
    expect(page).toContain('presentationStatus, ursache,')
    expect(page).toContain('{card.progressPercent === null ? \'–\' : `${card.progressPercent} %`}')
    expect(page).toContain('GGA_STATUS_BADGE_CLASS[card.presentationStatus]')
  })

  it('leitet den Präsentationsstatus ausschließlich über die zentrale, bereits importierte Funktion ab (keine zweite Readiness-Engine in der Seite)', () => {
    expect(page).toContain('deriveGgaProjectPresentationStatus,')
    expect(page).toContain('deriveGgaProjectPresentationStatus({')
    expect(page).toContain("abgeschlossen, healthStatus: project.healthStatus, dringendeSchraenkeAnzahl: ggaSummary.dringendeSchraenkeAnzahl,")
  })

  it('zeigt "Abgeschlossen" nur bei echtem Projektabschluss (project.status === COMPLETED), nicht allein bei 100 % Fortschritt', () => {
    expect(page).toContain("const abgeschlossen = project.status === 'COMPLETED'")
  })

  it('zeigt Status zusätzlich immer als Text (nie ausschließlich über Farbe)', () => {
    expect(page).toContain('GGA_STATUS_LABELS[card.presentationStatus]')
  })

  it('zeigt die geforderten operativen Kennzahlen je Karte: Schränke, Prüfungen, Mängel, Freigaben — alle aus bereits abgeleiteten Werten', () => {
    expect(page).toContain('schraenke: ggaSummary.gesamt, pruefungenOffen: ggaSummary.pruefungOffen, maengelOffen,')
    expect(page).toContain('freigabenOffen: ggaSummary.freigabeOffen + ggaSummary.betreiberfreigabeAusstehend,')
  })

  it('zeigt den konsolidierten KPI-Kopf mit genau den sechs geforderten Kennzahlen oberhalb der Matrix (GGA-Portal Produktblock 6)', () => {
    expect(page).toContain('GGA-Projekte</p><p className="mt-1 text-xl font-600">{projectCards.length}</p>')
    expect(page).toContain('GGA-Schränke</p>')
    expect(page).toContain('Kritisch / Handlungsbedarf</p>')
    expect(page).toContain('Prüfungen offen</p>')
    expect(page).toContain('Freigaben offen</p>')
    expect(page).toContain('{matrixAbgeschlossen}</p>')
  })

  it('bietet die sieben geforderten Filter (Alle/In Arbeit/Kritisch/Planung/Umsetzung/Abnahme/Abgeschlossen) nur anhand bereits vorhandener, zuverlässiger Daten', () => {
    expect(page).toContain("alle: 'Alle', 'in-arbeit': 'In Arbeit', kritisch: 'Kritisch', planung: 'Planung', umsetzung: 'Umsetzung', abnahme: 'Abnahme', abgeschlossen: 'Abgeschlossen'")
    expect(page).toContain("case 'in-arbeit': return card.status === 'ACTIVE'")
    expect(page).toContain("case 'kritisch': return card.presentationStatus === 'KRITISCH'")
    expect(page).toContain('case \'planung\': return card.aktuellePhase === GGA_STAGE_PLANUNG')
    expect(page).toContain('case \'umsetzung\': return card.aktuellePhase === GGA_STAGE_UMSETZUNG')
    expect(page).toContain('case \'abnahme\': return card.aktuellePhase === GGA_STAGE_ABNAHME')
    expect(page).toContain("case 'abgeschlossen': return card.status === 'COMPLETED'")
  })

  it('bietet eine einfache Projektsuche über einen GET-Formular-Parameter (kein Client-JS, bestehendes Muster wie in documents/page.tsx)', () => {
    expect(page).toContain('<input type="search" name="q" defaultValue={search}')
    expect(page).toContain("`${card.projectNumber ?? ''} ${card.name}`.toLowerCase().includes(searchLower)")
  })

  it('verlinkt jede Projektkarte direkt auf die bereits vorhandene Projektseite statt eine neue Detailseite zu bauen', () => {
    expect(page).toContain('href={`/collaboration/projects/${card.id}`}')
  })

  it('lässt kein Projekt durch die GGA-Verdichtung verschwinden — Projekte ohne GGA-Schrank bleiben als eigene Liste sichtbar', () => {
    expect(page).toContain('const projekteOhneGgaSchrank = projects.filter((project) => !ggaProjectSummaryById.has(project.id))')
    expect(page).toContain('Weitere Projekte ohne GGA-Schrank')
  })
})
