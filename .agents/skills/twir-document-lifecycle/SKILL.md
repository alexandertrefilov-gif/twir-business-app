---
name: twir-document-lifecycle
description: Prüft Status, erlaubte Übergänge, Sperren, Snapshots, Storno und Archivierung von TWIR-Angeboten, Aufträgen, Leistungsnachweisen, Rechnungen und Dokumenten. Verwenden bei Lebenszyklusänderungen; nicht für reine Berechnungen.
---

# Zweck

Dokumentzustände serverseitig konsistent und historische Werte unveränderlich halten.

# Aktivierung

Bei Statuswechsel, Finalisierung, Versand, Annahme, Ablehnung, Abschluss, Storno, Ersatz oder Versionierung verwenden.

# Nicht verwenden für

Reine Geldlogik oder Datei-Upload-Sicherheit ohne Statusbezug.

# Projektbezug

`types/enums.ts`, Modelle `Offer`, `Order`, `Invoice`, `Document`; Services `offer.service.ts`, `order.service.ts`, `invoice.service.ts`, `document.service.ts`. `ServiceReport` hat kein Statusfeld. Kein Bestellungsmodell.

# Verbindlicher Ablauf

1. Prisma- und TypeScript-Statuswerte abgleichen.
2. Übergangsmatrix und serverseitigen Service prüfen.
3. UI-Aktion nur als Oberfläche, nie als alleinigen Schutz bewerten.
4. Editierbarkeit, Snapshot, Audit, PDF- und Archivfolgen prüfen.
5. Terminalstatus und Storno-/Ersatzbeziehungen testen.

# Prüfkriterien

- Offer: `DRAFT → SENT → ACCEPTED|REJECTED|EXPIRED → CONVERTED_TO_ORDER`.
- Order: `OPEN → IN_PROGRESS → COMPLETED → INVOICED`, mit erlaubtem `CANCELLED`.
- Invoice: `DRAFT → FINALIZED → SENT/…`; Sperre über `INVOICE_LOCKED_STATUSES`.
- Dokumente werden soft gelöscht; explizite Versionierungslogik ist nur teilweise vorhanden.

# Abbruchkriterien

Statusmodell unklar; DB und UI widersprechen sich; finalisierte Werte würden änderbar; Schutz nur im Client.

# Tests

`npm run test:run`, `npm run typecheck`; Übergangs-Negativtests ergänzen.

# Ausgabeformat

Dokumenttyp, Ist-Status, Übergang, serverseitiger Schutz, Historisierung und offene Lücken nennen.
