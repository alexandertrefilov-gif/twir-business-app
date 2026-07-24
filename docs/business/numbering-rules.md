# Nummernregeln

Nummernkreise existieren für:

- `OFFER`
- `ORDER`
- `INVOICE`
- `SERVICE_REPORT`

`NumberSequence` ist je Typ und Jahr eindeutig. `nextNumber` legt den Jahresdatensatz bei Bedarf
an, sperrt ihn mit PostgreSQL `FOR UPDATE`, erhöht `lastNumber` und formatiert Präfix, Jahr und
laufende Nummer.

Angebot, Auftrag und Leistungsnachweis erhalten ihre Nummer bei Erstellung. Eine Rechnung bleibt
als `DRAFT` ohne Nummer und erhält sie erst atomar bei Finalisierung. Dokumentnummernfelder sind
eindeutig.

Quellen: `prisma/schema.prisma`, `types/enums.ts`,
`lib/services/number-sequence.service.ts`, `prisma/seed/seed.ts`,
`tests/integration/race-condition.test.ts`.

Offen: im vorhandenen Code nicht eindeutig bestimmbar, wie Lücken nach abgebrochenen
Transaktionen fachlich bewertet werden; technisch rollt die Transaktion die Erhöhung zurück.
