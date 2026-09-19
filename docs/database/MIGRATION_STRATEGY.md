# Prisma Re-Baseline-Strategie

## Anlass und Grenze

Die Datenbankhistorie enthält die erfolgreich abgeschlossenen Migrationen
`20260427151033_init` und `20260428151830_add_offer_header_fields`. Ihre
Originaldateien sind nicht mehr verfügbar. Sie dürfen weder rekonstruiert,
leergelegt noch über nachgebildete Checksums wieder eingeführt werden.

Die historische Kette bleibt deshalb ein unveränderliches Archiv. Der
kanonische Neustart erfolgt über eine neue, aus dem aktuellen Prisma-Schema
generierte Baseline. Diese Strategie ist zuerst auf isolierten lokalen Klonen
zu testen und darf erst nach expliziter Freigabe auf einer Bestandsdatenbank
verwendet werden.

## Kanonische Baseline

Die geprüfte Vorschau liegt unter
`output/rebaseline-proposal-20260915/prisma/`:

- `schema.prisma`: das kanonische Modell einschließlich Collaboration Phase 1
  und 2 sowie Internal Project Foundation.
- `migrations/20260915000000_canonical_baseline/migration.sql`: aus
  `prisma migrate diff --from-empty` generiertes Initialschema.
- `migrations/migration_lock.toml`: PostgreSQL-Migrationssperre.

Eine spätere produktive Übernahme muss die derzeitige Migrationskette zuerst
als unverändertes Repository-Archiv sichern und anschließend diese Baseline
als einzigen aktiven `prisma/migrations`-Baum führen. Neue Migrationen werden
dann ausschließlich hinter `20260915000000_canonical_baseline` angehängt.
Die Vorschau ersetzt den aktuellen Baum noch nicht.

## Kanonischer Schemaentscheid

- Aktive Business-, Audit-, Nummern-, Collaboration- und Project-Tabellen sind
  Teil der Baseline.
- `customer_addresses.label` ist verpflichtend. Vor einem Bestandsupgrade muss
  `SELECT count(*) FROM customer_addresses WHERE label IS NULL` null ergeben.
- `users.role_id` bleibt optional, aber mit `ON DELETE RESTRICT`; Prisma
  modelliert dies explizit.
- Constraint- und Indexnamen der Collaboration-Dependencies werden auf
  Bestandsdatenbanken nicht kosmetisch geändert.

## Address-Policy

`customer_billing_addresses` und `customer_delivery_addresses` gehören nicht
zum neuen kanonischen Prisma-Modell. Neue Installationen erzeugen sie nicht.
Auf bestehenden Datenbanken bleiben sie physisch und unverändert erhalten;
sie sind eine bewusst bewahrte Legacy-Struktur. Ein Schema-Diff darf deshalb
für diese Tabellen erwartete Drops anzeigen, die niemals blind auszuführen
sind.

## Fresh-DB-Bootstrap

Auf einer leeren, ausdrücklich als Test-/Zieldatenbank identifizierten DB:

1. `DATABASE_URL=<fresh-url> npx prisma migrate deploy --schema output/rebaseline-proposal-20260915/prisma/schema.prisma`
2. `DATABASE_URL=<fresh-url> npx prisma migrate status --schema output/rebaseline-proposal-20260915/prisma/schema.prisma`
3. `npx prisma generate --schema output/rebaseline-proposal-20260915/prisma/schema.prisma`

Das erzeugt die Baseline mit einer Migrationszeile und ohne Legacy-Address-
Tabellen.

## Existing-DB-Upgrade

Schema-Transformation und Historienwechsel sind getrennte Schritte:

1. Vollständigen Custom-Dump, Schema-Dump und `_prisma_migrations`-Export
   erstellen; Restore in eine neue Datenbank beweisen.
2. Auf einem Klon Row Counts und `label IS NULL` prüfen.
3. Ausschließlich die geprüften additiven SQL-Dateien für Collaboration Phase 2
   und Internal Project Foundation anwenden. Danach `label` nur bei null
   Nullwerten auf `NOT NULL` setzen. `users.role_id` benötigt keine DB-Änderung.
4. Die alte `_prisma_migrations`-Tabelle per `ALTER TABLE ... RENAME TO
   _prisma_migrations_legacy_YYYYMMDD` archivieren. Keine Zeile ändern oder
   löschen.
5. Mit `prisma migrate resolve --applied 20260915000000_canonical_baseline`
   gegen den neuen Baseline-Baum die kanonische Historie registrieren.
6. `migrate status` und `migrate diff` ausführen. Übrig bleiben dürfen nur die
   dokumentierten Legacy-Address-Drops und Collaboration-Namensdifferenzen.

`migrate resolve` ist nur nach erfolgreicher Schema-Transformation zulässig;
es führt die Baseline nicht aus, sondern registriert sie für die bereits
passende Struktur.

## Rollback und Verbote

Es gibt keinen In-Place-Down-Migrationsschritt. Bei Fehlschlag oder Zweifel
wird in eine neue Datenbank aus dem verifizierten Full-Dump wiederhergestellt
und die Anwendung darauf zurückgeschaltet. Nicht verwenden: `migrate dev` auf
Bestandsdaten, `db push`, `db reset`, manuelle Änderungen an
`_prisma_migrations`, erfundene Migrationen oder Legacy-Table-Drops.
