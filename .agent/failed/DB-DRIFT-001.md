<!-- AGENT-META
{
  "id": "DB-DRIFT-001",
  "title": "Customer Address Prisma Schema Drift Audit",
  "status": "BLOCKED",
  "priority": "P0",
  "type": "READ_ONLY_AUDIT",
  "scope": "single",
  "files_allowed": [],
  "files_protected": [
    "prisma/schema.prisma",
    "prisma/migrations",
    "prisma/seed/seed.ts"
  ],
  "tests_required": [],
  "db_test_required": false,
  "playwright_required": false,
  "browser_qa_required": false,
  "manual_approval_required": true,
  "report_format": "db-drift-001-audit",
  "created": "2026-09-19",
  "max_repair_attempts": 1,
  "repair_attempts": 1,
  "started_at": "2026-09-19T07:17:46.438Z",
  "baseline_git_status": [
    "app/(collaboration)/collaboration/cabinets/[id]/pruefung/page.tsx",
    "app/(collaboration)/collaboration/projects/[id]/page.tsx",
    "app/(dashboard)/offers/actions.ts",
    "app/(dashboard)/orders/actions.ts",
    "app/(dashboard)/services/actions.ts",
    "app/api/collaboration/workflow/route.ts",
    "components/collaboration/GgaCabinetInspectionWizard.tsx",
    "docs/architecture/system-overview.md",
    "docs/business/business-workflow.md",
    "docs/database/data-model.md",
    "lib/collaboration/cabinet-workflow.ts",
    "lib/collaboration/project-workflow.ts",
    "lib/services/collaboration-phase2.service.ts",
    "lib/services/collaboration-project.service.ts",
    "lib/services/gga-cabinet-schrankakte.service.ts",
    "lib/services/gga-cabinet.service.ts",
    "package.json",
    "prisma/schema.prisma",
    "prisma/seed/seed.ts",
    "tests/integration/collaboration-gga-restructure-db.test.ts",
    "tests/integration/gga-cabinet-db.test.ts",
    "tests/integration/gga-cabinet-inspection-db.test.ts",
    "tests/integration/gga-operator-portal-db.test.ts",
    "tests/integration/race-condition.test.ts",
    "tests/unit/cabinet-workflow.test.ts",
    "tests/unit/collaboration-phase3-mutations.test.ts",
    "tests/unit/collaboration-project-workflow.test.ts",
    ".agent/active/.gitkeep",
    ".agent/completed/.gitkeep",
    ".agent/completed/PIPELINE-001.md",
    ".agent/completed/PIPELINE-002.md",
    ".agent/completed/REQ-015.2-A.md",
    ".agent/completed/REQ-015.2-B.md",
    ".agent/completed/REQ-015.2-C.md",
    ".agent/completed/REQ-015.3.md",
    ".agent/completed/REQ-015.4.md",
    ".agent/completed/REQ-018.1.md",
    ".agent/completed/REQ-018.md",
    ".agent/failed/.gitkeep",
    ".agent/queue/DB-DRIFT-001.md",
    ".agent/reports/.gitkeep",
    ".agent/reports/PIPELINE-001.md",
    ".agent/reports/PIPELINE-002.md",
    ".agent/reports/REQ-015.3.md",
    ".agent/reports/REQ-015.4.md",
    ".agent/reports/REQ-018.1-browser-qa.md",
    ".agent/reports/REQ-018.1.md",
    ".agent/reports/REQ-018.md",
    ".agent/reports/latest.json",
    ".agent/reports/latest.md",
    ".agents/skills/twir-agent-pipeline/SKILL.md",
    ".agents/skills/twir-agent-pipeline/agents/openai.yaml",
    "components/collaboration/CollaborationProjectStatusActions.tsx",
    "components/shared/DocumentEditorCanvas.tsx",
    "docs/agent/APPROVAL_POLICY.md",
    "docs/agent/DEVELOPMENT_PIPELINE.md",
    "docs/agent/REQUIREMENT_FORMAT.md",
    "docs/agent/TEST_POLICY.md",
    "docs/database/MIGRATION_STRATEGY.md",
    "prisma/migrations/20260919064836_req_018_1_gga_cabinet_pruefnachweis/migration.sql",
    "scripts/agent/finish-task.mjs",
    "scripts/agent/lib/git-fingerprint.mjs",
    "scripts/agent/lib/task-meta.mjs",
    "scripts/agent/next-task.mjs",
    "scripts/agent/run-gates.mjs",
    "scripts/agent/validate-task.mjs",
    "tests/integration/customer-purchase-order-e2e.test.ts",
    "tests/integration/gga-cabinet-pruefnachweise-db.test.ts"
  ],
  "baseline_fingerprints": {
    "app/(collaboration)/collaboration/cabinets/[id]/pruefung/page.tsx": "981f299bc342c7624a619bb6a1455339897f873be7ed0754235dd6f8c3727c1d",
    "app/(collaboration)/collaboration/projects/[id]/page.tsx": "b072ebf71769f81a6a8f94bc079e20dce1e3961edbad047e689fbf334069e9d3",
    "app/(dashboard)/offers/actions.ts": "06b87bfd5fc4ee6b3c7153493901eebea6a9e87cb0fe6b94fed6c0241e1ae5e7",
    "app/(dashboard)/orders/actions.ts": "89234fa33c31d21c35ca9c296e4e1912505c695859bde7f796e776df760699d6",
    "app/(dashboard)/services/actions.ts": "1ee36788a3dd90fc8d0a3fa1655c21a864b9b6633af86956d67968c85c145dce",
    "app/api/collaboration/workflow/route.ts": "df36bd020a570737f309e5fa17af5f85e4e4a0c0a5200b8f18cbf592a1271838",
    "components/collaboration/GgaCabinetInspectionWizard.tsx": "0c258a99e1a1dd8583494216f87e4d37b37177995d896a5cf3bd72c0a267c6d2",
    "docs/architecture/system-overview.md": "0df1e0fdb21df0667a1a8b5b04d1d529255a765b6f502ccec5f487fd8bf32712",
    "docs/business/business-workflow.md": "175d41ed3cdc44740fc9a4dcac328b98ca71e0c6927a7bf47418cf8fe9c3c721",
    "docs/database/data-model.md": "5b6f39451fcb9fae8ec85e7f698e8e0a6436049c8672427fd43814851abf898c",
    "lib/collaboration/cabinet-workflow.ts": "563b8d1b50e230daac2a10d32da94d9211caa4a0a90026333efd5f27c80f221d",
    "lib/collaboration/project-workflow.ts": "c186c9c2d4c602bc2cdb84c4d991210254c0af74125a6eed6c1456d8d8442277",
    "lib/services/collaboration-phase2.service.ts": "37e0e9427ce77df175e1525757a36f2aca2bbfe9abecf360d03462c606375bc8",
    "lib/services/collaboration-project.service.ts": "f21a16d6e91e4dd1cac3d3b3ae94b02cd1a12349f0923fc2e218ebe50a5f7964",
    "lib/services/gga-cabinet-schrankakte.service.ts": "dd7fa1d314220baa3894c270ec9086cffbf5c28fe092fde3b195a55b41d19ede",
    "lib/services/gga-cabinet.service.ts": "449727ae1f0ce396fa4b5f90f1093410b98a500d3aa53c42f859deefaa10b065",
    "package.json": "a73b0870688ffc0947677474f92a2905b9ca362d41e123ef130ec59eec4e3558",
    "prisma/schema.prisma": "514f17d37b55b849631f3eb84039f3448fad42ccab3d49ecda22c582570cd6ca",
    "prisma/seed/seed.ts": "3a70012fd9e38d3dae94505d6e515d39ebab1a9854d835a90ca113d34dea12cd",
    "tests/integration/collaboration-gga-restructure-db.test.ts": "2a48f697d64cef2e07212e5bc25dbeb8f81179c213794c2f026fe5454e54f0bd",
    "tests/integration/gga-cabinet-db.test.ts": "a3c4f87bc1f54c4933f95e68229247d7f408af12167a0d1653c404653ab36e5e",
    "tests/integration/gga-cabinet-inspection-db.test.ts": "139ca8d37e286d4c5a732a5921a5d0d5a11dc6ff26693da5a3bd048d0177f25e",
    "tests/integration/gga-operator-portal-db.test.ts": "56ce40961f7dcc3ac311f87744fb52d9a1edc4cd7d8c309bbdb45901c56848db",
    "tests/integration/race-condition.test.ts": "2a65989babceabfaaf5fe50931580576d4f6a233359ebb6fcad8c18bd11edc62",
    "tests/unit/cabinet-workflow.test.ts": "cbfaed1685e3f1d76830c99e373b26c59c97c438dd1712ab31f4747f582cafd4",
    "tests/unit/collaboration-phase3-mutations.test.ts": "14d36e898030b6895324e418454cf2d48b42397f21f56375a488ca40ac3d317c",
    "tests/unit/collaboration-project-workflow.test.ts": "053ea217935a9057a9be9c2aa583fa05a85a9e8a78c2e973607a03e4366de35e",
    ".agent/active/.gitkeep": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".agent/completed/.gitkeep": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".agent/completed/PIPELINE-001.md": "8935a9bf8ee562ad8d0b2e33e5960c3706a06b6bab9ebb982aedbbac2ae7f9f3",
    ".agent/completed/PIPELINE-002.md": "bdc5dc2d97618f1adf45a54b87fb207c24e7b314717f67157d78a1b7498ac695",
    ".agent/completed/REQ-015.2-A.md": "925674d13fe6e0f2761c34a6f45b4450b57c0773a4a18ed47fc6c17e7c0a805d",
    ".agent/completed/REQ-015.2-B.md": "669bb29cde4fb4d137b9e5df65fd3cb498693e3a9a9c232f7a8ee6b003733e6b",
    ".agent/completed/REQ-015.2-C.md": "317f85129e60e5ded1a0779fe757ce20118909c9ce9b677e3572f0197fc3d50f",
    ".agent/completed/REQ-015.3.md": "27555618f6ec6efdc3f3336e67f36f369812b79dbb977e3acf9984e6d6b5a127",
    ".agent/completed/REQ-015.4.md": "7384eda24e64155a267c227a9aaaace88763e2dae17abb84a5c56038d6576da8",
    ".agent/completed/REQ-018.1.md": "00c90a7b3e61c830a4b7feb058674587fbcad09eeb348c1d73a2e3b2702c325e",
    ".agent/completed/REQ-018.md": "ef30aadca8876790e1d60c33b72649df092b7cae93faa4502db6b5fb7687f940",
    ".agent/failed/.gitkeep": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".agent/queue/DB-DRIFT-001.md": "6e978618584eed578e33fa3b41e78b1a1c2fb48a347170a583a1acf09c9e7fe5",
    ".agent/reports/.gitkeep": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".agent/reports/PIPELINE-001.md": "582485f65f3f0f33db1b798b1da7db2559e219c2bdb037c3a6a7638240f9aedb",
    ".agent/reports/PIPELINE-002.md": "fbb6913f6a54338362b88ec3c96b7cf437064997b1d9f08f2c4bd6fa0655daa3",
    ".agent/reports/REQ-015.3.md": "50eb9a0767f8e79fb3abd9857f15872f4c4748b69e3f8171899b2131a0bd7a0f",
    ".agent/reports/REQ-015.4.md": "4992e6fee00050cd4d0b10cd1f44c1e1bc82531a074f4401fc23b3711f28173b",
    ".agent/reports/REQ-018.1-browser-qa.md": "cce467b9936cf918d60039b869b049ae18c1d58cdb24f0bbb8649b3e7cc9acf5",
    ".agent/reports/REQ-018.1.md": "ec5a87462ed29c5a26c27fd3417f940f25e4682f0a405ebfa734dfb5ba5156ac",
    ".agent/reports/REQ-018.md": "26bcd75b6cfe5940858d8973a98cb014ca06c44c4bc91999cc0be7af006f736a",
    ".agent/reports/latest.json": "52ab22d1b154133afb4d3d0bb9ec872a4621e332b2bff9f70536123127721c33",
    ".agent/reports/latest.md": "ec5a87462ed29c5a26c27fd3417f940f25e4682f0a405ebfa734dfb5ba5156ac",
    ".agents/skills/twir-agent-pipeline/SKILL.md": "ab5dfd48b42d7ff8c6798a9efa08e5a232cf171513e5722943ec5884d41da3b0",
    ".agents/skills/twir-agent-pipeline/agents/openai.yaml": "9c1fa168fd0ccca64f968ea07dd62d2e19dc7114dfa3c6bb2df0358c335aeb5c",
    "components/collaboration/CollaborationProjectStatusActions.tsx": "ef67add7d84a9b2a614e139c6d8fdbb89c3f2f4ebe50e44d8c2e778ceb29377a",
    "components/shared/DocumentEditorCanvas.tsx": "d3ad63a8de9e3def7016f08b78cefb8b173f4ff7154bb160dec27f42e29d5825",
    "docs/agent/APPROVAL_POLICY.md": "69c5167042e364c1e1bcf263c4d44d5ee9b8aa9cb365a248732c65e92640e653",
    "docs/agent/DEVELOPMENT_PIPELINE.md": "5c24aed7e7c8b7298925cb44f769cd9434854ce0d700cdaf83949191dfa3d37b",
    "docs/agent/REQUIREMENT_FORMAT.md": "ce9461943cafbb8bae452f78ac47a0d828b424394267da1a6aa8528cbaf2bfec",
    "docs/agent/TEST_POLICY.md": "f18b98bc3b3e55d2476bad217c88e0015e5ed99b1fe6ec8cd5eda6398a6255ab",
    "docs/database/MIGRATION_STRATEGY.md": "ee667c03702b586b09bbb54e66257a5cc6bb18f45717ea0f3e81b1ba5c9b911d",
    "prisma/migrations/20260919064836_req_018_1_gga_cabinet_pruefnachweis/migration.sql": "f028d2c7f54fe0c13e6fcc8269511c7cac9b5c35109722e9db5759a835073037",
    "scripts/agent/finish-task.mjs": "cea236ed4ac2b3ac34abc947c64f8717ea661e26d4bb3eb1cd60074a990ca5dd",
    "scripts/agent/lib/git-fingerprint.mjs": "23a5aadf9cf5377bb52edeaeac1976374d3f832f7a7e2beecbe29d2c6d57e111",
    "scripts/agent/lib/task-meta.mjs": "871b8ef5da7b7f8a9f4daecb49df2ce5027bc3a8ea1aae0b31e9ef13e88d6ac5",
    "scripts/agent/next-task.mjs": "17236fbe4ae989120b253f333689003699908b13a63854a839621a3a02f41de6",
    "scripts/agent/run-gates.mjs": "0a26a2402d026670bcaf0052bd54d8ef9bc11ce3fea1604476fe5173d1e35ebd",
    "scripts/agent/validate-task.mjs": "15a4da41ebb3bcef0ae531dd06884dd7d313fb1920f2c0c482daf425e550ab02",
    "tests/integration/customer-purchase-order-e2e.test.ts": "f5bd5ed408d2afd8b0f977c8d07f391bb429900e3a693481501d1c3c80e794a4",
    "tests/integration/gga-cabinet-pruefnachweise-db.test.ts": "5fd260d0c64ee6ccf06a668629563b42393ad75bf7aed5d9da5706751c8ab367"
  },
  "last_gate_run": {
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
  },
  "blocked_reason": "Repair-Limit (1) erreicht — siehe last_gate_run für die letzte Fehlerursache.",
  "finished_at": "2026-09-19T07:22:15.348Z",
  "report_path": ".agent/reports/DB-DRIFT-001.md",
  "functional_approval": "APPROVED",
  "functional_approved_at": "2026-09-19T08:01:47.093Z",
  "functional_approved_by": "info@tb-twir.com",
  "functional_approval_note": "Pipeline-Status BLOCKED bleibt unveraendert (nicht rueckwirkend manipuliert) — der Audit-Befund selbst gilt als fachlich abgeschlossen und freigegeben."
}
-->
> **Status:** BLOCKED · **Priority:** P0 · **Type:** READ_ONLY_AUDIT · **Repair-Versuche:** 1/1

## CONTEXT

## APPROVAL

Fachlich am 2026-09-19 von Alex (info@tb-twir.com) im Chat freigegeben ("DB-DRIFT-001 AUDIT: FACHLICH APPROVED"). Ergebnis bestaetigt: kein unbekannter DB-Drift, Legacy-Address-Tabellen und kanonische Migration-Baseline sind bewusst vorhanden, kein Datenbank-Fix erforderlich. Der Pipeline-Status bleibt gemaess ausdruecklicher Weisung `BLOCKED` (nicht rueckwirkend manipuliert) — der Task-Status spiegelt weiterhin, dass das automatische Gate wegen zu eng gewaehltem `max_repair_attempts` (Fehler bei der Task-Vorbereitung, siehe Bericht) nicht READY_FOR_REVIEW erreicht hat; die fachliche Freigabe steht unabhaengig davon in diesem Abschnitt und in `functional_approval`. DB-DRIFT-001 benoetigt keine weitere fachliche Umsetzung. Dokumentations-Nachtrag als eigener Task DB-DOC-001 vorgemerkt (noch nicht ausgefuehrt).


Während REQ-018.1 (siehe `.agent/completed/REQ-018.1.md`, Abschnitt NEW
FINDINGS) wurde entdeckt: `npx prisma migrate dev` erkennt beim ersten
Aufruf bereits bestehenden Drift zwischen Migrationshistorie und der
lokalen Dev-Datenbank und schlägt einen **destruktiven Reset des
gesamten `public`-Schemas vor (alle Daten verloren)**. Der Reset wurde
NICHT ausgeführt.

Betroffen (bekannt, unbestätigt in Tiefe):
- `customer_billing_addresses`
- `customer_delivery_addresses`
- `_prisma_migrations_legacy_20260915`

Diese Tabellen existieren laut erstem Befund in der lokalen Dev-DB, sind
aber in `prisma/schema.prisma` NICHT als Modelle definiert (`grep`
bestätigte keine `CustomerBillingAddress`/`CustomerDeliveryAddress`-
Modelle). Dieser Task klärt Ursprung und Sollzustand — **er behebt NICHTS**.

Dieser Task ist ein reiner Nachfolge-Audit aus REQ-018.1, kein Teil von
REQ-018/REQ-018.1 selbst und ändert an deren bereits abgeschlossenem
Scope nichts.

## ZIEL

Ursprung und korrekten Sollzustand des Drifts bestimmen. Feststellen, ob
die Datenbank dem Schema voraus ist oder umgekehrt, ob eine Migration
fehlt, ob die betroffenen Tabellen noch fachlich benötigt werden, und ob
sie echte Daten enthalten. **Kein Fix in diesem Task** — nur Befund plus
Optionen zur späteren, separat zu autorisierenden Bereinigung.

## UNTERSUCHUNGSSCHRITTE (read-only)

1. Aktuelles `prisma/schema.prisma` — welche Modelle/Tabellen existieren,
   welche fehlen im Vergleich zur DB.
2. Sämtliche `prisma/migrations/*` — chronologisch, welche Migration
   welche Tabellen betrifft; insbesondere ob je eine Migration für
   `customer_billing_addresses`/`customer_delivery_addresses` existierte
   und ggf. wieder entfernt wurde.
3. `_prisma_migrations`-Tabelle der lokalen Dev-DB (read-only `SELECT`,
   `TEST_DATABASE_URL`/`DATABASE_URL` aus `.env.local`, dieselbe lokale
   DB wie in allen bisherigen Session-Verifikationen — niemals
   Produktion) — welche Migrationen sind dort als angewendet vermerkt,
   inkl. der Legacy-Tabelle `_prisma_migrations_legacy_20260915` falls
   lesbar.
4. Tatsächliche Struktur der beiden Tabellen (`\d
   customer_billing_addresses` / `\d customer_delivery_addresses` via
   read-only `psql`) — Spalten, Typen, Constraints.
5. Foreign Keys, Indizes, Constraints auf/zu diesen Tabellen.
6. Repository-Historie, soweit lokal verfügbar (`git log`/`git blame`
   read-only): wurden entsprechende Prisma-Modelle früher angelegt und
   wieder entfernt? Existierte je eine zugehörige Migration im Verlauf?
7. Produktionscode: welche Services/API-Routen/UI-Komponenten greifen auf
   Rechnungs-/Lieferadressen zu — über Prisma-Client, Raw SQL, oder über
   andere Tabellen/Felder (z. B. eingebettete Adressfelder direkt auf
   `Customer`)?
8. `prisma/seed/seed.ts` — erzeugt der Seed Daten für diese Tabellen?
9. Tests (`tests/**`) — referenziert irgendein Test diese Tabellen/deren
   erwartete Modelle?
10. Ob die Tabellen echte (nicht-leere) Daten enthalten — read-only
    `SELECT count(*)`.

## ZUSÄTZLICH FESTZUSTELLEN

- Ist die Datenbank neuer als `schema.prisma` (Tabellen existieren in
  der DB, aber nicht im Schema)?
- Ist `schema.prisma` neuer als die Migrationshistorie (Modelle im
  Schema, aber keine zugehörige Migration)?
- Fehlt eine Migration?
- Fehlen Prisma-Modelle?
- Sind die Tabellen obsolet (verwaist, ungenutzt) oder weiterhin
  fachlich/produktiv erforderlich?

Falls weitere erreichbare DEV-/TEST-Datenbanken existieren (z. B. eine
separate CI-DB): nur lesend vergleichen, keine Änderung.

**Keine Produktionsumgebung/-datenbank berühren, auch nicht lesend, falls
dafür kein bereits bestehender, sicherer Read-Only-Zugang existiert —
im Zweifel: nicht verbinden, sondern im Bericht vermerken, dass ein
Produktionsabgleich fehlt.**

## KNOWN_ISSUES

- Dieser Drift wurde ausschließlich über den `prisma migrate dev`-
  Reset-Dialog entdeckt (siehe REQ-018.1-Bericht), nicht durch eine
  gezielte vorherige Untersuchung — dieser Task ist genau diese gezielte
  Untersuchung.
- Betrifft potenziell die Customer-Domäne (`app/(dashboard)/customers/**`
  o. ä.) — nicht GGA/Collaboration. Keine Annahme über Verwandtschaft zu
  REQ-018.1 treffen außer der zufälligen Entdeckung während dieses Tasks.

## DO_NOT

- **KEIN** `prisma migrate reset`.
- **KEIN** `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`.
- **KEINE** destruktive Migration.
- **KEINE** Datenbereinigung.
- **KEIN** Schema-Push mit Datenverlust (`prisma db push` mit
  destruktiver Warnung akzeptieren).
- **KEINE** manuelle Löschung aus `_prisma_migrations` oder
  `_prisma_migrations_legacy_20260915`.
- Keinen Drift automatisch "beheben" — auch nicht additiv, auch nicht
  als vermeintlich risikoarme Korrektur. Dieser Task liefert AUSSCHLIESSLICH
  einen Befund und Optionen.
- Keine Datei ändern (`files_allowed: []` — strikt read-only).

## REPORT_FORMAT

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




