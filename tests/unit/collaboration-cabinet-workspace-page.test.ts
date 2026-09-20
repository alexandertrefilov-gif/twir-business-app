import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GGA-Schrank-Arbeitsplatz (GGA-Portal Produktblock 3)', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'app/(collaboration)/collaboration/cabinets/[id]/page.tsx'),
    'utf8',
  )

  it('verwendet weiterhin die bestehende Schrank-Detailroute und getGgaCabinetDetail() — keine neue Detailroute', () => {
    expect(page).toContain("import { getGgaCabinetDetail, getGgaCabinetAuditHistory, getGgaCabinetPruefnachweisOverview, cabinetEditorRoles } from '@/lib/services/gga-cabinet.service'")
    expect(page).toContain('cabinet = await getGgaCabinetDetail(id)')
  })

  it('navigiert per Breadcrumb zurück zum Projekt (Produktblock 3 Abschnitt 12) — keine Sackgasse', () => {
    expect(page).toContain('href={`/collaboration/projects/${cabinet.projectId}`}')
    expect(page).toContain('← Projekt')
  })

  it('leitet Status/nächsten Schritt/Direktaktion/Fortschritt ausschließlich über die zentralisierten, bereits von Dashboard und Projektmatrix genutzten Funktionen ab (SSOT, Produktblock 3 Abschnitt 10) — keine zweite Ableitung', () => {
    expect(page).toContain('deriveGgaCabinetPresentationStatus, naechsterSchrittFuerCabinet, direkteGgaCabinetAktion, aktuellerGgaFortschritt, deriveGgaProjectWorklist,')
    expect(page).toContain('const presentationStatus = deriveGgaCabinetPresentationStatus(controlTowerEntry)')
    expect(page).toContain('const naechsterSchritt = naechsterSchrittFuerCabinet(controlTowerEntry)')
    expect(page).toContain('const direktAktion = direkteGgaCabinetAktion(controlTowerEntry)')
    expect(page).toContain('const fortschritt = aktuellerGgaFortschritt(controlTowerEntry)')
  })

  it('baut den GgaControlTowerCabinetEntry für dieses eine Cabinet genauso wie Dashboard/Projektmatrix (gleiche Felder, gleiche Prüfnachweis-Quelle)', () => {
    expect(page).toContain('const controlTowerEntry: GgaControlTowerCabinetEntry = {')
    expect(page).toContain('nichtBestandenePruefarten,')
    expect(page).toContain('...cabinet.status,')
    expect(page).toContain('getGgaCabinetPruefnachweisOverview(id)')
  })

  it('zeigt den Schrankkopf mit Standort, Fortschritt, Betriebsstatus und Prüfstatus, ohne große leere KPI-Karten', () => {
    expect(page).toContain('Standort</p><p className="mt-1 text-sm font-600">{standort ??')
    expect(page).toContain('Fortschritt</p><p className="mt-1 text-xl font-600">{fortschritt === null')
    expect(page).toContain('Betriebsstatus</p><p className={`mt-1 inline-block rounded-full')
    expect(page).toContain('Prüfstatus</p><p className="mt-1 text-sm font-600">{GGA_PRUEFSTATUS_LABELS[cabinet.status.pruefstatus]}')
  })

  it('zeigt "Nächster Schritt" prominent mit direkter Aktion (Produktblock 3 Abschnitt 2)', () => {
    expect(page).toContain('Nächster Schritt</p><p className="mt-1 text-lg font-600 text-stone-900">{naechsterSchritt}</p>')
    expect(page).toContain('<Link href={direktAktion.href}')
  })

  it('visualisiert den Lifecycle kompakt mit ✓/●/○/! als reine Übersetzung der bestehenden Reihenfolge — keine neue State-Machine', () => {
    expect(page).toContain("const LIFECYCLE_ORDER = Object.keys(GGA_LIFECYCLE_STAGE_LABELS)")
    expect(page).toContain("if (stepIndex < currentIndex) return { symbol: '✓'")
    expect(page).toContain("return blockedAtCurrent ? { symbol: '!'")
    expect(page).toContain("return { symbol: '○', className: 'text-stone-400' }")
  })

  it('zeigt Handlungsbedarf mit Problem/nächstem Schritt/direkter Aktion, kombiniert aus REQ-013 (deriveGgaProjectWorklist) und REQ-018.1-Prüfartausfällen — keine reine Informationsliste', () => {
    expect(page).toContain('const worklistHandlungsbedarf = deriveGgaProjectWorklist([worklistInput])')
    expect(page).toContain('const pruefartHandlungsbedarf = nichtBestandenePruefarten.map((pruefart) => ({')
    expect(page).toContain('const handlungsbedarf = [...pruefartHandlungsbedarf, ...worklistHandlungsbedarf]')
    expect(page).toContain('Kein Handlungsbedarf — dieser Schrank ist im grünen Bereich.')
  })

  it('filtert die drei generischen NAECHSTE_AKTION-Fallbacktexte aus Handlungsbedarf heraus (bereits im "Nächster Schritt"-Kasten sichtbar), behält aber konkrete offene Checklistenpunkte als echten Handlungsbedarf', () => {
    expect(page).toContain("const GENERISCHE_NAECHSTE_AKTION = new Set(['Bestandsaufnahme durchführen', 'Prüfung planen', 'Prüfung durchführen'])")
    expect(page).toContain("!(entry.type === 'NAECHSTE_AKTION' && GENERISCHE_NAECHSTE_AKTION.has(entry.title))")
  })

  it('zeigt die Arbeitsbereiche als kompakte Zusammenfassungs-Cockpit-Karten (Bestandsaufnahme/Planung/Umsetzung/Prüfung & Abnahme/Freigaben/Dokumente/Historie), nicht als kopierte Formulare', () => {
    expect(page).toContain('Bestandsaufnahme</p>')
    expect(page).toContain('Planung</p>')
    expect(page).toContain('Umsetzung</p>')
    expect(page).toContain('Prüfung &amp; Abnahme</p>')
    expect(page).toContain('Freigaben</p>')
    expect(page).toContain('Dokumente / Schrankakte</p>')
    expect(page).toContain('Aktivität / Historie</p>')
  })

  it('integriert REQ-018.1 vollständig in die Prüfung & Abnahme-Karte (Lüftung/Elektro/VDE, aktuelles Ergebnis) — keine Änderung an der REQ-018.1-Businesslogik', () => {
    expect(page).toContain('{pruefnachweisOverview.map((entry) => <div key={entry.pruefart}')
    expect(page).toContain('GGA_PRUEFART_LABELS[entry.pruefart]')
    expect(page).toContain("pruefartSymbol[entry.current?.ergebnis ?? 'OFFEN']")
  })

  it('zeigt den ABNAHME-Checklistenfortschritt kompakt (X/Y erledigt), ohne bei offenen Pflichtpunkten "fertig" zu suggerieren — REQ-018.2 unverändert wiederverwendet', () => {
    expect(page).toContain("const abnahmeChecklist = checklistSummary('ABNAHME')")
    expect(page).toContain('Abnahme-Checkliste {abnahmeChecklist.done}/{abnahmeChecklist.total}')
  })

  it('zeigt die Freigabekette (intern/Betreiber) rein aus bereits vorhandenen Ableitungen (pruefstatus/betreiberstatus/freigabeOffen) — keine neue Freigabelogik', () => {
    expect(page).toContain('function interneFreigabeStatus(status: { pruefstatus: GgaCabinetPruefstatus; freigabeOffen: boolean })')
    expect(page).toContain('function betreiberfreigabeStatus(status: { betreiberstatus: GgaCabinetBetreiberstatus; pruefstatus: GgaCabinetPruefstatus })')
    expect(page).toContain('const interneFreigabe = interneFreigabeStatus(cabinet.status)')
    expect(page).toContain('const betreiberFreigabe = betreiberfreigabeStatus(cabinet.status)')
  })

  it('bietet sichtbaren Zugang zu Dokumenten und zur Schrankakte-PDF (bestehende Funktionen, nicht neu implementiert)', () => {
    expect(page).toContain('href={`/api/collaboration/cabinets/${cabinet.id}/schrankakte`}')
    expect(page).toContain('Dokumente / Schrankakte')
  })

  it('verankert die Arbeitsbereich-Karten auf bereits bestehende Ankerpunkte/Seiten derselben Seite statt neue Bearbeitungsseiten zu bauen', () => {
    expect(page).toContain('id="massnahmen"')
    expect(page).toContain('id="blocker"')
    expect(page).toContain('id="freigaben"')
    expect(page).toContain('id="dokumente"')
    expect(page).toContain('id="historie"')
    expect(page).toContain('href="#massnahmen"')
    expect(page).toContain('direktAktionFuerWorklistTyp,')
    expect(page).toContain('aktion: direktAktionFuerWorklistTyp(entry.type, cabinet.id, cabinet.status.bestandsaufnahmeAbgeschlossen),')
  })

  it('behält bestehende Schrankfunktionen unverändert: SOLL/IST-Formular, Maßnahmen, Blocker-Liste, Checkliste, Freigabehistorie, Dokument-Upload', () => {
    expect(page).toContain('<GgaCabinetTechnicalForm')
    expect(page).toContain('<GgaCabinetMeasureForm')
    expect(page).toContain('<GgaCabinetBlockerList')
    expect(page).toContain('<GgaCabinetChecklistTemplateButtons')
    expect(page).toContain('<GgaCabinetFreigabehistorie')
    expect(page).toContain('<GgaCabinetDocumentUpload')
  })

  it('erhält bestehende Rollen-/Zugriffsregeln unverändert (keine neue Authorization in der UI)', () => {
    expect(page).toContain('const canEdit = (cabinetEditorRoles as readonly string[]).includes(cabinet.role)')
    expect(page).toContain('const canDelete = cabinet.role === ')
    expect(page).toContain('const canResolveBlockers = (editorRoles as readonly string[]).includes(cabinet.role)')
    expect(page).toContain('handleCollaborationPageError(error)')
  })
})
