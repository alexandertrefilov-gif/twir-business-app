<!-- AGENT-META
{
  "id": "DB-DOC-001",
  "title": "Retirement-/Freigabebedingung für Legacy-Address-Tabellen dokumentieren",
  "status": "QUEUED",
  "priority": "P3",
  "type": "docs",
  "scope": "single",
  "files_allowed": [
    "docs/database/MIGRATION_STRATEGY.md"
  ],
  "files_protected": [
    "prisma/schema.prisma",
    "prisma/migrations"
  ],
  "tests_required": [],
  "db_test_required": false,
  "playwright_required": false,
  "browser_qa_required": false,
  "manual_approval_required": true,
  "report_format": "default",
  "created": "2026-09-19",
  "max_repair_attempts": 3,
  "repair_attempts": 0
}
-->
> **Status:** QUEUED · **Priority:** P3 · **Type:** docs · **Repair-Versuche:** 0/3

## CONTEXT

Nachfolge-Dokumentationstask aus DB-DRIFT-001 (`.agent/failed/DB-DRIFT-001.md`,
fachlich APPROVED — der Pipeline-Status bleibt bewusst `BLOCKED`, siehe
dortigen `## APPROVAL`-Abschnitt). Der Audit hat bestätigt: `customer_billing_addresses`/
`customer_delivery_addresses` sind eine bewusst bewahrte Legacy-Struktur
(siehe `docs/database/MIGRATION_STRATEGY.md`, Abschnitt "Address-Policy"),
aber das Dokument nennt bislang KEIN Ablaufdatum und KEINE explizite
Freigabebedingung, ab wann/unter welchen Voraussetzungen diese Tabellen
später entfernt werden dürfen.

**Noch nicht ausführen — nur vorgemerkt (Priorität P3, niedrigste Stufe).**

## ZIEL

`docs/database/MIGRATION_STRATEGY.md` um einen neuen Abschnitt ergänzen,
der explizit festhält:

- unter welchen Voraussetzungen `customer_billing_addresses`/
  `customer_delivery_addresses` als endgültig entbehrlich gelten (z. B.
  bestätigter Datenabgleich mit `customer_addresses`/`addresses`, bestätigte
  Nicht-Nutzung auf einer etwaigen Produktivdatenbank),
  wer diese Freigabe erteilt,
- dass ein tatsächliches Entfernen weiterhin ein eigener, separat zu
  beauftragender Task bleibt (kein Freibrief für einen automatischen Drop).

## ACCEPTANCE_CRITERIA

- [ ] Neuer Abschnitt in `docs/database/MIGRATION_STRATEGY.md` nennt eine
      konkrete, überprüfbare Freigabebedingung für die Legacy-Tabellen.
- [ ] Bestehender Inhalt des Dokuments bleibt inhaltlich unverändert
      (reine Ergänzung, keine Umdeutung der bereits getroffenen
      Rebaseline-Entscheidung).
- [ ] Kein Schema-/DB-Eingriff, keine Migration.

## KNOWN_ISSUES

- Rein dokumentarisch — keine Code-/Schema-Änderung vorgesehen.

## DO_NOT

- Keine Änderung an `prisma/schema.prisma` oder `prisma/migrations`.
- Keine Löschung der Legacy-Tabellen in diesem oder einem daraus
  automatisch abgeleiteten Task.
- Keine Migration/DB-Aktion jeglicher Art.

## REPORT_FORMAT

Standardfelder aus `docs/agent/DEVELOPMENT_PIPELINE.md` Abschnitt 4.

## REPORT

(wird beim Abschluss dieses Tasks ergänzt)
