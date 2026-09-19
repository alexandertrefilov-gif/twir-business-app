# Bericht DB-DRIFT-001

**Erzeugt:** 2026-09-19T07:22:15.346Z
**Endstatus:** BLOCKED
**Repair-Versuche:** 1/1

## Automatisch ermittelte Fakten (nicht von Claude Code verfasst)

- FILES_CHANGED seit Task-Aktivierung (Baseline-Diff): `.agent/queue/DB-DRIFT-001.md`, `.agent/active/DB-DRIFT-001.md`
- Dateien außerhalb FILES_ALLOWED geändert: keine
- FILES_PROTECTED angetastet: nein
- Gesamter uncommitted Diff des Arbeitsbaums (zur Einordnung, enthält ggf. unrelated Vorarbeit): 68 Datei(en)
- Letzter Gate-Lauf: {
  "at": "2026-09-19T07:21:07.142Z",
  "typecheck": "PASS",
  "lint": "PASS",
  "test_run": "FAIL",
  "test_summary": {
    "files": {
      "failed": 1,
      "passed": 112,
      "skipped": 1
    },
    "tests": {
      "failed": 1,
      "passed": 1133,
      "skipped": 1
    }
  },
  "db_test_status": "NOT_APPLICABLE",
  "db_gate_probe": null,
  "build": "PASS",
  "playwright": "NOT_APPLICABLE",
  "result": "FAIL"
}


## Bericht von Claude Code

_FORMAT

Zusätzlich zu den Standardfeldern aus `docs/agent/DEVELOPMENT_PIPELINE.md`
Abschnitt 4 MUSS der Bericht folgende Felder enthalten:

```
DB-DRIFT-001 RESULT:
DRIFT CONFIRMED:
AFFECTED TABLES:
TABLE ROW COUNTS:
CURRENT SCHEMA MODELS:
MIGRATION HISTORY:
DB MIGRATION HISTORY:
FIRST APPEARANCE:
CURRENT CODE USAGE:
SEED USAGE:
TEST USAGE:
ROOT CAUSE:
DATABASE IS AHEAD:
SCHEMA IS AHEAD:
MISSING MIGRATION:
MISSING PRISMA MODELS:
TABLES STILL REQUIRED:
DATA LOSS RISK:
SAFE RECONCILIATION OPTIONS:
RECOMMENDED OPTION:
PRODUCTION IMPACT UNKNOWN:
SCHEMA CHANGE REQUIRED:
MIGRATION CHANGE REQUIRED:
READY FOR FIX:
```

## REPORT

DB-DRIFT-001 RESULT: Ursache vollständig geklärt. Der bei REQ-018.1 entdeckte "Drift" ist **kein unbeabsichtigter Fehler**, sondern ein bereits vollständig dokumentierter, bewusster Zwischenzustand aus einer Migrations-Rebaseline vom 2026-09-15 (`docs/database/MIGRATION_STRATEGY.md`, Abschnitt "Address-Policy"). Diese Datei war zum Zeitpunkt von REQ-018.1 im Repository bereits vorhanden, aber als untracked (`??`) noch nicht committed und wurde im REQ-018.1-Audit nicht gezielt gesucht. Kein Fix nötig für die Kernursache — die Legacy-Tabellen sind ABSICHTLICH so belassen. Ein kleiner, klar abgegrenzter Nachschärfbedarf bleibt (siehe RISKS).

DRIFT CONFIRMED: Ja, physisch bestätigt — aber als DOKUMENTIERTER, BEABSICHTIGTER Zustand, nicht als unentdeckter Fehler.

AFFECTED TABLES: `customer_billing_addresses`, `customer_delivery_addresses` (beide real in der lokalen Dev-DB vorhanden, real per `psql \dt`/`information_schema.tables` bestätigt). Zusätzlich `_prisma_migrations_legacy_20260915` (kein fachliches Datenmodell — reine archivierte Migrations-Bookkeeping-Tabelle, siehe unten).

TABLE ROW COUNTS (real, read-only gegen die lokale Dev-DB ermittelt):
- `customer_billing_addresses`: 1
- `customer_delivery_addresses`: 0
- `customer_addresses` (aktuelles Modell): 1
- `addresses` (aktuelles Modell): 1
- `_prisma_migrations` (aktive Historie): 5 Einträge
- `_prisma_migrations_legacy_20260915` (archivierte Historie): 24 Einträge

CURRENT SCHEMA MODELS: `prisma/schema.prisma` kennt `Customer`, `Address`, `CustomerAddress` (`@@map("customer_addresses")`, polymorph über `CustomerAddressType` = `BILLING`/`SHIPPING`) — **kein** `CustomerBillingAddress`/`CustomerDeliveryAddress`-Modell, und laut `MIGRATION_STRATEGY.md` auch bewusst nicht vorgesehen ("gehören nicht zum neuen kanonischen Prisma-Modell").

MIGRATION HISTORY: `prisma/migrations/` enthält genau 5 Migrationen, beginnend mit `20260915000000_canonical_baseline` (erzeugt u. a. `customers`, `addresses`, `customer_addresses` — real per `grep "CREATE TABLE"` verifiziert, **keine** `customer_billing_addresses`/`customer_delivery_addresses`). Die ALTE, vollständige Kette (24 Migrationen, `20260427151033_init` bis `20260915130000_add_internal_project_foundation`) liegt unverändert archiviert unter `prisma/migrations_archive_20260915_pre_canonical_baseline/` — inkl. `20260831190000_add_customer_billing_addresses`, `20260903090000_add_customer_delivery_addresses` und `20260903160000_share_customer_addresses` (migriert die Legacy-Daten per `INSERT ... SELECT` in `addresses`/`customer_addresses`, lässt die Legacy-Tabellen laut eigenem SQL-Kommentar ausdrücklich unangetastet stehen: *"Die Legacy-Tabellen bleiben für einen einfachen Rollback erhalten. Der Anwendungscode liest und schreibt nach dieser Migration ausschließlich addresses/customer_addresses."*). In keiner Migration (aktiv oder archiviert) existiert ein `DROP TABLE` für die beiden Legacy-Tabellen (real per `grep -r "DROP TABLE.*customer_billing_addresses\|DROP TABLE.*customer_delivery_addresses" prisma/` verifiziert — kein Treffer).

DB MIGRATION HISTORY (aus `_prisma_migrations`, real per `psql` gelesen): exakt deckungsgleich mit dem aktiven `prisma/migrations/`-Verzeichnis (5/5, gleiche Namen, chronologisch `20260915000000_canonical_baseline` → `20260919064836_req_018_1_gga_cabinet_pruefnachweis`). `_prisma_migrations_legacy_20260915` enthält die 24 alten Einträge von `20260427151033_init` bis `20260915130000_add_internal_project_foundation` — exakt wie in `MIGRATION_STRATEGY.md` Abschnitt "Existing-DB-Upgrade" Schritt 4 beschrieben (`ALTER TABLE ... RENAME TO _prisma_migrations_legacy_YYYYMMDD`). Kein Widerspruch zwischen dokumentiertem Verfahren und real vorgefundenem DB-Zustand.

FIRST APPEARANCE: `customer_billing_addresses` wurde am 2026-08-31 angelegt (archivierte Migration `20260831190000_add_customer_billing_addresses`, mit einmaligem Backfill aus den vorher flachen `Customer.billingName`/`billingStreet`-Feldern — erklärt die 1 Zeile). `customer_delivery_addresses` am 2026-09-03 (`20260903090000_add_customer_delivery_addresses`, ohne Backfill — erklärt 0 Zeilen). Am 2026-09-03 wurden beide per `20260903160000_share_customer_addresses` in das neue, geteilte Modell überführt, aber bewusst NICHT gelöscht. Am 2026-09-15 wurde die Migrationshistorie auf eine neue kanonische Baseline umgestellt (`docs/database/MIGRATION_STRATEGY.md`) — dabei wurden die beiden Legacy-Tabellen laut Dokument bewusst NICHT in die neue Baseline übernommen, aber auch nicht gelöscht ("Auf bestehenden Datenbanken bleiben sie physisch und unverändert erhalten").

CURRENT CODE USAGE: Kein Treffer für `customer_billing_addresses`/`customer_delivery_addresses` in `lib/`, `app/`, `components/` (real per `grep` verifiziert — leer). Die aktuellen Services `lib/services/customer-billing-address.service.ts`/`customer-delivery-address.service.ts` delegieren vollständig an `lib/services/customer-address.service.ts` (`getCustomerAddress(...)` etc.), welches ausschließlich `customer_addresses`/`addresses` liest/schreibt (Prisma-Client, kein Raw-SQL gegen die Legacy-Tabellen). Die Legacy-Tabellen werden von keinem laufenden Codepfad mehr gelesen oder beschrieben.

SEED USAGE: `prisma/seed/seed.ts` enthält keinen Treffer für Billing-/Delivery-Address-Begriffe (real per `grep` verifiziert) — der Seed schreibt nicht in die Legacy-Tabellen. Die vorhandene 1 Zeile in `customer_billing_addresses` stammt nachweislich aus dem einmaligen historischen Migrations-Backfill (2026-08-31), nicht aus dem aktuellen Seed-Lauf.

TEST USAGE: `tests/unit/customer-billing-address.test.ts` und `tests/unit/customer-delivery-address.test.ts` referenzieren die Tabellennamen, aber ausschließlich als **Text-Assertion gegen die archivierte Migrations-SQL-Datei** (`readFileSync(...share_customer_addresses/migration.sql...)`, z. B. `expect(migration).not.toContain('DROP TABLE')`) — kein Test führt eine lebende Query gegen die physischen Legacy-Tabellen aus. Regressionsschutz gegen ein versehentliches künftiges `DROP TABLE` in dieser einen archivierten Datei, nicht mehr.

ROOT CAUSE: Bewusste, dokumentierte Design-Entscheidung im Rahmen der Migrations-Rebaseline vom 2026-09-15 (`docs/database/MIGRATION_STRATEGY.md`, Abschnitte "Address-Policy" und "Existing-DB-Upgrade"): die zwei Legacy-Tabellen wurden als Rollback-Sicherheitsnetz nach der Datenmigration in das neue Modell bewusst NICHT gelöscht und bewusst NICHT in die neue kanonische Baseline-Migration aufgenommen. Der Zustand ist exakt der, den das Dokument selbst vorhersagt: *"Ein Schema-Diff darf deshalb für diese Tabellen erwartete Drops anzeigen, die niemals blind auszuführen sind."* — genau das ist der Reset-Vorschlag, den `prisma migrate dev` bei REQ-018.1 anzeigte und der korrekt abgelehnt wurde.

DATABASE IS AHEAD: Ja — für genau diese zwei Tabellen (physisch vorhanden, in keiner aktiven Migration/keinem aktuellen Schema referenziert). Für alles andere: NEIN, DB-Migrationshistorie und `prisma/migrations/`-Verzeichnis sind exakt deckungsgleich (5/5).

SCHEMA IS AHEAD: Nein, keine Hinweise gefunden (kein Modell in `schema.prisma` ohne zugehörige angewendete Migration).

MISSING MIGRATION: Keine — die Historie ist vollständig und konsistent (aktive Kette 5/5 deckungsgleich, archivierte Kette 24 Einträge lückenlos vorhanden und unverändert als Archiv erhalten).

MISSING PRISMA MODELS: Keine fehlenden Modelle im Sinne von "sollten existieren, fehlen aber". `CustomerBillingAddress`/`CustomerDeliveryAddress` fehlen bewusst — sie wurden durch das polymorphe `CustomerAddress`-Modell ersetzt, wie in `MIGRATION_STRATEGY.md` explizit festgehalten.

TABLES STILL REQUIRED: Fachlich/produktiv NICHT mehr erforderlich für den laufenden Anwendungscode (kein Codepfad nutzt sie). Sie sind ausschließlich als vom Auftraggeber/vorherigem Bearbeiter bewusst gewähltes Rollback-Sicherheitsnetz vorgesehen — eine Entscheidung darüber, wie lange dieses Sicherheitsnetz noch gebraucht wird, wurde in `MIGRATION_STRATEGY.md` nicht terminiert (kein Ablaufdatum/keine Freigabebedingung für eine spätere Löschung dokumentiert).

DATA LOSS RISK: Aktuell sehr gering auf der LOKALEN Dev-DB (1 Zeile in `customer_billing_addresses`, 0 in `customer_delivery_addresses`, beide nachweislich bereits redundant in `addresses`/`customer_addresses` vorhanden). **Nicht geprüft und nicht bekannt:** ob eine etwaige Produktivdatenbank denselben oder einen abweichenden Zustand hat und ob dort ggf. mehr Zeilen betroffen wären — dieser Task hatte ausdrücklich keinen Produktionszugang und hat keinen angefordert/hergestellt (siehe PRODUCTION IMPACT UNKNOWN).

SAFE RECONCILIATION OPTIONS (rein informativ, NICHT ausgeführt):
1. **Nichts tun** — Zustand ist laut vorhandener Dokumentation bereits der beabsichtigte Zwischenzustand. Risiko: `prisma migrate dev` bleibt für jeden künftigen Bearbeiter destruktiv-vorschlagend, bis explizit anders behandelt.
2. **Legacy-Tabellen dauerhaft explizit archivieren statt droppen** — z. B. per additiver, nicht-destruktiver Migration in ein separates Schema (`legacy`) verschieben (`ALTER TABLE ... SET SCHEMA legacy`) statt im `public`-Schema zu belassen — behält die Daten vollständig, entfernt aber den ständigen Diff-Konflikt mit `public`. Erfordert eigene Freigabe und eigenen Task.
3. **Legacy-Tabellen nach expliziter Freigabe droppen**, NACHDEM zuvor (a) auf einer etwaigen Produktivdatenbank derselbe Befund bestätigt wurde und (b) ein vollständiger Dump als Rollback-Sicherung existiert (deckt sich mit dem bereits in `MIGRATION_STRATEGY.md` beschriebenen Rollback-Verfahren). Frühestens NACH separatem, ausdrücklichem Auftrag.

RECOMMENDED OPTION: Keine einseitige Empfehlung zwischen Option 1/2/3 — das ist eine Entscheidung, die von der (hier nicht geprüften) Situation auf einer etwaigen Produktivdatenbank abhängt. Empfehlung nur für den NÄCHSTEN Schritt: `docs/database/MIGRATION_STRATEGY.md` um ein explizites Ablaufdatum/eine explizite Freigabebedingung für die Legacy-Tabellen ergänzen (Dokumentationsergänzung, kein Schema-/DB-Eingriff) und für jeden künftigen `prisma migrate dev`-Aufruf auf dieser Dev-DB vorab auf dieses Dokument verweisen, damit der Reset-Dialog nicht erneut als unbekannter Vorfall behandelt wird.

PRODUCTION IMPACT UNKNOWN: Ja, ausdrücklich unbekannt — dieser Task hatte laut Auftrag keinen Zugang zu einer Produktivdatenbank und hat keinen hergestellt. Ob eine Produktivdatenbank denselben Rebaseline-Vorgang bereits durchlaufen hat und ob dort reale (nicht nur Demo-)Rechnungs-/Lieferadressen in den Legacy-Tabellen liegen, ist ungeklärt.

SCHEMA CHANGE REQUIRED: Nein, für die Kernursache nicht. Keine Änderung an `prisma/schema.prisma` in diesem Task vorgenommen oder empfohlen.

MIGRATION CHANGE REQUIRED: Nein für die Kernursache. Optional (siehe SAFE RECONCILIATION OPTIONS 2/3), aber nur nach separater, ausdrücklicher Freigabe — nicht Teil dieses Tasks.

READY FOR FIX: Nein — dieser Task liefert bewusst nur den Befund. Kein Fix wurde vorgenommen oder vorbereitet. Eine etwaige spätere Bereinigung (Option 2 oder 3) benötigt einen eigenen, separat zu beauftragenden Pipeline-Task.

FILES CHANGED: Keine (`files_allowed: []`, real per Scope-Check bestätigt — siehe automatisch generierter Abschnitt im zugehörigen `.agent/reports/DB-DRIFT-001.md`).

RISKS:
1. **Größtes verbleibendes Risiko unverändert:** Jeder künftige `prisma migrate dev`-Aufruf auf dieser lokalen Dev-DB zeigt weiterhin den destruktiven Reset-Vorschlag für die zwei Legacy-Tabellen — das ist laut `MIGRATION_STRATEGY.md` erwartet, aber ohne diesen Bericht/das Dokument im Blick leicht mit einem "echten" Drift zu verwechseln (wie bei REQ-018.1 geschehen). Empfehlung: vor jeder künftigen `prisma migrate dev`-Nutzung zuerst `docs/database/MIGRATION_STRATEGY.md` konsultieren.
2. `docs/database/MIGRATION_STRATEGY.md` selbst war zum Zeitpunkt von REQ-018.1 bereits im Arbeitsverzeichnis vorhanden, aber noch nicht committed (`??` in `git status`) — sie existiert also aktuell ausschließlich lokal. Sollte perspektivisch eingecheckt werden, damit sie nicht versehentlich verloren geht und für jeden künftigen Bearbeiter sichtbar ist (reine Empfehlung, kein Commit in diesem Task ausgeführt).
3. Kein terminiertes Enddatum/keine Freigabebedingung für die Legacy-Tabellen dokumentiert — ohne das bleibt unklar, wer wann Option 2/3 anstoßen soll.

READY FOR FIX (Wiederholung zur Klarheit): Nein.


