---
name: twir-invoice-compliance
description: Prüft Rechnungsentwurf, Finalisierung, Pflichtdaten, Snapshots, Nummerierung, Storno und Zahlungsfolgen. Verwenden bei Rechnungen oder Rechnungsdokumenten; ersetzt keine Rechtsberatung und nicht für allgemeine Angebote.
---

# Zweck

Die im Code hinterlegten Rechnungsregeln und die Unveränderlichkeit nach Finalisierung schützen.

# Aktivierung

Bei `Invoice`, Finalisierung, Storno, Rechnungstyp, Pflichtfeld, Leistungsdatum, Steuer oder Rechnungs-PDF verwenden.

# Nicht verwenden für

Reine Zahlungsverarbeitung ohne Änderung an Rechnungswerten; dafür `twir-calculation-integrity`.

# Projektbezug

- Modell/Enums: `prisma/schema.prisma`, `types/enums.ts`.
- Logik: `lib/services/invoice.service.ts`, `invoice-query.service.ts`.
- Validierung/Actions: `lib/validators/invoice.schema.ts`, `app/(dashboard)/invoices/actions.ts`.
- Tests: `tests/unit/invoice-business-rules.test.ts`.
- Kein Rechnungs-PDF-Template vorhanden; E-Rechnung liegt nur als Typvorbereitung vor.

# Verbindlicher Ablauf

1. Status, Typ und Sperrregeln lesen.
2. Pflichtdaten und Kunden-/Firmensnapshot vor Finalisierung prüfen.
3. Atomare Nummernvergabe und Audit kontrollieren.
4. Storno als Gegenrechnung und Originalverknüpfung prüfen.
5. UI, Datenbank und vorhandene Dokumentausgabe vergleichen.

# Prüfkriterien

- Nur `DRAFT` wird bearbeitet/finalisiert.
- Nummer entsteht erst bei Finalisierung.
- Snapshots werden bei Finalisierung gesetzt.
- Storno erzeugt negative Positionen und sperrt das Original.
- Behauptete PDF- oder E-Rechnungsfunktionen müssen tatsächlich aufgerufen werden.

# Abbruchkriterien

- Finalisierte Werte würden direkt editiert.
- Pflichtdaten oder Snapshot-Schutz würden umgangen.
- Rechtliche Bewertung wird ohne belastbare Vorgabe verlangt.

# Tests

`npm run test:run`, `npm run typecheck`, bei Dokumentbezug zusätzlich `npm run build`.

# Ausgabeformat

Status/Typ, Pflichtdaten, Snapshot, Nummer, Storno, Tests und offene Compliance-Punkte getrennt berichten.
