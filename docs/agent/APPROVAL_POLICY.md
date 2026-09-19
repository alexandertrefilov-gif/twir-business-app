# APPROVAL_POLICY — Was Claude Code automatisch darf und was nicht

## Automatisch erlaubt (ohne Rückfrage, innerhalb des Task-Scopes)

- Lesen, Analysieren (Read-Only-Audit).
- Implementieren innerhalb von `files_allowed`.
- Unit-Tests ausführen.
- Integrationstests ausführen.
- DB-Tests gegen eine ausdrücklich konfigurierte Dev-/Test-Datenbank
  ausführen (`TEST_DATABASE_URL`, nie Produktion).
- Typecheck, Lint, Build ausführen.
- Playwright lokal/gegen eine Testumgebung ausführen (sobald konfiguriert).
- Fehler innerhalb des Task-Scopes reparieren (bis `max_repair_attempts`).
- Erneut testen.
- Berichte erzeugen (`.agent/reports/`).

## NICHT automatisch erlaubt — erfordert Alex' ausdrückliche Freigabe

- `git push`
- `git merge`
- Deployment (jeder Art)
- Produktionsmigration (`prisma migrate deploy` gegen Produktion)
- Verändern von Produktivdaten
- Verändern von Secrets (`.env*`, `deploy/secrets/`, `deploy/.env.production`)
- Löschen von Branches
- Destruktive DB-Aktionen gegen Produktion
- **Commit** — auch nach `READY_FOR_REVIEW`/`APPROVED` erst nach separatem,
  ausdrücklichem Auftrag (deckungsgleich mit der bereits in dieser Session
  wiederholt bestätigten Projektregel: "Commit nur wenn Projektregeln es
  ausdrücklich vorsehen").

Diese Liste ist deckungsgleich mit den globalen Sicherheitsregeln dieser
Session (git-Schutzprotokoll) und der `AGENTS.md`-Datenbankregel
"Produktionsdatenbank nie für Tests, Reset oder experimentelle Migrationen
verwenden". Die Pipeline hebt diese Regeln nicht auf — sie automatisiert nur
die Schritte, die ohnehin schon als sicher gelten.

## Freigabe-Ablauf für einen fertigen Task

1. `agent:finish` verschiebt den Task nach `.agent/completed/` mit
   `status: READY_FOR_REVIEW` und schreibt `.agent/reports/<ID>.md`.
2. Alex liest den Bericht (lokal oder über `.agent/reports/latest.md`
   an ChatGPT weitergegeben).
3. Alex setzt im `AGENT-META`-Block der Task-Datei `status: APPROVED` oder
   `status: REJECTED` (manuell — kein Skript dafür, bewusst kein
   automatisches Self-Approval).
4. Bei `REJECTED`: Alex entscheidet, ob die Datei zurück nach
   `.agent/queue/` verschoben wird (erneuter Versuch, ggf. mit angepasstem
   Scope) oder liegen bleibt (verworfen, Historie).
5. Bei `APPROVED`: erst jetzt — und nur auf separaten, ausdrücklichen
   Auftrag — Commit. Danach `status: COMPLETED`.

Kein Schritt in dieser Kette darf automatisiert werden, ohne dass Alex ihn
zuvor ausdrücklich freigegeben hat.
