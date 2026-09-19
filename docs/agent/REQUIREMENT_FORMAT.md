# REQUIREMENT_FORMAT — Task-Dateiformat für die Agent-Pipeline

Dieses Format gilt ausschließlich für Dateien unter `.agent/{queue,active,completed,failed}/`.
Es ersetzt NICHT `docs/requirements/BACKLOG.md`/`DECISIONS.md` — siehe
[Verhältnis zu BACKLOG.md/DECISIONS.md](#verhältnis-zu-backlogmddecisionsmd) unten.

## Aufbau

Eine Task-Datei ist Markdown mit genau zwei Teilen:

1. Ein maschinenlesbarer `AGENT-META`-Block (JSON, in einem HTML-Kommentar
   — unsichtbar in jedem normalen Markdown-Viewer/GitHub). Dies ist die
   **alleinige Quelle der Wahrheit** für alle skriptgesteuerten Felder.
   Kein YAML-Parser, keine neue Dependency — reines `JSON.parse`.
2. Eine für Menschen und Claude Code lesbare Markdown-Sektion darunter
   (Kontext, Akzeptanzkriterien, Hinweise — freier Text, wird von den
   Skripten nie geparst, nur von Claude Code gelesen/ergänzt).

Direkt unter dem `AGENT-META`-Block erzeugen die Skripte automatisch eine
einzeilige Statuszusammenfassung (`> **Status:** ... · **Priority:** ...`)
— abgeleitet, nie manuell pflegen.

```markdown
<!-- AGENT-META
{
  "id": "REQ-015.2",
  "title": "GGA Cleanup — Fixture-Regression, Betreiber-Schrankakte, Multi-Cabinet Gate",
  "status": "QUEUED",
  "priority": "P1",
  "type": "bugfix",
  "scope": "multi",
  "files_allowed": ["tests/integration/gga-cabinet-inspection-db.test.ts"],
  "files_protected": ["lib/collaboration/cabinet-workflow.ts"],
  "tests_required": ["unit", "integration"],
  "db_test_required": true,
  "playwright_required": false,
  "browser_qa_required": false,
  "manual_approval_required": true,
  "report_format": "default",
  "created": "2026-09-18",
  "max_repair_attempts": 3,
  "repair_attempts": 0
}
-->
> **Status:** QUEUED · **Priority:** P1 · **Type:** bugfix · **Repair-Versuche:** 0/3

## CONTEXT
...

## ACCEPTANCE_CRITERIA
- [ ] ...

## KNOWN_ISSUES
- ...

## DO_NOT
- ...
```

## Pflichtfelder (AGENT-META)

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | REQ-ID, **im selben Namensraum wie `docs/requirements/BACKLOG.md`** (z. B. `REQ-018`, oder ein Teilscope wie `REQ-015.2`) — keine eigene ID-Zählung. |
| `title` | string | Kurztitel. |
| `status` | enum | Siehe Statusmodell unten. |
| `priority` | `P0`\|`P1`\|`P2`\|`P3` | Bestimmt die Reihenfolge in `agent:next`. |
| `type` | string | z. B. `bugfix`, `feature`, `refactor`, `investigation`. |
| `scope` | `single`\|`multi` | Ein oder mehrere fachliche Teilbereiche (informativ). |
| `files_allowed` | string[] | Dateien, die verändert werden dürfen. **`[]` (leeres Array) bedeutet bewusst „keine Datei darf sich ändern"** — strikter Read-Only-Scope, z. B. für Audit-Tasks. Es gibt keinen Wert für „kein Scope-Check". |
| `files_protected` | string[] | Dateien, die NICHT verändert werden dürfen — `finish-task` meldet jede Berührung als Warnung im Bericht, blockiert aber nicht automatisch (Alex entscheidet im Review). |
| `tests_required` | string[] | Teilmenge von `unit`, `integration`, `db`, `playwright`. |
| `db_test_required` | boolean | Wenn `true`: `agent:gates` muss `DB_TESTS_EXECUTED` melden, nie `DB_TESTS_NOT_EXECUTED` als PASS werten. |
| `playwright_required` | boolean | Wenn `true` und Playwright nicht installiert: `PLAYWRIGHT_NOT_CONFIGURED`, kein fingierter Pass. |
| `browser_qa_required` | boolean | Setzt `EXTERNAL_BROWSER_QA_REQUIRED` im Bericht (TinyFish-Hook, siehe `TEST_POLICY.md`). |
| `manual_approval_required` | boolean | Fast immer `true` — siehe `APPROVAL_POLICY.md`. |
| `report_format` | string | `default`, oder ein Name für einen abweichenden Berichtsaufbau. |
| `created` | string (`YYYY-MM-DD`) | Für Sortierung bei gleicher Priorität. |
| `max_repair_attempts` | number | Standard `3`. |
| `repair_attempts` | number | Von `agent:gates` verwaltet, initial `0`. |

Von den Skripten automatisch ergänzte Felder (nicht von Hand pflegen):
`started_at`, `finished_at`, `last_gate_run`, `blocked_reason`, `report_path`,
`baseline_git_status` (reine Pfadliste aus `git status --short` bei
Aktivierung — nur für Menschen lesbar, wird für die eigentliche
Scope-Prüfung nicht mehr verwendet), `baseline_fingerprints`
(**PIPELINE-002**, maßgeblich für die Scope-Prüfung: ein Inhalts-Hash je
zu Aktivierungszeitpunkt bereits dirty-em Pfad — Diff gegen `HEAD` bei
getrackten, roher Dateiinhalt bei untracked Dateien, siehe
`scripts/agent/lib/git-fingerprint.mjs`), `baseline_test_failures`
(**PIPELINE-004**, 2026-09-19: Array strukturierter Failure-Signaturen
`{file, testName, message, key}` aus einem vollständigen `vitest run` bei
Aktivierung, oder `null` falls kein auswertbares Ergebnis — maßgeblich für
die Preexisting-Failure-Klassifizierung in `agent:gates`, siehe
`docs/agent/TEST_POLICY.md`), `baseline_test_run_at`,
`baseline_test_database_url_set` (Bool — ob `TEST_DATABASE_URL` bei der
Baseline-Erfassung gesetzt war, wichtig für die Aussagekraft der Baseline
bei DB-gekoppelten Tests).

`finish-task.mjs` vergleicht bei Abschluss NICHT mehr nur, ob ein Pfad neu
zur Diff-Liste hinzugekommen ist (das hätte eine bereits vor Aktivierung
dirty-e, aber vom Task ZUSÄTZLICH veränderte Datei nie erkannt — beide
Zustände sehen in `git status --short` identisch aus). Stattdessen wird
für jeden am Ende relevanten Pfad (Vereinigung aus `baseline_fingerprints`-
Schlüsseln und aktuell dirty-en Pfaden) ein Fingerprint zum Zeitpunkt der
Aktivierung UND zum Abschlusszeitpunkt verglichen — nur ein tatsächlich
geänderter Fingerprint gilt als Task-Änderung. Für Pfade ohne expliziten
Baseline-Eintrag wird der implizite Zustand aus `HEAD` abgeleitet
(`resolveBaseline()`): im letzten Commit vorhanden → sauber (kein Diff);
sonst nicht vorhanden → `ABSENT`. Fehlt `baseline_fingerprints` ganz (z. B.
ein vor PIPELINE-002 aktivierter, noch offener Task), fällt die Prüfung
auf den alten, reinen Pfadvergleich zurück (Abwärtskompatibilität).

## Statusmodell

```
QUEUED → ACTIVE → (BLOCKED | IMPLEMENTED → TEST_FAILED → … → READY_FOR_REVIEW)
                                                              ↓
                                                    APPROVED | REJECTED
                                                              ↓
                                                         COMPLETED
```

- `QUEUED`: Datei liegt in `.agent/queue/`.
- `ACTIVE`: Datei liegt in `.agent/active/` (von `agent:next` verschoben).
- `IMPLEMENTED`: letzter `agent:gates`-Lauf war grün.
- `TEST_FAILED`: letzter `agent:gates`-Lauf war rot, Repair-Limit noch nicht erreicht.
- `BLOCKED`: Repair-Limit erreicht — Datei liegt in `.agent/failed/`, braucht menschliche Root-Cause-Analyse.
- `READY_FOR_REVIEW`: Datei liegt in `.agent/completed/`, Bericht erzeugt, wartet auf Alex.
- `APPROVED`/`REJECTED`: von Alex im Review gesetzt (Bearbeitung der Datei in `.agent/completed/`).
- `COMPLETED`: nach `APPROVED` UND — falls im Task vorgesehen — Commit; endgültig, Datei bleibt als Historie in `.agent/completed/`.

Kein Status wird übersprungen und keine komplexere State Machine als diese.

## Verhältnis zu BACKLOG.md/DECISIONS.md

- `docs/requirements/BACKLOG.md` bleibt der langfristige SOLL-Zustand-Katalog
  (menschlich geschrieben, keine AGENT-META-Blöcke).
- Eine Task-Datei unter `.agent/queue/` ist ein **ausführungsbereites Ticket**
  für GENAU diesen Pipeline-Lauf — entweder abgeleitet aus einem bestehenden
  `BACKLOG.md`-Eintrag (gleiche `id`) oder für eng begrenzte Nacharbeiten wie
  `REQ-015.2`, die (noch) nicht in `BACKLOG.md` nacherfasst sind.
- Nach `COMPLETED`: `BACKLOG.md`-Status auf `IMPLEMENTED + TESTED` aktualisieren,
  falls ein passender Eintrag existiert — das ist ein manueller Dokumentationsschritt
  (siehe `twir-documentation-sync`-Skill), keine automatische Skriptaktion.
