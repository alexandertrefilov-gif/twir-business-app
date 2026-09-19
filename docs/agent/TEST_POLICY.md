# TEST_POLICY — Test-Gates der Agent-Pipeline

Die Pipeline erfindet keine neuen Testbefehle. Sie nutzt ausschließlich die
in `package.json` vorhandenen Scripts und wertet sie transparent aus —
siehe `.agents/skills/twir-testing/SKILL.md` und `twir-release-gate/SKILL.md`,
deren Verbindlicher Ablauf hier als automatisiertes Gate wiederverwendet wird.

## Vorhandene Befehle (Quelle der Wahrheit: `package.json`)

| Kategorie | Befehl | Umfang |
|---|---|---|
| Typecheck | `npm run typecheck` | `tsc --noEmit` |
| Lint | `npm run lint` | `eslint .` |
| Unit + Integration | `npm run test:run` | `vitest run` — läuft über `tests/unit/**` UND `tests/integration/**` in einem Durchgang; DB-Integrationstests sind einzeln über `describe.skipIf(!RUN_INTEGRATION)` geschützt (`RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL`). |
| Build | `npm run build` | `next build` |
| Playwright | — | **nicht installiert** (kein Paket, keine Config). `run-gates.mjs` meldet `PLAYWRIGHT_NOT_CONFIGURED`, niemals einen fingierten Pass. |

Es gibt bewusst keine separaten `test:unit`/`test:integration`/`test:db`-Scripts
— das ist Projektkonvention (`AGENTS.md` → Testregeln: "Keine neue
Testinfrastruktur ohne Auftrag"). Die Pipeline unterscheidet die Kategorien
stattdessen über Dateipfad-Konvention und die Vitest-Zusammenfassungszeile.

## DB-Test-Gate (zentrale Regel dieses Dokuments)

`TEST_DATABASE_URL` aktiviert die `*-db.test.ts`- und `race-condition.test.ts`-
Integrationstests. Ohne diese Variable meldet Vitest sie als `skipped` — mit
Exitcode 0. Ein Skip ist **kein Beweis für korrektes Verhalten**.

`scripts/agent/run-gates.mjs` behandelt das so:

1. `db_test_required: false` im Task → `db_test_status: NOT_APPLICABLE`, kein Blocker.
2. `db_test_required: true`, `TEST_DATABASE_URL` nicht gesetzt →
   `db_test_status: DB_TESTS_NOT_EXECUTED`. Das Gate gilt als **FAIL**, Status
   bleibt `TEST_FAILED`/`BLOCKED` — READY_FOR_REVIEW wird NICHT erreicht.
3. `db_test_required: true`, `TEST_DATABASE_URL` gesetzt → ein GEZIELTER,
   isolierter Probe-Lauf ausschließlich der tatsächlich
   `TEST_DATABASE_URL`-gekoppelten Dateien (`*-db.test.ts` +
   `race-condition.test.ts`, ermittelt über `findDbTestFiles()`):
   `npx vitest run <genau diese Dateien>`. Meldet DIESER isolierte Lauf
   `skipped > 0` → `db_test_status: DB_TESTS_PARTIALLY_SKIPPED`, FAIL. Sonst
   `db_test_status: DB_TESTS_EXECUTED`, Gate zählt regulär nach Exitcode des
   *gesamten* `test:run`-Laufs (Schritt weiter unten).
   — **PIPELINE-001 (2026-09-19):** vor dieser Korrektur wurde JEDER Skip im
   gesamten `npm run test:run`-Lauf als potenziell DB-bezogen gewertet,
   sobald irgendeine `*-db.test.ts`-Datei im Projekt existierte — das erzeugte
   falsch-positive `DB_TESTS_PARTIALLY_SKIPPED`-Meldungen für unrelated Skips
   (z. B. eine E2E-Testdatei mit eigenem, von `TEST_DATABASE_URL`
   unabhängigem Env-Gate). Der isolierte Probe-Lauf entkoppelt die
   Klassifizierung vollständig von Skips aus anderen Gründen.

**Hintergrund:** genau das globale-Skip-Muster hat die REQ-015-Regressionen in
`gga-operator-portal-db.test.ts`/`race-condition.test.ts` ursprünglich
verdeckt — ein Standardlauf ohne `TEST_DATABASE_URL` zeigte sie nur als
"skipped", nicht als Fehler. Diese Regel existiert, damit das nicht
unbemerkt wieder passiert — die PIPELINE-001-Korrektur macht die Erkennung
zusätzlich präzise, ohne die Kernregel selbst abzuschwächen.

`TEST_DATABASE_URL` MUSS auf eine ausdrücklich konfigurierte Dev-/Test-
Datenbank zeigen (z. B. dieselbe lokale DB wie `DATABASE_URL`, NIE eine
Produktions-URL — siehe `AGENTS.md` → Datenbankregeln). Die Pipeline prüft
selbst nicht, ob die URL zufällig auf Produktion zeigt — das bleibt in der
Verantwortung dessen, der `TEST_DATABASE_URL` in der Shell setzt.

## Externe QA-Erweiterungspunkte (Hooks, kein lokaler Nachbau)

- `browser_qa_required: true` im Task → Bericht enthält
  `EXTERNAL_BROWSER_QA_REQUIRED: true`. Kein lokaler TinyFish-Ersatz.
- `ux_review_required: true` (optionales Feld, analog) → Bericht enthält
  `EXTERNAL_UX_REVIEW_REQUIRED: true`. Kein lokaler ShapeUI/Impeccable-Ersatz.
- Playwright: sobald das Projekt Playwright tatsächlich einführt (eigener,
  separater Auftrag), ergänzt `run-gates.mjs` den echten Lauf — die Weiche
  (`task.meta.playwright_required`) existiert bereits.

## Gate-Ergebnis

`agent:gates` meldet **GESAMT: PASS** nur, wenn ALLE zutreffenden Gates
PASS sind — inklusive `DB_TESTS_EXECUTED` bei `db_test_required: true`. Bei
FAIL wird `repair_attempts` erhöht; bei Erreichen von `max_repair_attempts`
wechselt der Task auf `BLOCKED` (siehe `DEVELOPMENT_PIPELINE.md`).

## Preexisting Failures (PIPELINE-004, 2026-09-19)

**Problem, das dieser Abschnitt löst:** ein Task kann inhaltlich vollständig
korrekt sein (z. B. ein `READ_ONLY_AUDIT` mit `files_allowed: []`), aber
trotzdem `BLOCKED` werden, weil `npm run test:run` einen bereits VOR
Task-Beginn vorhandenen, vom Task unveränderten Testfehler zeigt (Beispiel:
der bekannte REQ-013-Fehlschlag in `tests/integration/gga-cabinet-db.test.ts`
hat DB-DRIFT-001 blockiert, obwohl der Task keine einzige Datei geändert
hat). `max_repair_attempts` wird dabei sinnlos verbraucht, ohne dass es
etwas zu "reparieren" gäbe.

**Mechanismus:**

1. `scripts/agent/next-task.mjs` führt bei Aktivierung (VOR jeder Änderung
   durch den Task) einen vollständigen `vitest run` mit zusätzlichem
   JSON-Reporter aus (`--reporter=default --reporter=json
   --outputFile.json=<tmp>` — Standard-Reporter-Konsolenausgabe bleibt
   dadurch identisch zu vorher) und speichert je fehlgeschlagener Assertion
   eine strukturierte Signatur (`{file, testName, message, key}`,
   `message` normalisiert — UUIDs/Timestamps/lange Zahlen ersetzt, siehe
   `scripts/agent/lib/test-baseline.mjs`) als `baseline_test_failures` im
   AGENT-META-Block. Zusätzlich `baseline_test_database_url_set: boolean`.
2. `scripts/agent/run-gates.mjs` führt denselben `vitest run` (weiterhin
   derselbe zugrunde liegende Befehl wie `npm run test:run`, kein neuer
   Testbefehl) erneut mit JSON-Reporter aus, extrahiert die aktuellen
   Failure-Signaturen und klassifiziert JEDE gegen die Baseline:
   - **NEW_FAILURE** — keine passende Baseline-Testidentität.
   - **PREEXISTING_FAILURE** — gleiche Testidentität UND gleiche
     normalisierte Fehlermeldung wie in der Baseline.
   - **CHANGED_FAILURE** — gleiche Testidentität, andere Meldung (gilt
     NICHT als preexisting — ein verändertes Fehlerbild kann ein neues,
     verwandtes Problem sein).
   - Ein Baseline-Fehler ohne aktuelles Gegenstück gilt als "resolved"
     (informativ, blockiert nichts).
3. `test_run`-Gate-Ergebnis: `PASS` (keine Fehlschläge), `FAIL` (mindestens
   ein `NEW_FAILURE`/`CHANGED_FAILURE`, ODER keine auswertbare
   Baseline-Evidenz vorhanden), oder **`PASS_WITH_PREEXISTING_FAILURES`**
   (ausschließlich `PREEXISTING_FAILURE`s) — nur dieser dritte Fall zählt
   NICHT als `gateFailed` und verbraucht KEINEN `repair_attempts`.

**Sicherheitsprinzip (unverändert zentral):** ohne belastbare
Baseline-Evidenz (kein `baseline_test_failures`-Feld — z. B. ein Task, der
mit einer älteren `next-task.mjs`-Version vor PIPELINE-004 aktiviert wurde
— oder ein fehlgeschlagener/nicht auswertbarer JSON-Lauf) bleibt es beim
bisherigen, konservativen Verhalten: JEDER Testfehlschlag zählt als FAIL.
Eine freie `KNOWN_ISSUES`-Beschreibung im Task-Body allein reicht NIEMALS
als Nachweis für "preexisting" — nur ein tatsächlich zum Aktivierungs-
zeitpunkt real erfasster, identischer Fehlschlag zählt.

**Wichtige operative Voraussetzung:** damit ein bekannter DB-Testfehler
(z. B. REQ-013) korrekt als preexisting erkannt wird, MUSS
`TEST_DATABASE_URL` bereits beim Aufruf von `npm run agent:next` gesetzt
sein — genau wie bei `agent:gates`. Ist es das nicht, laufen die
`*-db.test.ts`-Dateien in der Baseline als "skipped" statt "failed", und
ein später real fehlschlagender DB-Test kann dann nie als preexisting
gelten (bleibt FAIL — Sicherheitsprinzip, keine Abschwächung).

**Sichtbarkeit:** `last_gate_run.preexisting_failures_present` sowie die
konkreten `new_failures`/`changed_failures`/`preexisting_failures`-Listen
landen automatisch im AGENT-META-Block und damit im generierten Bericht;
zusätzlich schreibt `finish-task.mjs` eine eigene, gut sichtbare Zeile
`PREEXISTING_FAILURES_PRESENT: true/false` in die "Automatisch ermittelte
Fakten" — niemals nur versteckt in einem großen JSON-Block.

**Ausdrücklich unverändert:** die DB-Test-Gate-Logik aus PIPELINE-001 (Skip
vs. Fail, `DB_TESTS_NOT_EXECUTED`) wird durch PIPELINE-004 NICHT berührt —
ein erforderlicher, tatsächlich nicht ausgeführter DB-Test bleibt FAIL/
BLOCKED unabhängig von jeder Preexisting-Failure-Klassifizierung. Ebenso
unverändert: `playwright_required` + nicht installiert bleibt
`PLAYWRIGHT_NOT_CONFIGURED` (separat vorgemerkt als PIPELINE-003-Kandidat,
nicht Teil von PIPELINE-004).
