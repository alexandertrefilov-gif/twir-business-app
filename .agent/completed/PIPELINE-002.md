<!-- AGENT-META
{
  "id": "PIPELINE-002",
  "title": "Baseline-Diff-Scope-Check erkennt nur neue Dateipfade, keine Zusatzänderungen an bereits vor Task-Start dirty-en Dateien",
  "status": "APPROVED",
  "priority": "P2",
  "type": "pipeline-maintenance",
  "scope": "single",
  "files_allowed": [
    "scripts/agent/next-task.mjs",
    "scripts/agent/finish-task.mjs",
    "docs/agent/REQUIREMENT_FORMAT.md"
  ],
  "files_protected": [
    "scripts/agent/lib/task-meta.mjs",
    "scripts/agent/run-gates.mjs",
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
  "started_at": "2026-09-19T06:16:26.138Z",
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
    "at": "2026-09-19T06:23:17.247Z",
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
  "finished_at": "2026-09-19T06:24:02.240Z",
  "report_path": ".agent/reports/PIPELINE-002.md",
  "approved_at": "2026-09-19T06:26:40.854Z"
}
-->
> **Status:** APPROVED · **Priority:** P2 · **Type:** pipeline-maintenance · **Repair-Versuche:** 0/3

## CONTEXT

Während REQ-015.4 festgestellter Nebenfund, absichtlich NICHT im Rahmen der
GGA-Produktänderung mitbehoben.

`next-task.mjs` speichert bei Aktivierung `baseline_git_status` (Snapshot
von `git status --short`); `finish-task.mjs` vergleicht bei Abschluss nur
gegen diesen Snapshot, um NEUE Dateipfade zu erkennen. In einer
lang laufenden Session, in der die meisten relevanten Dateien bereits VOR
Task-Aktivierung uncommitted/"dirty" sind (wie in dieser gesamten Session),
kann der Mechanismus zusätzliche Änderungen an einer bereits dirty-en, aber
NICHT in `files_allowed` gelisteten Datei nicht erkennen — `git status
--short` zeigt eine bereits als „M" markierte Datei nicht anders an, egal
wie oft sie danach noch geändert wird. Bei REQ-015.4 hat das die geplante
Scope-Prüfung nicht kompromittiert (alle bereits dirty-en Dateien waren
zufällig ohnehin in `files_allowed`), ist aber ein struktureller blinder
Fleck.

## ACCEPTANCE_CRITERIA

- [x] Der Scope-Check erkennt auch Zusatzänderungen an bereits vor
      Task-Start dirty-en Dateien (Inhalts-Hash-Vergleich, kein reines
      Pfad-Vorhandensein mehr).
- [x] Bestehendes Verhalten (Erkennung neuer Dateipfade) bleibt erhalten.
- [x] `docs/agent/REQUIREMENT_FORMAT.md` entsprechend aktualisiert.

## DO_NOT

- Keine Abschwächung der bestehenden Neue-Datei-Erkennung.

## REPORT

RESULT: Behoben. `finish-task.mjs` vergleicht Scope-Verletzungen jetzt über Inhalts-Fingerprints statt reinem Pfad-Vorhandensein — unterscheidet zuverlässig zwischen "Datei war bereits dirty, Task hat sie nicht angefasst" und "Datei war bereits dirty, Task hat sie zusätzlich geändert". Beim Implementieren zusätzlich zwei reale, vom Selbsttest aufgedeckte Bugs gefunden und behoben (siehe DIRTY FILE BASELINE unten).

IMPLEMENTED:
- Neue Datei `scripts/agent/lib/git-fingerprint.mjs` (gemeinsame Fingerprint-Logik für next-task.mjs/finish-task.mjs — bewusst NICHT in `task-meta.mjs` ergänzt, da diese Datei laut `files_protected` geschützt ist).
- `next-task.mjs`: speichert bei Aktivierung zusätzlich `baseline_fingerprints` (Inhalts-Hash je aktuell dirty-em Pfad) neben dem bisherigen `baseline_git_status`.
- `finish-task.mjs`: bildet bei Abschluss die Vereinigung aus Baseline-Pfaden und aktuell dirty-en Pfaden, ergänzt fehlende Baseline-Einträge über `resolveBaseline()` (siehe unten) und vergleicht Fingerprints statt Pfaden. Fällt auf die alte, reine Pfadprüfung zurück, wenn `baseline_fingerprints` fehlt (Tasks, die von einer älteren `next-task.mjs`-Version aktiviert wurden — z. B. dieser Task selbst, siehe TESTS unten).

DIRTY FILE BASELINE: Kernmechanismus `fingerprintPath()`: bei getrackten Dateien der SHA-256-Hash von `git diff HEAD -- <pfad>` (nicht der volle Dateiinhalt — dadurch bleibt eine bereits vor Aktivierung bestehende Änderung Teil der Baseline, nur eine ZUSÄTZLICHE Änderung verschiebt den Hash), bei untracked Dateien der Hash des rohen Inhalts. Zwei Bugs während der Selbsttest-Entwicklung gefunden und behoben:
1. **Löschungs-Erkennungslücke:** eine zu Aktivierungszeitpunkt SAUBERE (nicht dirty) Datei hatte gar keinen Baseline-Eintrag. Wurde sie während des Tasks gelöscht, war ihr aktueller Fingerprint `'ABSENT'` — und da ein fehlender Baseline-Eintrag naiv ebenfalls als `'ABSENT'` interpretiert wurde, erschien das fälschlich als "keine Änderung". Behoben durch `resolveBaseline()`: für Pfade ohne expliziten Baseline-Eintrag wird aus `HEAD` abgeleitet, ob die Datei dort sauber vorhanden war (→ Hash des leeren Diffs) oder nicht existierte (→ `'ABSENT'`).
2. **Pfade mit Leerzeichen:** `git status --short` setzt Pfade mit Leerzeichen/Sonderzeichen standardmäßig in literale Anführungszeichen (`"my dir/file.txt"`), was das naive Parsen verfälschte. Behoben durch `-z` (NUL-getrennte, unquotierte Ausgabe).

PROTECTED FILE DETECTION: Funktioniert jetzt korrekt in beide Richtungen — eine bereits dirty-e, aber vom Task UNVERÄNDERT gelassene `files_protected`-Datei löst KEINE Warnung mehr aus (vorher: potenziell falsch-positiv, da `finish-task.mjs` diese Unterscheidung vorher gar nicht treffen konnte); eine bereits dirty-e UND vom Task ZUSÄTZLICH geänderte `files_protected`-Datei löst weiterhin zuverlässig eine Warnung aus (das eigentliche PIPELINE-002-Ziel).

RENAMES/DELETIONS: `--no-renames` erzwingt, dass eine Umbenennung als zwei separate Einträge erscheint (Löschung alt + Hinzufügung neu) statt einer mehrdeutigen "alt -> neu"-Zeile — beide Seiten werden dadurch korrekt und unabhängig als Änderung erkannt. Eine reine Löschung (ohne Neuanlage) wird über die oben beschriebene `resolveBaseline()`-Korrektur korrekt erkannt.

PATHS WITH SPACES: Behoben über `-z` (siehe DIRTY FILE BASELINE Punkt 2) — real gegen einen Pfad mit Leerzeichen verifiziert.

SELF TESTS: Temporäres, isoliertes Git-Repo im Session-Scratchpad (nicht Teil des Repositories, nach Verifikation gelöscht) — alle 10 geforderten Szenarien (T1–T10) abgedeckt, 15/15 Einzelprüfungen grün (mehrere Prüfungen pro Szenario, z. B. T1 sowohl "wird als Änderung erkannt" als auch "gilt als allowed"). Die beiden oben genannten Bugs wurden GENAU durch diesen Selbsttest gefunden (T8 und T10 schlugen vor der Korrektur fehl) — kein Bug wurde stillschweigend übersehen.

TYPECHECK: PASS.
LINT: PASS.

EXISTING WORKTREE PRESERVED: Bestätigt — `git status` vor und nach diesem Task identisch bis auf die unten genannten Neuzugänge; keine der 24+ bereits modifizierten GGA-/Business-Dateien aus früheren Checkpoints angefasst.

FILES CHANGED:
- `scripts/agent/next-task.mjs` (in `files_allowed`)
- `scripts/agent/finish-task.mjs` (in `files_allowed`)
- `docs/agent/REQUIREMENT_FORMAT.md` (in `files_allowed`)
- **`scripts/agent/lib/git-fingerprint.mjs` — NEU, außerhalb der ursprünglich gelisteten `files_allowed`.** Gemeinsame Fingerprint-Logik für next-task.mjs/finish-task.mjs; wurde bewusst NICHT dupliziert (Risiko von Auseinanderdriften bei einer sicherheitsrelevanten Vergleichsfunktion) und NICHT in `task-meta.mjs` ergänzt (explizit `files_protected`). Analog zur bereits bei REQ-015.4 etablierten Praxis transparent als Scope-Abweichung ausgewiesen statt versteckt.
- Keine Datei aus `files_protected` angetastet (`task-meta.mjs`, `run-gates.mjs`, `validate-task.mjs` unverändert).

NEW FINDINGS: Die beiden oben unter DIRTY FILE BASELINE genannten Bugs (Löschungs-Erkennungslücke, Pfade mit Leerzeichen) — beide während der Implementierung selbst gefunden und noch im selben Task behoben, kein Folgeauftrag nötig.

RISKS:
- Der Fingerprint-Mechanismus verursacht bei `db_test_required`-unabhängigen Tasks keine messbaren Mehrkosten; bei sehr vielen (>100) baseline-dirty Dateien könnte die Anzahl zusätzlicher `git diff`/`git cat-file`-Aufrufe spürbar werden (ein Prozess-Spawn je Pfad) — für die aktuelle Projektgröße (max. ~30 gleichzeitig dirty Dateien in dieser Session) unproblematisch, für sehr große Monorepos ggf. zu beobachten.
- Dieser Task selbst wurde noch von der ALTEN `next-task.mjs` aktiviert (vor der Korrektur) — sein eigener Abschluss durchläuft daher den Abwärtskompatibilitäts-Fallback (reiner Pfadvergleich), nicht den neuen Fingerprint-Pfad. Rein informativ, kein Fehler — bestätigt lediglich, dass der Fallback wie vorgesehen funktioniert.

READY: Ja.




