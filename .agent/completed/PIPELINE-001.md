<!-- AGENT-META
{
  "id": "PIPELINE-001",
  "title": "run-gates.mjs DB-Skip-Heuristik meldet unrelated Test-Skips als DB_TESTS_PARTIALLY_SKIPPED",
  "status": "APPROVED",
  "priority": "P2",
  "type": "pipeline-maintenance",
  "scope": "single",
  "files_allowed": [
    "scripts/agent/run-gates.mjs",
    "docs/agent/TEST_POLICY.md"
  ],
  "files_protected": [
    "scripts/agent/lib/task-meta.mjs",
    "scripts/agent/next-task.mjs",
    "scripts/agent/finish-task.mjs",
    "scripts/agent/validate-task.mjs"
  ],
  "tests_required": [],
  "db_test_required": false,
  "playwright_required": false,
  "browser_qa_required": false,
  "manual_approval_required": true,
  "report_format": "default",
  "created": "2026-09-19",
  "max_repair_attempts": 3,
  "repair_attempts": 0,
  "started_at": "2026-09-19T06:13:37.138Z",
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
    "prisma/seed/seed.ts",
    "tests/integration/collaboration-gga-restructure-db.test.ts",
    "tests/integration/gga-cabinet-db.test.ts",
    "tests/integration/gga-cabinet-inspection-db.test.ts",
    "tests/integration/gga-operator-portal-db.test.ts",
    "tests/integration/race-condition.test.ts",
    "tests/unit/cabinet-workflow.test.ts",
    "tests/unit/collaboration-phase3-mutations.test.ts",
    "tests/unit/collaboration-project-workflow.test.ts",
    ".agent/",
    ".agents/skills/twir-agent-pipeline/",
    "components/collaboration/CollaborationProjectStatusActions.tsx",
    "components/shared/DocumentEditorCanvas.tsx",
    "docs/agent/",
    "docs/database/MIGRATION_STRATEGY.md",
    "scripts/",
    "tests/integration/customer-purchase-order-e2e.test.ts"
  ],
  "last_gate_run": {
    "at": "2026-09-19T06:15:51.758Z",
    "typecheck": "PASS",
    "lint": "PASS",
    "test_run": "PASS",
    "test_summary": {
      "files": {
        "failed": 0,
        "passed": 104,
        "skipped": 9
      },
      "tests": {
        "failed": 0,
        "passed": 924,
        "skipped": 188
      }
    },
    "db_test_status": "NOT_APPLICABLE",
    "db_gate_probe": null,
    "build": "PASS",
    "playwright": "NOT_APPLICABLE",
    "result": "PASS"
  },
  "finished_at": "2026-09-19T06:16:20.162Z",
  "report_path": ".agent/reports/PIPELINE-001.md",
  "approved_at": "2026-09-19T06:26:40.852Z"
}
-->
> **Status:** APPROVED · **Priority:** P2 · **Type:** pipeline-maintenance · **Repair-Versuche:** 0/3

## CONTEXT

Während REQ-015.3 (`.agent/completed/REQ-015.3.md` → REPORT →
GATE_RESULT_EXPLANATION) festgestellter Nebenfund, absichtlich NICHT im
Rahmen der GGA-Produktänderung (REQ-015.4) mitbehoben — Pipeline-Wartung
ist ein eigener Belang.

`scripts/agent/run-gates.mjs` wertet aktuell JEDEN Skip im gesamten
`npm run test:run`-Lauf als potenziell DB-Test-bezogen, sobald
`db_test_required: true` gesetzt ist und mindestens eine `*-db.test.ts`-
oder `race-condition.test.ts`-Datei im Projekt existiert
(`hasDbIntegrationFiles()`). Konkret beobachtet: `tests/integration/
customer-purchase-order-e2e.test.ts` hat ein eigenes, von
`TEST_DATABASE_URL` unabhängiges Gate (`RUN_CUSTOMER_PURCHASE_ORDER_E2E
=== '1'`) — dessen Skip wurde fälschlich als `DB_TESTS_PARTIALLY_SKIPPED`
gemeldet, obwohl alle tatsächlich `TEST_DATABASE_URL`-abhängigen Dateien
real liefen (0 Skips dort).

## ACCEPTANCE_CRITERIA

- [x] `run-gates.mjs` unterscheidet zwischen einem Skip in einer
      `TEST_DATABASE_URL`-abhängigen Datei und einem Skip aus einem
      anderen Grund (z. B. eigenes Env-Gate).
- [x] Bestehendes Verhalten für echte `TEST_DATABASE_URL`-Skips
      unverändert (weiterhin `DB_TESTS_NOT_EXECUTED`/
      `DB_TESTS_PARTIALLY_SKIPPED`, keine Abschwächung).
- [x] `docs/agent/TEST_POLICY.md` entsprechend aktualisiert.

## DO_NOT

- Keine Abschwächung der Kernregel (Skip ohne `TEST_DATABASE_URL` = nie
  PASS).

## REPORT

RESULT: Behoben. `run-gates.mjs` klassifiziert DB-Test-Skips jetzt über einen gezielten, isolierten Probe-Lauf (`npx vitest run <nur *-db.test.ts + race-condition.test.ts>`) statt über den globalen Skip-Zähler des gesamten `test:run`-Laufs.

IMPLEMENTED: `findDbTestFiles()` ersetzt `hasDbIntegrationFiles()` — liefert die konkrete Dateiliste statt nur eines Booleans. Bei `db_test_required: true` und gesetzter `TEST_DATABASE_URL` wird zusätzlich `npx vitest run <diese Dateien>` ausgeführt; NUR deren eigener `skipped`-Zähler entscheidet über `DB_TESTS_EXECUTED` vs. `DB_TESTS_PARTIALLY_SKIPPED`. Der Hauptlauf (`npm run test:run`, alle Dateien) bleibt für das Gesamt-PASS/FAIL unverändert maßgeblich — nur die DB-Klassifizierung wurde präzisiert. `db_gate_probe` (Rohergebnis des Probe-Laufs) zusätzlich in `last_gate_run` protokolliert für Transparenz.

DB SKIP CLASSIFICATION: Empirisch verifiziert (manueller Vorablauf, siehe Implementierungsverlauf): ohne `TEST_DATABASE_URL` zeigt der isolierte Probe-Lauf `187 skipped` von 188 Tests in den 9 DB-Dateien — korrekt als `DB_TESTS_NOT_EXECUTED`/`DB_TESTS_PARTIALLY_SKIPPED` erkennbar. Mit gesetzter `TEST_DATABASE_URL` zeigt derselbe Probe-Lauf `0 skipped` (nur der bekannte, vorbestehende REQ-013-Fehlschlag, der eine andere Kategorie ist — FAIL, nicht SKIP) — korrekt `DB_TESTS_EXECUTED`. Der unrelated Skip von `customer-purchase-order-e2e.test.ts` (eigenes `RUN_CUSTOMER_PURCHASE_ORDER_E2E`-Flag) taucht im Probe-Lauf gar nicht mehr auf, da diese Datei nicht zu `findDbTestFiles()` gehört — das ursprüngliche False-Positive ist strukturell ausgeschlossen, nicht nur unterdrückt.

TESTS: Keine neue permanente Testdatei (Pipeline-Skripte haben keine eigene Testsuite in diesem Projekt) — Verifikation über direkten, dokumentierten manuellen Nachweis (siehe oben) plus den echten `agent:gates`-Lauf dieses Tasks selbst.

TYPECHECK: PASS.
LINT: PASS.
BUILD: PASS.

FILES CHANGED:
- `scripts/agent/run-gates.mjs` (in `files_allowed`)
- `docs/agent/TEST_POLICY.md` (in `files_allowed`)
- Keine Datei aus `files_protected` angetastet.

READY: Ja.




