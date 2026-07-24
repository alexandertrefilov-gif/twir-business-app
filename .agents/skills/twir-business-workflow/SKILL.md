---
name: twir-business-workflow
description: Prüft Änderungen am fachlichen TWIR-Ablauf von Kunde über Angebot, Auftrag und Leistungsnachweis bis Rechnung und Zahlung. Verwenden bei Änderungen an fachlichen Übergängen oder Verknüpfungen; nicht für reine UI- oder Infrastrukturarbeiten.
---

# Zweck

Den tatsächlich implementierten Geschäftsablauf und seine Verknüpfungen bewahren.

# Aktivierung

Bei Kunde, Angebot, Auftrag, Leistung, Leistungsnachweis, Rechnung, Zahlung, Mahnung oder Konvertierung verwenden.

# Nicht verwenden für

Reine Styling-, Deployment- oder isolierte Auth-Arbeiten ohne Prozessbezug.

# Projektbezug

- Modelle: `Customer`, `Offer`, `Order`, `ServiceReport`, `Invoice`, `Payment` in `prisma/schema.prisma`.
- Services: `lib/services/{customer,offer,order,service-report,invoice,payment}.service.ts`.
- Übergänge: `types/enums.ts`.
- Actions und Seiten: `app/(dashboard)/**`.
- Kein `Project`- und kein Kundenbestellungsmodell; `ServiceReport` vereint Leistung und Nachweis.

# Verbindlicher Ablauf

1. Betroffene Modelle, Servicefunktionen, Actions und UI lesen.
2. Quelle und Ziel jeder Beziehung sowie Statusvorbedingungen bestimmen.
3. Direkte Auftragserstellung und `convertOfferToOrder` getrennt berücksichtigen.
4. Servervalidierung, Transaktion, Audit und Berechtigung prüfen.
5. Passende Tests ausführen und Abweichungen vom dokumentierten Ablauf benennen.

# Prüfkriterien

- Angebot wird nur aus `ACCEPTED` konvertiert.
- Auftrag und Positionen übernehmen bestätigte Angebotswerte.
- Rechnungen referenzieren optional einen Auftrag, benötigen aber einen Kunden.
- Zahlungen ändern nur Zahlungsstand und Rechnungsstatus.
- Keine nicht vorhandenen Projekt- oder Bestellschritte voraussetzen.

# Abbruchkriterien

- Geschäftsbegriff oder gewünschter Übergang ist im Code nicht eindeutig.
- Änderung würde ein neues Modell oder einen neuen Status ohne ausdrückliche Freigabe erfordern.
- Schutz läge nur in der UI.

# Tests

`npm run test:run`, `npm run typecheck`; bei umfassenden Änderungen zusätzlich `npm run lint` und `npm run build`.

# Ausgabeformat

Betroffene Prozessschritte, bestätigter Ist-Ablauf, Änderungen, Tests und offene fachliche Punkte nennen.
