# TWIR – Projektanweisungen

## Repository Navigation — mandatory

Der Code ist die einzige Quelle der Wahrheit. `docs/PROJECT_INDEX.md` und
`docs/PROJECT_MAP.md` sind ausschließlich Navigationshilfen, keine zweite
Spezifikation — bei Widerspruch gilt immer der Code.

A. Keine Aufgabe mit einem rekursiven Repository-Scan beginnen.
B. Zuerst `docs/PROJECT_INDEX.md` lesen.
C. Das betroffene Modul bestimmen.
D. Nur die für dieses Modul angegebenen Entry Points/Services/Tests lesen.
E. `docs/PROJECT_MAP.md` nur lesen, wenn die Aufgabe Beziehungen zwischen
   Modulen betrifft.
F. Gezielte Suche nach Symbol-/Funktionsname statt Volltextsuche verwenden.
G. `app/`, `lib/`, `components/`, `tests/`, `prisma/` nicht vollständig
   lesen, sofern die Aufgabe das nicht ausdrücklich erfordert.
H. Suchumfang nur erweitern, wenn:
   - der Index nicht ausreicht,
   - eine unbekannte Abhängigkeit auffällt,
   - eine Sicherheitsauswirkung mehrere Module betrifft,
   - eine Prisma-Änderung eine Impact-Analyse erfordert,
   - Build/Typecheck/Test auf eine zusätzliche Abhängigkeit hinweist.
I. Widerspricht `PROJECT_INDEX.md` dem Code: der Code hat Vorrang. Die
   veraltete Stelle im Index vermerken und erst nach erfolgreichen Tests
   aktualisieren — nicht spekulativ vorab.

**Index-Pflege:** Nach einer erfolgreich abgeschlossenen Aufgabe `PROJECT_INDEX.md`
nur aktualisieren, wenn sich Entry Points, wichtige public Symbols,
Abhängigkeiten, Prisma-Modelle, Sicherheits-Invarianten, Storage-Architektur,
Auth-Grenzen oder Workflow-Architektur geändert haben. Bei gewöhnlichem
internem Refactoring den Index nicht anfassen.

## Projektzweck

TWIR ist eine interne, deutschsprachige Business-Anwendung für Kunden-, Angebots-, Auftrags-,
Leistungsnachweis-, Rechnungs-, Zahlungs-, Mahn- und Dokumentverwaltung.

Der tatsächlich implementierte Hauptablauf ist:

`Customer → Offer (optional) → Order → ServiceReport → Invoice → Payment`

- Ein Auftrag kann direkt oder über `convertOfferToOrder` aus einem angenommenen Angebot entstehen.
- Eine Rechnung kann einem Auftrag zugeordnet sein, benötigt aber nur zwingend einen Kunden.
- `ServiceReport` und `ServiceReportItem` bilden Leistung und Leistungsnachweis gemeinsam ab.
- `Project` (interner kaufmännischer Kontext) und `CustomerPurchaseOrder` existieren als eigene
  Modelle — siehe `docs/PROJECT_INDEX.md`.
- E-Mail-Versand ist nicht implementiert.

Daneben existiert eine vollständig getrennte GGA-/Gefahrstoffschrank-Domäne
(`CollaborationProject`, `GgaCabinet`, eigene Auth-Domain, Betreiberportal) —
siehe `docs/PROJECT_INDEX.md` und `docs/PROJECT_MAP.md`.

Keine fehlenden Begriffe oder Prozessstufen ohne ausdrückliche Freigabe erfinden.

## Technischer Stack

- Next.js `16.3.5`, App Router (Turbopack, `output: 'standalone'`)
- React 19, React Server Components und Client Components
- TypeScript 5 im Strict-Modus
- PostgreSQL mit Prisma 5
- NextAuth 4, Credentials Provider und JWT-Sessions
- Zod für serverseitige Eingabevalidierung
- Tailwind CSS 3 und Radix UI
- `@react-pdf/renderer` für vorhandene PDF-Vorlagen
- Vitest 2 mit Node-Testumgebung

`package.json` und `package-lock.json` sind für Versionen und Befehle maßgeblich.

## Projektstruktur

- `app/`: App-Router-Seiten, Layouts, Route Handler und Server Actions.
- `app/(auth)/`: Login.
- `app/(dashboard)/`: geschützte Fachseiten und Actions.
- `app/api/`: NextAuth, Upload und geschützter Dokumentdownload.
- `components/`: Client-Komponenten, Formulare, Tabellen, Dialoge und Layout.
- `lib/services/`: fachliche Lese-/Schreiblogik und Transaktionen.
- `lib/validators/`: Zod-Schemas und zentrale Berechnungen.
- `lib/auth/`: NextAuth, Callback-Schutz und Berechtigungsmatrix.
- `lib/security/`: Rate Limiting und Uploadvalidierung.
- `lib/pdf-templates/`: PDF-Vorlagen — siehe `docs/PROJECT_INDEX.md` für den aktuellen Stand.
- `lib/export/`: DATEV-Export und E-Rechnungs-Typvorbereitung.
- `prisma/schema.prisma`: Datenmodell; `prisma/seed/seed.ts`: Demo-/Basisdaten.
- `types/enums.ts`: Rollen, Statuswerte, Übergänge und Labels.
- `tests/`: Vitest Unit- und Integrationstests.
- `.agents/skills/`: projektspezifische Qualitätsworkflows.
- `docs/`: belegte Architektur-, Geschäfts-, Daten-, Sicherheits- und Testreferenzen.

## Geschäftsbegriffe

- **Kunde:** `Customer`, optional mit `Contact`; Stammdaten werden soft gelöscht.
- **Projekt:** `Project` — interner kaufmännischer Kontext, optionaler Querverweis zu
  Angebot/Auftrag, kein eigener Prozessschritt. Nicht zu verwechseln mit `CollaborationProject`
  (separate GGA-Domäne).
- **Angebot:** `Offer` mit Positionen, Preisen, Status und Kundensnapshot beim Versand.
- **Kundenbestellung:** `CustomerPurchaseOrder` — eigenes Modell, an ein Angebot gehängt.
- **Auftrag:** `Order`, direkt erstellt oder eindeutig aus einem Angebot erzeugt.
- **Leistung:** Keine getrennte Entität; Positionen eines `ServiceReport`.
- **Leistungsnachweis:** `ServiceReport` mit eindeutiger Nummer und Positionen.
- **Rechnung:** `Invoice`; bis Finalisierung Entwurf ohne Nummer, danach gesperrt.
- **Dokument:** `Document` ist Datei-/Metadatenarchiv; Statusmodelle liegen auf Fachobjekten.

## Architekturregeln

1. Fachliche Mutationen folgen `UI → Server Action/API → Validator → Service → Prisma`.
2. Geschäftsregeln gehören in `lib/services/` oder zentrale Validator-/Enum-Helfer.
3. Client-Komponenten dürfen Vorschauen und Zustände berechnen, aber nie allein maßgeblich sein.
4. Server Components laden Daten direkt über Query-/Servicefunktionen.
5. Server Actions befinden sich im jeweiligen Dashboard-Modul.
6. Externe Eingaben werden serverseitig validiert.
7. Bestehende Services, Fehlerklassen, Statushelfer und Komponenten wiederverwenden.
8. Keine Parallelarchitektur, keine zweite Rollenmatrix und keine neue UI-Bibliothek einführen.
9. Mehrschrittmutationen einschließlich Audit möglichst in einer Prisma-Transaktion ausführen.
10. Kommentare oder Phase-Hinweise sind keine Implementierungsbelege; Aufrufer nachverfolgen.

## Datenbankregeln

- Prisma-Schema und TypeScript-Enums synchron halten.
- Schemaänderungen benötigen versionierte Migrationen (`prisma/migrations/` vorhanden und maßgeblich).
- `db:push` ist nur für lokale Entwicklung, nicht für Produktionsdeployments.
- Hauptobjekte mit `deletedAt` soft löschen; bestehendes Hard-Delete-Verhalten nicht still ändern.
- Positionen dürfen über bewusst definierte Cascades mit ihrem Elternobjekt gelöscht werden.
- `@unique`, Fremdschlüssel, Indizes und Nullbarkeit als fachliche Invarianten behandeln.
- Kunden-/Firmensnapshots schützen historische Angebote, Aufträge und Rechnungen.
- Nummern ausschließlich über `lib/services/number-sequence.service.ts` vergeben.
- Nummernvergabe in derselben Transaktion wie Dokumenterstellung/-finalisierung ausführen.
- Produktionsdatenbank nie für Tests, Reset oder experimentelle Migrationen verwenden.

## Berechnungsregeln

- Serverseitige Werte sind maßgeblich.
- Angebot und Auftrag verwenden `calcItemAmounts`/`calcOfferTotals`.
- `order.schema.ts` und `invoice.schema.ts` re-exportieren zentrale Angebotsberechnung.
- Leistungsnachweise verwenden `calcReportItemNet`/`calcReportTotal`.
- Geldbeträge auf Cent runden; Mengen dürfen drei Dezimalstellen besitzen.
- Persistierte Prisma-Felder verwenden `Decimal`.
- `totalGross` muss `totalNet + totalTax` entsprechen.
- UI, Service, Datenbank und PDF müssen dieselben Werte darstellen.
- Keine weitere Berechnungsimplementierung ohne belegten Bedarf hinzufügen.

## Dokumentenregeln

- Angebot: `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`,
  `CONVERTED_TO_ORDER`; Übergänge stehen in `OFFER_TRANSITIONS`.
- Auftrag: `OPEN`, `IN_PROGRESS`, `COMPLETED`, `INVOICED`, `CANCELLED`;
  Übergänge stehen in `ORDER_TRANSITIONS`.
- Rechnung: `DRAFT`, `FINALIZED`, `SENT`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`,
  `CANCELLED`, `CORRECTED`; Übergänge stehen in `INVOICE_TRANSITIONS`.
- Nur Rechnungsentwürfe bearbeiten; `INVOICE_LOCKED_STATUSES` ist verbindlich.
- Rechnungsnummer und Snapshots erst atomar bei Finalisierung vergeben.
- Storno über Gegenrechnung und Referenz zum Original, nicht durch Überschreiben.
- `ServiceReport` besitzt kein Statusmodell; keine Freigabe behaupten.
- Dokumentdateien über `Document` registrieren und nur über geschützte API ausliefern.
- PDF-Vorlagen und live erreichbare Routen existieren für Angebot, Auftrag, Leistungsnachweis,
  Rechnung und die GGA-Schrankakte — siehe `docs/PROJECT_INDEX.md`.
- Für Mahnung existiert eine Vorlage (`renderDunningPdf`), aber keine live Route — `pdfPath` wird
  bislang nur manuell gepflegt, nicht serverseitig generiert.
- Vorhandene `pdfVersion`-/`version`-Felder sind keine vollständige Versionierungslogik.

## Sicherheitsregeln

- Credentials-Login und JWT-Session über `lib/auth/options.ts` (intern) bzw.
  `lib/auth/collaboration-options.ts` (Collaboration/GGA) — zwei getrennte Auth-Domains,
  siehe `docs/PROJECT_MAP.md`.
- `proxy.ts` (Next 16, vormals `middleware.ts`) schützt alle nicht ausdrücklich ausgenommenen
  Routen; Ausnahmen sind exakte Pfad-Matches, keine Präfixe.
- Jede schreibende Server Action/API nutzt `requirePermission`; Server-Component-Seiten nutzen
  `requirePagePermission`.
- UI-Sichtbarkeit ersetzt keine serverseitige Autorisierung.
- Interne Rollen (`RoleName`): `ADMIN`, `OFFICE`, `PROJECT_MANAGER`, `EMPLOYEE`, `ACCOUNTING`.
  Collaboration-Rollen (`CollaborationRole`, eigene Domäne): siehe `docs/PROJECT_INDEX.md`.
- IDs und Objektverknüpfungen gegen unzulässigen Zugriff prüfen.
- Uploads serverseitig nach Größe, Name, Erweiterung und MIME prüfen.
- Dokumente nie direkt aus dem Storage-Pfad öffentlich ausliefern.
- Secrets nur serverseitig; `.env.local` nie committen oder dokumentieren.
- Keine Passwörter, Tokens oder vollständigen sensiblen Daten loggen.
- In-Memory-Rate-Limit ist nur für Einzelprozess-/Entwicklungsbetrieb belastbar.

## Next.js Image Optimizer

- Das Projekt verwendet aktuell kein `next/image`.
- Der interne Pfad `/_next/image` ist bewusst deaktiviert.
- Die Sperre erfolgt über einen exakten `beforeFiles`-Rewrite in `next.config.mjs`.
- Der Zielhandler `app/api/image-optimizer-disabled/route.ts` liefert HTTP 404.
- `/_next/static` darf durch diese Sperre nicht beeinflusst werden.
- Die Sperre ist eine kompensierende Sicherheitsmaßnahme wegen des transitiven
  Sharp-/libvips-Risikos in der verwendeten Next.js-Version.
- `next/image`, `images.remotePatterns`, `images.domains` oder ein eigener Image Loader dürfen
  nicht eingeführt werden, ohne diese Sicherheitsentscheidung neu zu prüfen.
- Wird `next/image` künftig benötigt, müssen die Sperre bewusst entfernt, Sharp und Next.js neu
  bewertet, Sicherheits- und Regressionstests ergänzt und alle Release-Gates erneut ausgeführt
  werden.

## Next.js Build Directories

- `next dev` verwendet `.next-dev`.
- `next build` und `next start` verwenden `.next`.
- Die getrennten Verzeichnisse isolieren parallele Entwicklungs- und Produktionsartefakte.
- Entwicklungs- und Produktionsserver dürfen nicht dasselbe Buildverzeichnis verwenden.
- `.next-dev` muss in `.gitignore` bleiben.
- `tsconfig.json` muss die generierten Typen aus `.next-dev/types` berücksichtigen.
- Änderungen an `distDir` oder den Build-Skripten erfordern einen Parallelbetrieb-Test, einen
  Produktions-Smoke-Test, einen Proxy-Test (`proxy.ts`) und die vollständigen Release-Gates.

## UI-Regeln

- Tailwind-Tokens aus `app/globals.css` und `tailwind.config.ts` verwenden.
- Vorhandene `components/shared` und Radix-Primitiven wiederverwenden.
- Deutsche Fachlabels und Statusbezeichnungen konsistent halten.
- Formulare müssen Fehler, Pendingzustand und vorhandene Eingaben bewahren.
- Kritische Lösch-, Storno- und Zahlungsaktionen bestätigen.
- Tabellen, Formulare und Navigation responsiv halten.
- Zugängliche Labels, Fokusführung, Tastaturbedienung und Tabellenköpfe sicherstellen.
- Keine rein kosmetischen Großrefactorings neben fachlichen Änderungen.

## Testregeln

Nur vorhandene Befehle verwenden:

- `npm run typecheck`
- `npm run test:run`
- `npm run lint`
- `npm run build`
- `npm run db:generate` bei Prisma-Änderungen

`npm test` startet Vitest im Watch-Modus. Der Race-Condition-Integrationstest läuft nur mit
`TEST_DATABASE_URL`; einen Skip ausdrücklich melden. Keine neue Testinfrastruktur ohne Auftrag.

- Ein normales `npm ci` erzeugt den Prisma Client über `postinstall`.
- `postinstall` führt ausschließlich `prisma generate` aus.
- Nach `npm ci --ignore-scripts` muss `npm run db:generate` ausgeführt werden.
- Typecheck und Build dürfen erst nach der Prisma-Generierung laufen.

## Arbeitsablauf

Vor jeder Änderung:

1. Relevante Anweisungen und Dateien vollständig lesen.
2. Datenfluss von UI bis Prisma nachvollziehen.
3. Geschäfts-, Sicherheits-, Daten- und Migrationsrisiken bestimmen.
4. Zuständige Skills auswählen und passende Tests festlegen.
5. Nutzeränderungen und Scope bewahren.

Nach jeder Änderung:

1. Diff auf unbeabsichtigte Änderungen und Geheimnisse prüfen.
2. Zielgerichtete und anschließend passende Gesamttests ausführen.
3. `npm run typecheck` ausführen.
4. `npm run lint` ausführen.
5. `npm run build` ausführen, sofern angemessen.
6. Bei Prisma `npm run db:generate`; Migration nicht ohne Autorisierung ausführen.
7. Exitcodes, Skips, Warnungen und offene Risiken wahrheitsgemäß dokumentieren.

## Skills

- `twir-business-workflow`: fachlichen End-to-End-Ablauf schützen.
- `twir-calculation-integrity`: Geld-, Steuer- und Rundungswerte sichern.
- `twir-database-migration`: versionierte Schemaänderungen planen.
- `twir-invoice-compliance`: Rechnungsfinalisierung, Snapshots und Storno prüfen.
- `twir-numbering-and-identifiers`: atomare Dokumentnummern sichern.
- `twir-project-audit`: read-only Gesamtzustand analysieren.
- `twir-release-gate`: Go/No-Go anhand aller Gates entscheiden.
- `twir-safe-feature-development`: kleine Änderungen architekturtreu umsetzen.
- `twir-testing`: Vitest-Strategie und Regressionstests steuern.
- `twir-document-lifecycle`: Statusübergänge und Historisierung prüfen.
- `twir-auth-security`: Authentifizierung und Servergrenzen absichern.
- `twir-role-permissions`: bestehende Rollenmatrix konsistent halten.
- `twir-pdf-document-quality`: vorhandene PDF-Vorlagen und Daten prüfen.
- `twir-ui-ux`: Business-UI konsistent und responsiv halten.
- `twir-accessibility`: technische Barrierefreiheit prüfen.
- `twir-api-server-actions`: APIs und Actions validieren und absichern.
- `twir-prisma-data-integrity`: Relationen, Constraints und Queries prüfen.
- `twir-error-handling`: Fehlerpfade durchgängig behandeln.
- `twir-logging-audit`: technische Logs und fachliches Audit trennen.
- `twir-code-review`: konkrete Diffs risikobasiert reviewen.
- `twir-performance`: nur belegte Engpässe optimieren.
- `twir-documentation-sync`: Dokumentation mit Code synchronisieren.
- `twir-deployment-operations`: Build, Migration und Betrieb vorbereiten.

## Skill-Kombinationen

- Angebots-/Auftragsberechnung: `twir-business-workflow`,
  `twir-calculation-integrity`, `twir-testing`, `twir-safe-feature-development`.
- Rechnung: `twir-invoice-compliance`, `twir-calculation-integrity`,
  `twir-document-lifecycle`, `twir-numbering-and-identifiers`, `twir-testing`.
- PDF: `twir-pdf-document-quality`, bei Rechnung zusätzlich
  `twir-invoice-compliance`, sowie `twir-testing`.
- Prisma-Schema: `twir-database-migration`, `twir-prisma-data-integrity`,
  `twir-testing`, `twir-release-gate`.
- Rollen/Rechte: `twir-auth-security`, `twir-role-permissions`,
  `twir-logging-audit`, `twir-testing`.
- API/Server Action: `twir-api-server-actions`, `twir-auth-security`,
  `twir-error-handling`, `twir-testing`.
- UI: `twir-ui-ux`, `twir-accessibility`, bei Fachlogik zusätzlich den Domänenskill.
- Release: `twir-release-gate`, `twir-deployment-operations`,
  `twir-documentation-sync`.

## Code Review Rules

Findings nach kritisch, hoch, mittel und niedrig ausgeben und Datei/Position nennen.

Besonders prüfen:

- korrekte Verknüpfung Kunde → Angebot/Auftrag → Leistungsnachweis → Rechnung → Zahlung,
- serverseitige Berechnung und Rundung,
- erlaubte Statusübergänge und gesperrte Dokumente,
- Snapshot- und Datenintegrität,
- Rechte an Server Actions und APIs,
- sichere Migrationen und Löschwirkungen,
- atomare Nummernvergabe,
- Audit kritischer Aktionen,
- PDF-Konsistenz,
- Fehlerpfade, Doppelübermittlung und fehlende Tests.

Keine Vermutung als Finding ausgeben und keine Stilpräferenz zum Blocker erklären.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
