---
name: twir-database-migration
description: Steuert sichere Änderungen am Prisma-Schema und deren ausrollbare Migration. Verwenden bei Modellen, Feldern, Enums, Constraints oder Relationen; nicht für reine Abfragen oder Seed-Daten ohne Schemaänderung.
---

# Zweck

Schemaänderungen reproduzierbar, überprüfbar und rückfallfähig planen.

# Aktivierung

Bei `prisma/schema.prisma`, Migration, Constraint, Enum, Relation, Index oder Backfill verwenden.

# Nicht verwenden für

Query-Optimierung ohne Schemaänderung; dafür `twir-prisma-data-integrity`.

# Projektbezug

- Schema: `prisma/schema.prisma`.
- Seed: `prisma/seed/seed.ts`.
- Scripts: `db:generate`, `db:migrate`, `db:migrate:prod`, `db:push`.
- Aktuell existiert kein `prisma/migrations/`-Verzeichnis.

# Verbindlicher Ablauf

1. Schema, Datenzugriffe und Seed-Verwendung des Feldes lesen.
2. Datenbestand, Nullbarkeit, Default, Constraint und Löschverhalten bewerten.
3. Migration und gegebenenfalls Backfill entwerfen.
4. Prisma-Client generieren und Typen/Tests prüfen.
5. Deployment- und Rückfallreihenfolge dokumentieren.

# Prüfkriterien

- Produktionsänderungen nicht mit `db:push` behandeln.
- Migrationen sind deterministisch und ohne stillen Datenverlust.
- Enum- und Pflichtfeldänderungen berücksichtigen vorhandene Daten.
- Relation und Gegenrelation bleiben konsistent.

# Abbruchkriterien

- Keine Sicherungs- oder Rollbackstrategie bei potenziellem Datenverlust.
- Bestehender Datenbestand ist unbekannt und die Änderung destruktiv.
- Migration soll ausgeführt werden, obwohl nur Planung autorisiert ist.

# Tests

`npm run db:generate`, `npm run typecheck`, `npm run test:run`, `npm run build`; produktive Migration nur nach separater Freigabe.

# Ausgabeformat

Schema-Diff, Datenrisiko, Migrations-/Backfillplan, Befehle und Rückfallstrategie angeben.
