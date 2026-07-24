# Berechnungsregeln

- Position netto: `quantity × unitPrice`, auf zwei Dezimalstellen gerundet.
- Steuer: gerundeter Nettobetrag × Steuersatz, auf Cent gerundet.
- Brutto: gerundetes Netto + gerundete Steuer.
- Angebotssummen und Steuergruppen: `lib/validators/offer.schema.ts`.
- Auftrag und Rechnung re-exportieren diese Berechnung in ihren Validatoren.
- Leistungsnachweis berechnet nur Netto in `service-report.schema.ts`.
- Zahlungssumme entsteht per Datenbankaggregation nicht gelöschter Zahlungen.
- Überzahlungen werden serverseitig verhindert.
- Prisma speichert Geld in `Decimal(12,2)`, Mengen überwiegend in `Decimal(10,3)`.

UI-Formulare enthalten Vorschau-Berechnungen; serverseitige Berechnung bleibt maßgeblich.
`invoice.service.ts` besitzt zusätzlich eine eigene Summenfunktion. Diese Duplizierung muss bei
Änderungen gegen die zentrale Angebotsberechnung geprüft werden.

Quellen: `lib/validators/*.schema.ts`, `lib/services/{offer,order,invoice,payment}.service.ts`.

Offen: im vorhandenen Code nicht eindeutig bestimmbar, ob eine spezifische kaufmännische
Rundungsnorm über die implementierte Cent-Rundung hinaus vorgeschrieben ist.
