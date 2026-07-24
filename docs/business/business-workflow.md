# Geschäftsprozess

## Implementierter Ablauf

1. `Customer` und optionale `Contact`-Datensätze verwalten.
2. `Offer` direkt für einen Kunden anlegen und Positionen kalkulieren.
3. Angebot `SENT`, anschließend `ACCEPTED`, `REJECTED` oder `EXPIRED` setzen.
4. Angenommenes Angebot über `convertOfferToOrder` in genau einen `Order` überführen;
   alternativ Auftrag direkt anlegen.
5. `ServiceReport` mit Positionen zu einem Auftrag erfassen.
6. `Invoice` als Entwurf für Kunde und optional Auftrag anlegen.
7. Rechnung finalisieren, nummerieren und sperren.
8. Zahlung erfassen; Rechnungsstatus wird aus Zahlungsstand abgeleitet.
9. Überfällige Rechnungen können Mahnstufen erhalten.

## Abweichung vom genannten Sollablauf

- Kein `Project`-Modell oder Projekt-UI.
- Kein eigenes Modell „Kundenbestellung“.
- „Leistung“ und „Leistungsnachweis“ sind gemeinsam `ServiceReport`/`ServiceReportItem`.
- Rechnung ist nicht zwingend an einen Auftrag gebunden.
- „Abschluss“ ist kein separates Modell; terminale Statuswerte bilden ihn ab.

Quellen: `prisma/schema.prisma`, `types/enums.ts`, `lib/services/offer.service.ts`,
`order.service.ts`, `service-report.service.ts`, `invoice.service.ts`, `payment.service.ts`.

Offen: im vorhandenen Code nicht eindeutig bestimmbar, ob Projekt und Kundenbestellung künftig
eigene Entitäten werden sollen.
