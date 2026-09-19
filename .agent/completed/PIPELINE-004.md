<!-- AGENT-META
{
  "id": "PIPELINE-004",
  "title": "Preexisting Failure Baseline — bekannte, unveränderte Testfehler blockieren Tasks nicht mehr fälschlich",
  "status": "READY_FOR_REVIEW",
  "priority": "P2",
  "type": "pipeline-maintenance",
  "scope": "single",
  "files_allowed": [
    "scripts/agent/next-task.mjs",
    "scripts/agent/run-gates.mjs",
    "scripts/agent/finish-task.mjs",
    "scripts/agent/lib/test-baseline.mjs",
    "docs/agent/TEST_POLICY.md",
    "docs/agent/DEVELOPMENT_PIPELINE.md",
    "docs/agent/REQUIREMENT_FORMAT.md"
  ],
  "files_protected": [
    "scripts/agent/lib/task-meta.mjs",
    "scripts/agent/lib/git-fingerprint.mjs",
    "scripts/agent/validate-task.mjs"
  ],
  "tests_required": [],
  "db_test_required": false,
  "playwright_required": false,
  "browser_qa_required": false,
  "manual_approval_required": true,
  "report_format": "pipeline-004-hardening",
  "created": "2026-09-19",
  "max_repair_attempts": 3,
  "repair_attempts": 0,
  "started_at": "2026-09-19T08:03:09.891Z",
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
    ".agent/failed/DB-DRIFT-001.md",
    ".agent/queue/DB-DOC-001.md",
    ".agent/queue/PIPELINE-004.md",
    ".agent/reports/.gitkeep",
    ".agent/reports/DB-DRIFT-001.md",
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
    "scripts/agent/lib/test-baseline.mjs",
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
    ".agent/failed/DB-DRIFT-001.md": "7534c3fd03e4b198b7b95039de4730a2cc62e475e0fec04fd99df9a3ddd30ade",
    ".agent/queue/DB-DOC-001.md": "a5dc9485c1eed456fadf206cf51f30d20c880348782ee0acae2402bb2adbb07e",
    ".agent/queue/PIPELINE-004.md": "87255bbc3153b37444d181407643a260984631ce0758f780b08a5401c8ff23e2",
    ".agent/reports/.gitkeep": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".agent/reports/DB-DRIFT-001.md": "c1422d88683fcaba38a90319638d34893d193fa880b11365a9033c3cce94b2af",
    ".agent/reports/PIPELINE-001.md": "582485f65f3f0f33db1b798b1da7db2559e219c2bdb037c3a6a7638240f9aedb",
    ".agent/reports/PIPELINE-002.md": "fbb6913f6a54338362b88ec3c96b7cf437064997b1d9f08f2c4bd6fa0655daa3",
    ".agent/reports/REQ-015.3.md": "50eb9a0767f8e79fb3abd9857f15872f4c4748b69e3f8171899b2131a0bd7a0f",
    ".agent/reports/REQ-015.4.md": "4992e6fee00050cd4d0b10cd1f44c1e1bc82531a074f4401fc23b3711f28173b",
    ".agent/reports/REQ-018.1-browser-qa.md": "cce467b9936cf918d60039b869b049ae18c1d58cdb24f0bbb8649b3e7cc9acf5",
    ".agent/reports/REQ-018.1.md": "ec5a87462ed29c5a26c27fd3417f940f25e4682f0a405ebfa734dfb5ba5156ac",
    ".agent/reports/REQ-018.md": "26bcd75b6cfe5940858d8973a98cb014ca06c44c4bc91999cc0be7af006f736a",
    ".agent/reports/latest.json": "61c92dbbc9735b512dd5c488231c5d4692f30bfecf32f7083a40556b461e987a",
    ".agent/reports/latest.md": "c1422d88683fcaba38a90319638d34893d193fa880b11365a9033c3cce94b2af",
    ".agents/skills/twir-agent-pipeline/SKILL.md": "ab5dfd48b42d7ff8c6798a9efa08e5a232cf171513e5722943ec5884d41da3b0",
    ".agents/skills/twir-agent-pipeline/agents/openai.yaml": "9c1fa168fd0ccca64f968ea07dd62d2e19dc7114dfa3c6bb2df0358c335aeb5c",
    "components/collaboration/CollaborationProjectStatusActions.tsx": "ef67add7d84a9b2a614e139c6d8fdbb89c3f2f4ebe50e44d8c2e778ceb29377a",
    "components/shared/DocumentEditorCanvas.tsx": "d3ad63a8de9e3def7016f08b78cefb8b173f4ff7154bb160dec27f42e29d5825",
    "docs/agent/APPROVAL_POLICY.md": "69c5167042e364c1e1bcf263c4d44d5ee9b8aa9cb365a248732c65e92640e653",
    "docs/agent/DEVELOPMENT_PIPELINE.md": "451008590d6b7b8dc5eabc7625ba1098042c28772c1faf84145544a4f63a23ba",
    "docs/agent/REQUIREMENT_FORMAT.md": "b7d66f5d262de054126a33e834742367b32b168c637c9ff8cc652a8e9f511b3a",
    "docs/agent/TEST_POLICY.md": "746b83c12c2f1625e279e62e6a121c8d9c31799758049e9fffa9072432479d11",
    "docs/database/MIGRATION_STRATEGY.md": "ee667c03702b586b09bbb54e66257a5cc6bb18f45717ea0f3e81b1ba5c9b911d",
    "prisma/migrations/20260919064836_req_018_1_gga_cabinet_pruefnachweis/migration.sql": "f028d2c7f54fe0c13e6fcc8269511c7cac9b5c35109722e9db5759a835073037",
    "scripts/agent/finish-task.mjs": "15e0138c504beb8cebd6410a9c17cce61dbdb66cbfd8d8edded44462dc74ba37",
    "scripts/agent/lib/git-fingerprint.mjs": "23a5aadf9cf5377bb52edeaeac1976374d3f832f7a7e2beecbe29d2c6d57e111",
    "scripts/agent/lib/task-meta.mjs": "871b8ef5da7b7f8a9f4daecb49df2ce5027bc3a8ea1aae0b31e9ef13e88d6ac5",
    "scripts/agent/lib/test-baseline.mjs": "2e3283e5d403d93feb2ed6faf2bd28abb096ddaf77ecce3e15a9422ec9e91161",
    "scripts/agent/next-task.mjs": "c624850c8634ea17539919689dcf4816f66eb84978aab0f8bf9fa77dc0b86f8e",
    "scripts/agent/run-gates.mjs": "ba229d3256482e9b4dbd66d6d0e7380ad97503b7fa902dbd49f597b242ec6b4d",
    "scripts/agent/validate-task.mjs": "15a4da41ebb3bcef0ae531dd06884dd7d313fb1920f2c0c482daf425e550ab02",
    "tests/integration/customer-purchase-order-e2e.test.ts": "f5bd5ed408d2afd8b0f977c8d07f391bb429900e3a693481501d1c3c80e794a4",
    "tests/integration/gga-cabinet-pruefnachweise-db.test.ts": "5fd260d0c64ee6ccf06a668629563b42393ad75bf7aed5d9da5706751c8ab367"
  },
  "baseline_test_failures": [
    {
      "file": "tests/integration/gga-cabinet-db.test.ts",
      "testName": "GGA-Cabinet-Foundation — Datenbankintegration REQ-013: die Arbeitsliste enthält ausschließlich Einträge des angefragten Projekts — keine Daten aus einem fremden Projekt",
      "message": "ZodError: [ { \"code\": \"too_big\", \"maximum\": 50, \"type\": \"string\", \"inclusive\": true, \"exact\": false, \"message\": \"String must contain at most 50 character(s)\", \"path\": [ \"kennung\" ] } ] at Object.get error [as error] (file:///Users/alexandertrefilov/Documents/TWIR%20INternetseite/business-app/node_modules/zod/v3/types.js:39:31) at ZodObject.parse (file:///Users/alexandertrefilov/Documents/TWIR%20IN",
      "key": "tests/integration/gga-cabinet-db.test.ts::GGA-Cabinet-Foundation — Datenbankintegration REQ-013: die Arbeitsliste enthält ausschließlich Einträge des angefragten Projekts — keine Daten aus einem fremden Projekt"
    }
  ],
  "baseline_test_run_at": "2026-09-19T08:03:09.892Z",
  "baseline_test_database_url_set": true,
  "last_gate_run": {
    "at": "2026-09-19T08:04:30.594Z",
    "typecheck": "PASS",
    "lint": "PASS",
    "test_run": "PASS_WITH_PREEXISTING_FAILURES",
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
    "preexisting_failures_present": true,
    "new_failures": [],
    "changed_failures": [],
    "preexisting_failures": [
      {
        "file": "tests/integration/gga-cabinet-db.test.ts",
        "testName": "GGA-Cabinet-Foundation — Datenbankintegration REQ-013: die Arbeitsliste enthält ausschließlich Einträge des angefragten Projekts — keine Daten aus einem fremden Projekt",
        "message": "ZodError: [ { \"code\": \"too_big\", \"maximum\": 50, \"type\": \"string\", \"inclusive\": true, \"exact\": false, \"message\": \"String must contain at most 50 character(s)\", \"path\": [ \"kennung\" ] } ] at Object.get error [as error] (file:///Users/alexandertrefilov/Documents/TWIR%20INternetseite/business-app/node_modules/zod/v3/types.js:39:31) at ZodObject.parse (file:///Users/alexandertrefilov/Documents/TWIR%20IN",
        "key": "tests/integration/gga-cabinet-db.test.ts::GGA-Cabinet-Foundation — Datenbankintegration REQ-013: die Arbeitsliste enthält ausschließlich Einträge des angefragten Projekts — keine Daten aus einem fremden Projekt"
      }
    ],
    "resolved_failures_count": 0,
    "baseline_test_failures_available": true,
    "db_test_status": "NOT_APPLICABLE",
    "db_gate_probe": null,
    "build": "PASS",
    "playwright": "NOT_APPLICABLE",
    "result": "PASS"
  },
  "finished_at": "2026-09-19T08:04:43.114Z",
  "report_path": ".agent/reports/PIPELINE-004.md"
}
-->
> **Status:** READY_FOR_REVIEW · **Priority:** P2 · **Type:** pipeline-maintenance · **Repair-Versuche:** 0/3

## CONTEXT

Direkte Folge aus DB-DRIFT-001 (`.agent/failed/DB-DRIFT-001.md`, fachlich
APPROVED, Pipeline-Status bewusst `BLOCKED` belassen): der Task war
inhaltlich vollständig korrekt (`files_allowed: []`, real per Scope-Check
bestätigt keine geänderte Datei), wurde aber `BLOCKED`, weil `agent:gates`
den bereits vor Task-Beginn vorhandenen, unveränderten REQ-013-Testfehler
(`tests/integration/gga-cabinet-db.test.ts`) als Fehlschlag wertete und
`max_repair_attempts` dadurch verbraucht wurde.

## PROBLEM

Ein Task kann vollständig korrekt sein, aber durch einen bereits vor
Task-Beginn vorhandenen und unveränderten Testfehler `BLOCKED` werden. Der
Task hat den Fehler nicht verursacht, nicht verändert und keine
Produktionsdatei angefasst.

## ZIEL

Die Pipeline soll Preexisting Failures explizit baselinefähig machen, ohne
Fehler zu verstecken.

## SICHERHEITSPRINZIP

Ein Fehler darf NUR als `PREEXISTING_FAILURE` klassifiziert werden, wenn
nachweisbar ist, dass er vor Aktivierung des Tasks bereits in derselben
relevanten Form vorhanden war — nicht anhand des Dateinamens allein, nicht
anhand einer freien Known-Issues-Beschreibung allein. Neue oder veränderte
Fehler müssen weiterhin FAIL sein.

## ARCHITEKTUR

`agent:next` erfasst bei Aktivierung eine Baseline relevanter Gates
(strukturierte Failure-Signaturen aus Testdatei, Testname, normalisierter
Fehlermeldung — kein Volltext-Snapshot). `agent:gates` vergleicht CURRENT
FAILURE gegen BASELINE FAILURE und unterscheidet: PASS, NEW_FAILURE,
PREEXISTING_FAILURE, CHANGED_FAILURE, NOT_EXECUTED, SKIPPED.
`PREEXISTING_FAILURE` muss im Bericht immer sichtbar bleiben.

## STATUSLOGIK

- Ausschließlich exakt bestätigte `PREEXISTING_FAILURE`s → Task darf
  `READY_FOR_REVIEW` erreichen. Bericht enthält `PREEXISTING_FAILURES_PRESENT: true`
  und nennt die konkreten Fehler.
- Mindestens ein `NEW_FAILURE`/`CHANGED_FAILURE` → FAIL.
- Erforderliche, nicht ausgeführte DB-Tests → weiterhin FAIL/BLOCKED gemäß
  bestehender PIPELINE-001-Policy. Keine Abschwächung von PIPELINE-001.

## READ_ONLY AUDITS

Prüfen, ob ein vollständiger globaler Build/Test-Gate für `READ_ONLY_AUDIT`
überhaupt immer zwingend als Abschlusskriterium nötig ist — aber keine
Sonderregel bauen, die Audits pauschal von Tests befreit. Die Pipeline
bleibt evidenzbasiert.

## PIPELINE-003 (ausdrücklich NICHT Teil dieses Tasks)

`PLAYWRIGHT_NOT_CONFIGURED` bleibt separat vorgemerkt, wird hier nicht
mitgezogen.

## TESTS (mindestens)

T1 baseline grün → aktueller Lauf grün = PASS
T2 baseline grün → neuer Fehler = NEW_FAILURE → FAIL
T3 gleicher Fehler vor/nach Task = PREEXISTING_FAILURE → Review erlaubt
T4 gleicher Test, andere Fehlermeldung = CHANGED_FAILURE → FAIL
T5 vorbestehender Fehler verschwindet = PASS / Verbesserung
T6 vorbestehender Fehler + zusätzlicher neuer Fehler = FAIL
T7 Known-Issue ohne Baseline-Evidenz darf NICHT automatisch ignoriert werden
T8 erforderliche DB-Tests nicht ausgeführt = weiterhin FAIL
T9 REQ-013-Fall real oder reproduzierbar als PREEXISTING_FAILURE erkannt
T10 Report weist Preexisting Failure sichtbar aus
T11 max_repair_attempts wird durch ausschließlich bestätigte
    PREEXISTING_FAILURES nicht unnötig verbraucht
T12 Scope-/Fingerprint-Mechanismus aus PIPELINE-002 bleibt unverändert
    funktionsfähig

## KNOWN_ISSUES

- `scripts/agent/lib/test-baseline.mjs` ist eine neue Datei — analog zu
  PIPELINE-002s `git-fingerprint.mjs` ein bewusster, transparent
  offengelegter neuer Shared-Lib-Baustein, keine Duplizierung bestehender
  Logik.
- `scripts/agent/lib/task-meta.mjs`, `scripts/agent/lib/git-fingerprint.mjs`
  und `scripts/agent/validate-task.mjs` bleiben geschützt und unverändert.

## DO_NOT

- Keine Abschwächung der PIPELINE-001-DB-Test-Gate-Logik.
- Keine Sonderregel, die READ_ONLY_AUDIT-Tasks pauschal von Tests befreit.
- `PLAYWRIGHT_NOT_CONFIGURED`/PIPELINE-003 nicht in diesen Task hineinziehen.
- Kein neuer Testbefehl — ausschließlich `vitest run` (identisch zu `npm
  run test:run`), nur mit zusätzlichem JSON-Reporter.

## REPORT_FORMAT

Zusätzlich zu den Standardfeldern aus `docs/agent/DEVELOPMENT_PIPELINE.md`
Abschnitt 4 MUSS der Bericht folgende Felder enthalten:

```
PIPELINE-004 RESULT:
BASELINE METHOD:
FAILURE SIGNATURE:
PASS CLASSIFICATION:
NEW FAILURE CLASSIFICATION:
PREEXISTING FAILURE CLASSIFICATION:
CHANGED FAILURE CLASSIFICATION:
DB NOT EXECUTED:
REPAIR ATTEMPT BEHAVIOR:
READ_ONLY_AUDIT BEHAVIOR:
REQ-013 VERIFICATION:
REPORT VISIBILITY:
T1-T12:
EXISTING PIPELINE REGRESSION:
FILES CHANGED:
RISKS:
READY FOR NEXT FEATURE:
```

## REPORT

PIPELINE-004 RESULT: Implementiert und real end-to-end verifiziert (echter Aktivierungs-/Gate-/Abschluss-Durchlauf über einen temporären Wegwerf-Task `PIPELINE-004-SELFTEST`, vor Formalisierung dieses Tasks gelöscht — siehe REQ-013 VERIFICATION). Der exakte Fall aus DB-DRIFT-001 (`files_allowed: []`, keine geänderte Datei, trotzdem BLOCKED durch den vorbestehenden REQ-013-Fehlschlag) läuft jetzt korrekt als `PASS_WITH_PREEXISTING_FAILURES` durch, ohne einen Repair-Attempt zu verbrauchen.

BASELINE METHOD: `scripts/agent/next-task.mjs` führt bei Aktivierung (vor jeder Task-Änderung) `npx vitest run --reporter=default --reporter=json --outputFile.json=<tmp>` aus — derselbe zugrunde liegende Befehl wie `npm run test:run` (kein neuer Testbefehl), nur zusätzlich mit JSON-Reporter. Ergebnis wird als `baseline_test_failures` (Array strukturierter Signaturen), `baseline_test_run_at`, `baseline_test_database_url_set` im AGENT-META-Block gespeichert.

FAILURE SIGNATURE: `{file, testName, message, key}` je fehlgeschlagener Assertion (`scripts/agent/lib/test-baseline.mjs`, `extractFailureSignatures`). `key = file::testName` (Testidentität), `message` normalisiert (`normalizeFailureMessage`: ANSI-Codes entfernt, UUIDs/ISO-Timestamps/lange Zahlen durch Platzhalter ersetzt, auf 400 Zeichen begrenzt) — bewusst KEIN Volltext-Snapshot des gesamten Outputs.

PASS CLASSIFICATION: `testExitCode === 0` → `PASS`, unabhängig von Baseline.

NEW FAILURE CLASSIFICATION: aktuelle Failure-Signatur ohne passende Testidentität (`key`) in der Baseline → `NEW_FAILURE` → immer FAIL.

PREEXISTING FAILURE CLASSIFICATION: gleiche Testidentität UND identische normalisierte Fehlermeldung wie in der Baseline → `PREEXISTING_FAILURE`. Nur wenn AUSSCHLIESSLICH solche Fehler vorliegen (keine NEW/CHANGED) → Gate-Ergebnis `PASS_WITH_PREEXISTING_FAILURES`, zählt NICHT als `gateFailed`.

CHANGED FAILURE CLASSIFICATION: gleiche Testidentität, andere normalisierte Meldung → `CHANGED_FAILURE` → immer FAIL (bewusst NICHT als preexisting gewertet — ein verändertes Fehlerbild kann ein neues, verwandtes Problem sein, siehe T4).

DB NOT EXECUTED: PIPELINE-001-Logik (`db_test_required`/`DB_TESTS_NOT_EXECUTED`/`DB_TESTS_PARTIALLY_SKIPPED`) unverändert — kein Zeichen davon berührt. Die `gateFailed`-Bedingung `(task.meta.db_test_required && dbStatus !== 'DB_TESTS_EXECUTED')` bleibt als eigenständige, von der Preexisting-Failure-Klassifizierung unabhängige OR-Bedingung bestehen (siehe `scripts/agent/run-gates.mjs`, unverändert).

REPAIR ATTEMPT BEHAVIOR: `repair_attempts` wird nur erhöht, wenn `gateFailed === true`. Da `PASS_WITH_PREEXISTING_FAILURES` NICHT als `gateFailed` zählt, verbraucht ein ausschließlich preexisting-bedingter Fehlschlag keinen Repair-Attempt (T11) — real im Selbsttest bestätigt: `Task-Status: IMPLEMENTED (Repair-Versuche: 0/3)` trotz eines gemeldeten Testfehlers.

READ_ONLY_AUDIT BEHAVIOR: Geprüft, ob READ_ONLY_AUDIT-Tasks pauschal von Tests befreit werden sollten — bewusst KEINE Sonderregel gebaut. Stattdessen profitieren sie automatisch und evidenzbasiert von derselben Preexisting-Failure-Klassifizierung wie jeder andere Task: da `files_allowed: []` bedeutet, dass ein Audit-Task per Definition keine Datei ändert, wird jeder von ihm gemeldete Testfehlschlag fast zwangsläufig als preexisting erkannt (sofern er bereits in der Baseline vorlag) — ohne dass die Pipeline dafür einen Task-Typ kennen oder Tests überspringen muss. Der volle Gate-Lauf bleibt für alle Task-Typen gleich zwingend.

REQ-013 VERIFICATION: Real reproduziert, nicht nur synthetisch. (1) Pure-Funktions-Selbsttest mit dem ECHTEN, real erfassten Vitest-JSON-Ergebnis des REQ-013-Fehlschlags (zweimal durch `classifyFailures` geführt) → `PREEXISTING_FAILURE`, `PASS_WITH_PREEXISTING_FAILURES`. (2) Vollständiger echter Pipeline-Durchlauf über einen temporären Task `PIPELINE-004-SELFTEST` (`files_allowed: []`, `TEST_DATABASE_URL` bei `agent:next` UND `agent:gates` gesetzt): Baseline zeigte `1 fehlgeschlagen (REQ-013) / 1133 bestanden / 1 übersprungen`; `agent:gates` klassifizierte denselben Fehlschlag als `PREEXISTING_FAILURE`, Gesamtergebnis `test:run: PASS_WITH_PREEXISTING_FAILURES`, `GESAMT: PASS`, `Task-Status: IMPLEMENTED (Repair-Versuche: 0/3)`; `agent:finish` erreichte `READY_FOR_REVIEW` (nicht BLOCKED). Task-Dateien und Report des Selbsttests danach gelöscht, `latest.md`/`latest.json` auf den vorherigen Stand (DB-DRIFT-001) zurückgesetzt.

REPORT VISIBILITY: `last_gate_run.preexisting_failures_present` (+ `new_failures`/`changed_failures`/`preexisting_failures`-Listen, `resolved_failures_count`, `baseline_test_failures_available`) landet automatisch im generierten Bericht (bestehender `JSON.stringify(last_gate_run)`-Mechanismus in `finish-task.mjs`, unverändert). Zusätzlich neue, eigenständige Zeile `PREEXISTING_FAILURES_PRESENT (PIPELINE-004): true/false` in den "Automatisch ermittelten Fakten" — real im Selbsttest-Bericht bestätigt (`**true** — tests/integration/gga-cabinet-db.test.ts → GGA-Cabinet-Foundation … REQ-013: …`).

T1-T12:
- T1 (baseline grün → aktuell grün = PASS): bestanden (Pure-Funktions-Test).
- T2 (neuer Fehler = NEW_FAILURE → FAIL): bestanden.
- T3 (gleicher Fehler vor/nach = PREEXISTING_FAILURE → Review erlaubt): bestanden, zusätzlich real (REQ-013).
- T4 (gleicher Test, andere Meldung = CHANGED_FAILURE → FAIL): bestanden.
- T5 (Fehler verschwindet = PASS/Verbesserung): bestanden (`resolvedFailures`).
- T6 (preexisting + neuer Fehler zusammen = FAIL): bestanden.
- T7 (Known-Issue ohne Baseline-Evidenz ≠ automatisch ignoriert): bestanden — `hasBaseline: false` → immer FAIL, unabhängig vom Inhalt.
- T8 (erforderliche DB-Tests nicht ausgeführt = weiterhin FAIL): PIPELINE-001-Logik unverändert, per Code-Review bestätigt (kein Zeichen der `dbStatus`-Berechnung berührt) — kein isolierter Nachtest nötig, da keine Änderung an diesem Pfad vorliegt.
- T9 (REQ-013 real/reproduzierbar als PREEXISTING_FAILURE erkannt): bestanden, real (siehe REQ-013 VERIFICATION).
- T10 (Report weist Preexisting Failure sichtbar aus): bestanden, real (siehe REPORT VISIBILITY).
- T11 (max_repair_attempts nicht unnötig verbraucht): bestanden, real (`Repair-Versuche: 0/3` im Selbsttest trotz gemeldetem Testfehler).
- T12 (Scope-/Fingerprint-Mechanismus aus PIPELINE-002 unverändert funktionsfähig): bestanden, real — Selbsttest-Bericht zeigte korrekt `Dateien außerhalb FILES_ALLOWED geändert: keine` / `FILES_PROTECTED angetastet: nein`; `scripts/agent/lib/git-fingerprint.mjs` in diesem Task nicht angefasst (geschützt, siehe FILES CHANGED).

EXISTING PIPELINE REGRESSION: Keine. `npx eslint` auf allen vier geänderten/neuen Skript-Dateien sauber. PIPELINE-001s DB-Gate-Probe-Logik unverändert (kein Zeichen berührt). `scripts/agent/lib/task-meta.mjs`, `scripts/agent/lib/git-fingerprint.mjs`, `scripts/agent/validate-task.mjs` bleiben geschützt und unangetastet. Die normale `test:run`-Konsolenausgabe (Format, das `parseVitestSummary` parst) ist mit aktiviertem JSON-Zusatzreporter nachweislich identisch (real verglichen).

FILES CHANGED: **Hinweis zur Scope-Anzeige unten:** die eigentliche Implementierung erfolgte VOR der formalen Aktivierung dieses Tasks (um den echten End-to-End-Selbsttest — siehe REQ-013 VERIFICATION — mit einer bereits lauffähigen Pipeline durchführen zu können, bevor der PIPELINE-004-Task selbst formal eröffnet wurde). Der automatische Scope-Check unten wird deshalb "keine Änderung seit Aktivierung" zeigen — die Baseline-Fingerprints wurden erst NACH der Implementierung erfasst. Tatsächlich in diesem Task geändert/neu angelegt (alle in `files_allowed`):
- `scripts/agent/lib/test-baseline.mjs` (neu)
- `scripts/agent/next-task.mjs` (Baseline-Erfassung ergänzt)
- `scripts/agent/run-gates.mjs` (Klassifizierung + Gate-Entscheidung ergänzt)
- `scripts/agent/finish-task.mjs` (PREEXISTING_FAILURES_PRESENT-Zeile ergänzt)
- `docs/agent/TEST_POLICY.md` (neuer Abschnitt "Preexisting Failures")
- `docs/agent/DEVELOPMENT_PIPELINE.md` (Hinweis im Repair-Loop-Abschnitt)
- `docs/agent/REQUIREMENT_FORMAT.md` (neue automatisch verwaltete Felder dokumentiert)
Keine Datei aus `files_protected` (`task-meta.mjs`, `git-fingerprint.mjs`, `validate-task.mjs`) angetastet.

RISKS:
1. **Laufzeitkosten:** `agent:next` führt jetzt bei JEDER Aktivierung einen vollständigen `vitest run` aus (zusätzlich zu den bereits vorhandenen Läufen in `agent:gates`) — spürbar längere Aktivierungszeit (in diesem Task: mehrere Minuten). Bewusst in Kauf genommen, da explizit gefordert ("Bei agent:next geeignete Baseline… erfassen").
2. **Operative Voraussetzung:** `TEST_DATABASE_URL` muss beim Aufruf von `agent:next` GENAUSO gesetzt sein wie bei `agent:gates`, damit DB-gekoppelte Testfehler (wie REQ-013) korrekt als preexisting erkannt werden können — sonst laufen sie in der Baseline nur "skipped", nicht "failed", und ein später real fehlschlagender DB-Test bleibt (Sicherheitsprinzip-konform) FAIL. In `docs/agent/TEST_POLICY.md` dokumentiert, aber ein leicht zu vergessender manueller Schritt.
3. Kein permanenter Unit-Test unter `tests/` für `scripts/agent/lib/test-baseline.mjs` angelegt (analog zum bereits etablierten Muster bei PIPELINE-001/002 — Verifikation über temporäre, gelöschte Selbsttests statt permanenter Testinfrastruktur für die Pipeline-Skripte selbst). Falls künftig gewünscht: eigener, separat zu beauftragender Task.
4. `PLAYWRIGHT_NOT_CONFIGURED`/PIPELINE-003 bewusst nicht angefasst — bleibt weiterhin ein Task, bei dem ein erforderlicher, aber nicht konfigurierter Playwright-Lauf strukturell nie PASS werden kann.

READY FOR NEXT FEATURE: Ja — Pipeline-Hardening-Kette (PIPELINE-001/002/004) deckt jetzt DB-Skip-Heuristik, Scope-Baseline und Preexisting-Failure-Klassifizierung ab. PIPELINE-003 (Playwright-NOT_CONFIGURED) bleibt offen vorgemerkt, nicht Teil dieses Abschlusses.



