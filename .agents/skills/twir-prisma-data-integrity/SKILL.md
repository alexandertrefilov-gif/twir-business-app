---
name: twir-prisma-data-integrity
description: Prüft das vorhandene Prisma-Modell auf Relationen, Constraints, Indizes, Löschverhalten, Transaktionen, Snapshots und Abfrageeffizienz. Verwenden bei Datenintegrität und Queries; Migrationserstellung bleibt bei `twir-database-migration`.
---

# Zweck

Fachliche Konsistenz auf Datenbank- und Serviceebene schützen.

# Aktivierung

Bei Prisma, Relation, Foreign Key, Unique, Index, Cascade, nullable, Transaktion, N+1 oder Snapshot verwenden.

# Nicht verwenden für

Ausrollplanung von Schemaänderungen.

# Projektbezug

`prisma/schema.prisma`, `lib/db/prisma.ts`, alle `lib/services/*.service.ts`, Nummernservice und Prisma-Integrationstest.

# Verbindlicher Ablauf

1. Modell, Gegenrelation und Kardinalität prüfen.
2. Nullbarkeit, Unique/Index und Löschverhalten bewerten.
3. Service-Transaktionen und Soft-/Hard-Delete abgleichen.
4. historische Snapshots gegen Stammdatenrelationen prüfen.
5. Query-Shape, Pagination und mögliche N+1-Stellen untersuchen.

# Prüfkriterien

Dokumentnummern eindeutig; Positionen cascaden bewusst; fachliche Hauptobjekte meist soft gelöscht; Rechnungs-/Angebotssnapshots bleiben historisch; häufige Filter sind indexiert.

# Abbruchkriterien

Löschwirkung unklar; Datenverlust möglich; Snapshot würde durch Live-Relation ersetzt; Constraintänderung ohne Migrationsskill.

# Tests

`npm run db:generate`, `npm run typecheck`, `npm run test:run`; DB-Test nur mit separater Testdatenbank.

# Ausgabeformat

Modell/Feld, Invariante, vorhandener Schutz, Befund, Migrationserfordernis und Test.
