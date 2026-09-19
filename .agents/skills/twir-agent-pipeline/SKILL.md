---
name: twir-agent-pipeline
description: Übernimmt den nächsten Task aus der repo-basierten TWIR-Agent-Queue (.agent/queue/) und arbeitet ihn bis zum Bericht ab. Verwenden bei "nächsten Task starten", "agent:next" oder einer Aufforderung, einen vorbereiteten Task auszuführen; nicht zum eigenständigen Erfinden neuer Anforderungen.
---

# Zweck

Anforderungen aus `.agent/queue/` kontrolliert, mit festem Scope und
begrenztem Repair-Loop umsetzen, statt Prompts manuell zwischen ChatGPT und
Claude Code zu kopieren. Vollständige Referenz: `docs/agent/DEVELOPMENT_PIPELINE.md`.

# Aktivierung

Bei "nächsten Task starten", "agent:next", oder wenn Alex auf einen
konkreten, bereits in `.agent/queue/` liegenden Task verweist.

# Nicht verwenden für

Freihändige neue Features ohne vorbereitete Task-Datei, oder wenn bereits
ein Task in `.agent/active/` liegt (zuerst abschließen).

# Projektbezug

`.agent/{queue,active,completed,failed,reports}/`, `scripts/agent/*.mjs`,
`docs/agent/*.md`, sowie — abhängig vom Task-Inhalt — die vom Task
referenzierten `.agents/skills/*`.

# Verbindlicher Ablauf

1. `npm run agent:next` ausführen (aktiviert den nächsten `QUEUED`-Task
   nach Priorität, verschiebt ihn nach `.agent/active/`).
2. Task-Body vollständig lesen: `CONTEXT`, `ACCEPTANCE_CRITERIA`,
   `KNOWN_ISSUES`, `DO_NOT`. `files_allowed`/`files_protected` aus dem
   AGENT-META-Block als bindenden Scope behandeln.
3. Passende Projektregeln/Skills laden (`AGENTS.md`-Navigationsregeln,
   `docs/PROJECT_INDEX.md` für das betroffene Modul, dazu
   `twir-safe-feature-development` für die Umsetzung selbst und jeden im
   Task genannten Domänenskill).
4. Implementieren — ausschließlich innerhalb `files_allowed`. Eine Datei
   in `files_protected` NIE anfassen, auch nicht "nur zum Test".
5. `npm run agent:gates` ausführen. Bei FAIL: Root Cause aus der Ausgabe
   bestimmen, innerhalb des Scopes reparieren, Gates erneut ausführen.
6. Nach `max_repair_attempts` erfolglosen Gate-Läufen: NICHT weiter
   versuchen — der Task ist dann bereits `BLOCKED`
   (`scripts/agent/run-gates.mjs` setzt das automatisch). Mit Schritt 7
   fortfahren und den Blocker ehrlich berichten.
7. Eine `## REPORT`-Sektion an den Task-Body anhängen (Edit-Tool auf die
   Datei in `.agent/active/`) mit den Pflichtfeldern aus
   `docs/agent/DEVELOPMENT_PIPELINE.md` Abschnitt 4. Kein Feld auslassen,
   keinen SKIPPED-Test als PASS darstellen.
8. `npm run agent:finish` ausführen — erzeugt `.agent/reports/<ID>.md`,
   verschiebt die Task-Datei nach `.agent/completed/` oder `.agent/failed/`.
9. Alex das Ergebnis kurz zusammenfassen und auf den Bericht verweisen.

# Prüfkriterien

- Nie mehr als ein aktiver Task gleichzeitig.
- Keine Änderung außerhalb `files_allowed` ohne das im Bericht explizit
  zu benennen (siehe `finish-task.mjs`s automatische Scope-Prüfung).
- `db_test_required: true` erfordert `DB_TESTS_EXECUTED`, niemals
  `DB_TESTS_NOT_EXECUTED` als stillschweigenden Pass.
- Commit/Push/Merge/Deployment NIE ohne separaten, ausdrücklichen Auftrag
  — auch nicht nach `READY_FOR_REVIEW` (siehe `APPROVAL_POLICY.md`).

# Abbruchkriterien

- Task-Datei fehlt ein Pflichtfeld oder ist mehrdeutig → nicht aktivieren
  lassen (bereits durch `validate-task.mjs` abgedeckt), stattdessen Alex
  informieren.
- Scope würde bestehende GGA-/Business-Funktionen außerhalb von
  `files_allowed` verändern müssen → stoppen und berichten statt den Scope
  eigenmächtig zu erweitern.
- Repair-Limit erreicht → `BLOCKED` stehen lassen, nicht manuell umgehen.

# Tests

`npm run agent:gates` (kapselt `typecheck`, `test:run`, `lint`, `build`,
optional Playwright) — siehe `docs/agent/TEST_POLICY.md` für die genaue
DB-Test-Gate-Logik.

# Ausgabeformat

Kurz: aktivierter Task, Ergebnis (READY_FOR_REVIEW/BLOCKED), Pfad zum
Bericht, offene Punkte für Alex' manuelles Approval.
