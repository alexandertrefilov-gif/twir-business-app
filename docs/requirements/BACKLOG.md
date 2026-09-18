# BACKLOG — SOLL-Zustand

Ausschließlich noch NICHT vollständig implementierte Anforderungen, Ideen und
Verbesserungen. Ein Eintrag hier ist niemals eine Beschreibung existierender
Funktionalität — dafür `docs/PROJECT_INDEX.md` (IST-Zustand).

## Lebenszyklus

```
IDEA → PLANNED → APPROVED → IN_PROGRESS → IMPLEMENTED + TESTED → DONE
                                                                     ↓
                                            PROJECT_INDEX / PROJECT_MAP prüfen
```

`PROJECT_INDEX.md`/`PROJECT_MAP.md` beschreiben ausschließlich tatsächlich
implementierte Funktionalität/Architektur. Eine Idee oder akzeptierte
Entscheidung darf diese Dateien nicht vorzeitig ändern — erst nach
`DONE` und verifizierten Tests. `DONE` bedeutet nicht automatisch Löschung;
ein Eintrag bleibt als historische Anforderung erhalten.

---

## REQ-001 — Test-Delete/Permission-Fehlerbehandlung kapseln

Status: PLANNED
Priority: P2
Area: Delete-Server-Actions (mehrere Module)
Created: 2026-09-18

### Ziel
`requireTestDeleteEnabled()`/`requirePermission()` sind in mehreren
Lösch-Server-Actions außerhalb try/catch aufgerufen.

### Anforderungen
- Betroffene Delete-Actions identifizieren.
- Einheitliche try/catch-Kapselung einführen.

### Akzeptanzkriterien
- [ ] Alle betroffenen Actions gekapselt.
- [ ] Bestehende Tests weiterhin grün.

### Abhängigkeiten
- keine

### Entscheidung
Noch nicht entschieden.

### Implementierung
Noch nicht implementiert. In Produktion durch `NODE_ENV`-Gate ohnehin
unerreichbar (Test-Delete-Pfad) — kein akuter Sicherheitsblocker.

---

## REQ-002 — Automatisches Mahnungs-PDF

Status: PLANNED
Priority: P2
Area: Invoice / Payment (Dunning)

### Ziel
`DunningNotice` hat bislang keine live PDF-Route; Template/Renderfunktion
existieren (`renderDunningPdf`), sind aber nicht angebunden.

### Anforderungen
- Entscheiden, ob automatische PDF-Generierung gewünscht ist.
- Falls ja: Route + Service nach Vorbild der übrigen PDF-Endpunkte ergänzen.

### Akzeptanzkriterien
- [ ] Entscheidung dokumentiert (DEC-xxx, falls getroffen).
- [ ] Bei Umsetzung: Route liefert valides PDF, Regressionstest vorhanden.

### Abhängigkeiten
- PDF-Infrastruktur (siehe PROJECT_INDEX)

### Entscheidung
Noch nicht entschieden.

### Implementierung
Noch nicht implementiert.

---

## REQ-003 — Undefinierte CSS-Klassen `.btn-primary`/`.btn-secondary`

Status: PLANNED
Priority: P3
Area: UI

### Ziel
Klassen werden in wenigen Dateien verwendet, sind aber nirgends definiert.

### Anforderungen
- Betroffene Stellen identifizieren.
- Entscheiden: definieren oder durch bestehende Utility-Klassen ersetzen.

### Akzeptanzkriterien
- [ ] Keine unter definierten Klassenreferenzen mehr im UI-Code.

### Entscheidung
Noch nicht entschieden.

### Implementierung
Noch nicht implementiert.

---

## REQ-004 — Toter Code `assertPathWithinBase()`

Status: PLANNED
Priority: P3
Area: Security/Upload

### Ziel
Funktion definiert, aber nirgends aufgerufen.

### Anforderungen
- Prüfen, ob Funktion noch benötigt wird.
- Entfernen oder verdrahten.

### Akzeptanzkriterien
- [ ] Entweder aktiv genutzt oder entfernt.

### Entscheidung
Noch nicht entschieden.

### Implementierung
Noch nicht implementiert. Nicht sicherheitskritisch — `sanitizeFilename()`
entfernt Pfadkomponenten bereits an anderer Stelle.

---

## REQ-005 — Audit-Log-Label für `serviceReport` korrigieren

Status: PLANNED
Priority: P3
Area: Audit / GGA

### Ziel
Audit-Log-UI zeigt bei `ARCHIVE_SUCCEEDED`-Einträgen „Unbekannte Entität
(serviceReport)" statt „Leistungsnachweis".

### Anforderungen
- Label-Mapping in der Audit-Log-UI ergänzen.

### Akzeptanzkriterien
- [ ] Korrektes Label für alle `serviceReport`-Audit-Einträge.

### Entscheidung
Noch nicht entschieden.

### Implementierung
Noch nicht implementiert.

---

## REQ-006 — Seitentitel für `/projects` und Collaboration-Routen

Status: PLANNED
Priority: P3
Area: UI / Project, CollaborationProject

### Ziel
`/projects` sowie die gesamte `(collaboration)`-Routengruppe zeigen im
Browser-Tab generisch „Business App" statt eines eigenen Titels.

### Anforderungen
- Metadata/`<title>` je Seite ergänzen.

### Akzeptanzkriterien
- [ ] Jede betroffene Seite hat einen eigenen Tab-Titel.

### Entscheidung
Noch nicht entschieden.

### Implementierung
Noch nicht implementiert.

---

## REQ-007 — Vitest-Familie Major-Upgrade prüfen

Status: PLANNED
Priority: P3
Area: Deployment-Infrastruktur / Tooling

### Ziel
`npm audit` meldet 2 Critical/1 High/3 Moderate ausschließlich in der
Vitest-Familie (devDependency, keine Produktionsexposition).

### Anforderungen
- Separate Bewertung eines vitest@5-Major-Upgrades.

### Akzeptanzkriterien
- [ ] Entscheidung dokumentiert.
- [ ] Bei Upgrade: volle Testsuite grün.

### Entscheidung
Noch nicht entschieden.

### Implementierung
Noch nicht implementiert.

---

## REQ-008 — ESLint-Major-Upgrade prüfen

Status: PLANNED
Priority: P3
Area: Deployment-Infrastruktur / Tooling

### Ziel
ESLint 9.x (seit CP16 im Einsatz) ist laut Upstream End-of-Support (v10
aktuell), aktuell aber ohne CVE.

### Anforderungen
- Separate Bewertung eines ESLint-10-Upgrades.

### Akzeptanzkriterien
- [ ] Entscheidung dokumentiert.
- [ ] Bei Upgrade: Lint weiterhin 0 Fehler.

### Entscheidung
Noch nicht entschieden.

### Implementierung
Noch nicht implementiert.

---

## REQ-009 — Turbopack/File-Tracing bei Storage-Pfaden prüfen

Status: PLANNED
Priority: P3
Area: Deployment-Infrastruktur

### Ziel
`STORAGE_LOCAL_PATH` ist zur Build-Zeit nicht statisch auflösbar (Env-Var) —
Next.js' Tracer kopiert deshalb vorsorglich weite Teile des Projekts nach
`.next/standalone` (Image größer als nötig, kein Secret-Leck, siehe CP17).

### Anforderungen
- Prüfen, ob `outputFileTracingExcludes`/-`Includes` den Umfang gezielt
  einschränken kann, ohne den Laufzeitzugriff zu brechen.

### Akzeptanzkriterien
- [ ] Kleineres Standalone-Image ODER dokumentierte Begründung, warum
      nicht sinnvoll.

### Entscheidung
Noch nicht entschieden.

### Implementierung
Noch nicht implementiert.

---

## REQ-010 — Zielpfad für `document_archive_path` in Produktion

Status: PLANNED
Priority: P1
Area: Document Archive / Deployment-Infrastruktur
Created: 2026-09-18

### Ziel
`company_settings.document_archive_path` ist aktuell lokal auf einen
macOS-/OneDrive-Pfad gesetzt — dieser darf nicht als Produktionswert
übernommen werden. Entscheidung zwischen zwei Optionen steht noch aus.

### Anforderungen
- **Option A:** Dokumentenarchivierung für die Hetzner-Installation
  deaktivieren (`document_archive_enabled = false`).
- **Option B:** Linux-Pfad (z. B. `/app/archive`) als zweites persistentes
  Volume verwenden — Mechanismus dafür existiert bereits
  (`deploy/initial-production-setup.ts`, idempotent, siehe PROJECT_INDEX).

### Akzeptanzkriterien
- [ ] Option gewählt und als DEC-Eintrag dokumentiert.
- [ ] Bei Option B: `initial-production-setup.ts` gegen echte Produktions-DB
      ausgeführt und verifiziert.

### Abhängigkeiten
- Document Archive, Deployment-Infrastruktur (siehe PROJECT_INDEX/PROJECT_MAP)

### Entscheidung
Noch nicht entschieden — Status bleibt offen.

### Implementierung
Noch nicht implementiert.
