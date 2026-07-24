---
name: twir-numbering-and-identifiers
description: Prüft atomare Dokumentnummern, UUIDs und eindeutige Identifikatoren für Angebot, Auftrag, Rechnung und Leistungsnachweis. Verwenden bei Nummernkreisen oder Parallelität; nicht für sichtbare Labels ohne Identifierbezug.
---

# Zweck

Eindeutige, lückenarm und konkurenzsicher vergebene Dokumentnummern bewahren.

# Aktivierung

Bei `NumberSequence`, `nextNumber`, Präfix, Format, Jahr, UUID oder Race Condition verwenden.

# Nicht verwenden für

Allgemeine Datenbankmigrationen ohne Nummernbezug.

# Projektbezug

- `NumberSequenceType` in `types/enums.ts` und `prisma/schema.prisma`.
- `lib/services/number-sequence.service.ts`.
- Aufrufer: Angebot-, Auftrag-, Rechnungs- und Leistungsservice.
- Einstellungen/Seed: `CompanySetting`, `prisma/seed/seed.ts`.
- Test: `tests/integration/race-condition.test.ts`.

# Verbindlicher Ablauf

1. Nummerntyp, Präfix, Jahr und Format ermitteln.
2. Transaktionsgrenze und `FOR UPDATE`-Sperre nachvollziehen.
3. Unique Constraint `type + year` und Dokumentfeld prüfen.
4. Parallelitäts- und Jahreswechseltest bestimmen.
5. Keine Nummer außerhalb des zentralen Services erzeugen.

# Prüfkriterien

- Rechnungsnummer bleibt bis zur Finalisierung `null`.
- Nummernvergabe läuft in derselben Transaktion wie Dokumenterstellung/-finalisierung.
- Dokumentnummernfelder sind eindeutig.
- Formatänderungen überschreiben keine historischen Nummern.

# Abbruchkriterien

- Nummer soll clientseitig erzeugt werden.
- Transaktion oder Unique Constraint würde entfernt.
- Umgang mit bestehendem Nummernkreis ist unklar.

# Tests

`npm run test:run`; Integrationstest benötigt `TEST_DATABASE_URL`.

# Ausgabeformat

Nummerntyp, Transaktion, Constraint, Parallelitätstest und Restrisiko dokumentieren.
