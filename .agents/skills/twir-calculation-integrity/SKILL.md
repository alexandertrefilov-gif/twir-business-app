---
name: twir-calculation-integrity
description: Sichert Mengen-, Preis-, Steuer-, Netto-, Brutto-, Zahlungs- und Rundungsberechnungen in TWIR. Verwenden bei Geldbeträgen, Positionen, Summen, Zahlungen oder PDF-Werten; nicht für status- oder layoutreine Änderungen.
---

# Zweck

Gleiche fachliche Werte in UI, Validierung, Service, Datenbank und Dokument sicherstellen.

# Aktivierung

Bei `quantity`, `unitPrice`, `taxRate`, Netto, Steuer, Brutto, Zahlung, Restbetrag oder Rundung verwenden.

# Nicht verwenden für

Reine Status-, Auth- oder Textänderungen ohne Zahlenlogik.

# Projektbezug

- Zentral: `lib/validators/offer.schema.ts`.
- Wiederverwendung: `order.schema.ts`, `invoice.schema.ts`.
- Leistungen: `service-report.schema.ts`.
- Services: `offer.service.ts`, `order.service.ts`, `invoice.service.ts`, `payment.service.ts`.
- UI-Vorschau: Formulare unter `components/{offers,orders,invoices,service-reports,payments}`.
- Tests: `tests/unit/invoice-business-rules.test.ts`, `payment-and-numbers.test.ts`.

# Verbindlicher Ablauf

1. Rechenquelle und Rundungszeitpunkt identifizieren.
2. UI-Vorschau gegen serverseitige Berechnung vergleichen.
3. Position, Steuergruppe und Gesamtsumme separat prüfen.
4. Überzahlung, negative Werte und Grenzrundung testen.
5. Gespeicherte `Decimal`-Werte und PDF-Ausgabe abgleichen.

# Prüfkriterien

- Serverwerte sind maßgeblich.
- Positionen werden auf Cent gerundet, bevor Summen persistiert werden.
- `totalGross = totalNet + totalTax`.
- Zahlungen überschreiten den offenen Betrag nicht.
- Keine neue parallele Berechnungsfunktion ohne begründeten Bedarf.

# Abbruchkriterien

- Rundungsregel ist fachlich unklar.
- UI und Service verwenden widersprüchliche Algorithmen.
- Änderung könnte finalisierte Rechnungswerte rückwirkend verändern.

# Tests

`npm run test:run` und `npm run typecheck`; konkrete Grenzfalltests ergänzen.

# Ausgabeformat

Formel, Rundungsebene, betroffene Pfade, geprüfte Grenzfälle und Abweichungen dokumentieren.
