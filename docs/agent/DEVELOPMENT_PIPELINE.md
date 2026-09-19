# TWIR Development Pipeline V1

Ziel: Anforderungen laufen über eine repo-basierte Queue statt manuell
zwischen ChatGPT und Claude Code kopiert zu werden. Alex braucht im
Normalfall nur noch `npm run agent:next` bzw. "nächsten Task starten".

Diese Pipeline ersetzt keine bestehende Struktur — sie ergänzt
`docs/requirements/BACKLOG.md`/`DECISIONS.md` (langfristiger SOLL-Zustand)
und `.agents/skills/*` (bestehende, bereits ChatGPT-kompatible
Qualitäts-Skills, siehe deren `agents/openai.yaml`) um eine ausführbare
Warteschlange für einzelne, eng begrenzte Arbeitsaufträge.

## Verzeichnisse

```
.agent/
  queue/      # QUEUED — bereit zur Aktivierung
  active/     # ACTIVE — genau ein Task gleichzeitig
  completed/  # READY_FOR_REVIEW / APPROVED / COMPLETED
  failed/     # BLOCKED — Repair-Limit erreicht, braucht Alex
  reports/    # ein Bericht pro Task + reports/latest.md/.json
```

## 1. Wie Alex ein Requirement startet

Eine Task-Datei nach `docs/agent/REQUIREMENT_FORMAT.md` unter
`.agent/queue/<ID>.md` ablegen (von Hand oder — künftig — von ChatGPT
vorbereitet und hierher kopiert). `npm run agent:validate` prüft das
Format, bevor irgendetwas aktiviert wird.

Danach genügt:

```
npm run agent:next
```

oder in einer Claude-Code-Session: **"nächsten Task starten"** (aktiviert
die Skill `twir-agent-pipeline`, siehe unten).

## 2. Wie Claude Code den nächsten Task übernimmt

`npm run agent:next`:

1. Wählt den nächsten `QUEUED`-Task nach Priorität (`P0` vor `P1` …), bei
   Gleichstand nach `created` (älter zuerst).
2. Validiert das AGENT-META-Schema; ungültige Tasks werden übersprungen
   und gemeldet, nicht aktiviert.
3. Verschiebt die Datei nach `.agent/active/`, setzt `status: ACTIVE`.
4. Gibt den vollständigen Taskinhalt aus.

Nur EIN Task ist je gleichzeitig aktiv — `agent:next` verweigert die
Aktivierung eines zweiten, solange `.agent/active/` nicht leer ist.

Ab hier folgt Claude Code dem Ablauf aus Abschnitt 4 des ursprünglichen
Pipeline-Auftrags:

```
Projektkontext lesen (AGENTS.md-Navigationsregeln, PROJECT_INDEX/MAP,
  passende .agents/skills/*)
  ↓
Implementierung innerhalb von files_allowed
  ↓
npm run agent:gates   (typecheck → lint → test:run inkl. DB-Gate → build
                        → ggf. Playwright)
  ↓
bei FAIL: Root Cause analysieren → innerhalb des Scopes reparieren →
  erneut npm run agent:gates
  ↓
nach max_repair_attempts erfolglosen Versuchen: BLOCKED, kein weiterer
  automatischer Versuch
  ↓
bei PASS: "## REPORT"-Sektion im Task-Body verfassen (siehe Feldliste
  unten) → npm run agent:finish
```

`agent:gates` erhöht `repair_attempts` bei jedem fehlgeschlagenen Lauf und
schreibt das Ergebnis in `AGENT-META.last_gate_run` — kein Ergebnis wird
stillschweigend verworfen.

**PIPELINE-004 (2026-09-19):** ein bereits VOR Task-Aktivierung
bestehender, vom Task unveränderter Testfehler (z. B. das bekannte
REQ-013-Problem) führt NICHT mehr automatisch zu `FAIL`/`BLOCKED`. `npm
run agent:next` erfasst dafür bei Aktivierung eine Preexisting-Failure-
Baseline; `agent:gates` klassifiziert jeden aktuellen Fehlschlag als
`NEW_FAILURE`, `PREEXISTING_FAILURE` oder `CHANGED_FAILURE`. Nur wenn
AUSSCHLIESSLICH `PREEXISTING_FAILURE`s vorliegen, gilt `test:run` als
`PASS_WITH_PREEXISTING_FAILURES` (kein Repair-Attempt-Verbrauch, Task kann
weiterhin `READY_FOR_REVIEW` erreichen) — der Bericht weist das dann
ausdrücklich über `PREEXISTING_FAILURES_PRESENT: true` aus. Siehe
`docs/agent/TEST_POLICY.md` Abschnitt "Preexisting Failures" für den
vollständigen Mechanismus und das Sicherheitsprinzip (keine Klassifizierung
ohne echte Baseline-Evidenz).

## 3. Wo der Status sichtbar ist

- Grob: welches Verzeichnis die Task-Datei gerade enthält
  (`queue`/`active`/`completed`/`failed`).
- Fein: die automatisch generierte Statuszeile direkt unter dem
  AGENT-META-Block jeder Task-Datei, plus `AGENT-META.status` selbst.
- Sammelübersicht: `git status .agent/` zeigt auf einen Blick, was sich
  bewegt hat.

## 4. Wo der Abschlussbericht liegt

- `.agent/reports/<ID>.md` — vollständiger Bericht dieses Tasks.
- `.agent/reports/latest.md` — identischer Inhalt des zuletzt
  abgeschlossenen Tasks, für schnellen externen Review.
- `.agent/reports/latest.json` — dieselben Kerndaten maschinenlesbar
  (siehe Abschnitt 6).

Pflichtfelder der `## REPORT`-Sektion (von Claude Code verfasst, keine
bekannten Fehler als bestanden darstellen, SKIPPED separat ausweisen):

```
RESULT / REQUIREMENT / IMPLEMENTED / FILES_CHANGED /
PRODUCTION_CODE_CHANGED / DATA_MODEL_CHANGED / PRISMA_MIGRATION /
UNIT_TESTS / INTEGRATION_TESTS / DB_TESTS / PLAYWRIGHT / TYPECHECK /
BUILD / REGRESSIONS / PREEXISTING_FAILURES / NEW_FINDINGS /
SECURITY_FINDINGS / RISKS / BLOCKERS / READY_FOR_REVIEW
```

`agent:finish` ergänzt automatisch (nicht von Claude Code zu wiederholen):
`FILES_CHANGED` laut `git status`, ob Dateien außerhalb `files_allowed`
angefasst wurden, ob `files_protected` berührt wurde, und den letzten
Gate-Lauf.

## 5. Wie ein fehlgeschlagener Task behandelt wird

- Gate-Fehler innerhalb des Repair-Limits → `status: TEST_FAILED`, Task
  bleibt `ACTIVE`, Claude Code repariert weiter.
- Repair-Limit (`max_repair_attempts`, Standard `3`) erreicht →
  `status: BLOCKED`, Task wandert nach `.agent/failed/`, Bericht enthält
  `last_gate_run` als Root-Cause-Beleg. **Keine Endlosschleife.**
- Ein `BLOCKED`-Task wird nie automatisch erneut gestartet. Alex prüft den
  Bericht, passt ggf. Scope/`files_allowed` an und verschiebt die Datei
  von Hand zurück nach `.agent/queue/` mit zurückgesetztem
  `repair_attempts: 0`.

## 6. Wann ChatGPT reviewt

Nach jedem `agent:finish`-Lauf steht ein vollständiger, kompakter Bericht
in `.agent/reports/latest.md`/`.json` — ChatGPT braucht dafür keine
Terminal-Logs mehr, nur diese eine Datei (z. B. eingefügt oder über einen
Repo-Zugriff gelesen). Sinnvoller Zeitpunkt: sobald ein Task
`READY_FOR_REVIEW` erreicht, vor Alex' eigener Entscheidung — ChatGPT kann
als zweite Meinung dienen, ersetzt aber nicht das manuelle Approval Gate
(`APPROVAL_POLICY.md`).

## 7. Wann Playwright läuft

Nur wenn `playwright_required: true` im Task steht — UND nur, wenn
Playwright tatsächlich im Projekt installiert ist. Aktuell ist es das
nicht (`package.json` enthält kein `playwright`/`@playwright/test`);
`agent:gates` meldet dann `PLAYWRIGHT_NOT_CONFIGURED` statt eines
fingierten Ergebnisses. Sobald Playwright projektweit eingeführt wird
(eigener, separater Auftrag), greift dieselbe Weiche automatisch.

## 8. Wann TinyFish eingesetzt wird

Wenn ein Task `browser_qa_required: true` setzt. Die Pipeline baut
TinyFish NICHT lokal nach — sie markiert den Bedarf nur im Bericht
(`EXTERNAL_BROWSER_QA_REQUIRED: true`). Die eigentliche Ausführung bleibt
ein externer, von Alex ausgelöster Schritt.

## 9. Wann ShapeUI/Impeccable eingesetzt wird

Analog zu TinyFish, über ein optionales `ux_review_required: true`-Feld →
`EXTERNAL_UX_REVIEW_REQUIRED: true` im Bericht. Ebenfalls kein lokaler
Nachbau.

## 10. Welche Aktionen Alex ausdrücklich freigeben muss

Siehe `APPROVAL_POLICY.md` — kurz: alles, was über Lesen, Implementieren
im Scope, Testen und Berichten hinausgeht (Commit, Push, Merge, Deployment,
Produktionsmigration, Secrets, destruktive Aktionen).

## Skill-Integration

Die Skill `.agents/skills/twir-agent-pipeline` kapselt genau diesen Ablauf
für Claude-Code-Sessions und referenziert die bestehenden Skills
(`twir-safe-feature-development` für die Implementierung,
`twir-testing`/`twir-release-gate` für die Gates,
`twir-project-audit` für den Kontext-Read) statt sie zu duplizieren.
