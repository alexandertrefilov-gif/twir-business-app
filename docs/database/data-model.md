# Datenmodell

## Identität und Rechte

`User → Role → RolePermission → Permission`; Nutzer besitzen Status und Soft-Delete-Zeitpunkt.

## Fachliche Kernrelationen

- `Customer` besitzt Kontakte, Angebote, Aufträge, Rechnungen und Dokumente.
- `Offer` besitzt Positionen und optional genau einen resultierenden Auftrag.
- `Order` besitzt Positionen, Leistungsnachweise, Rechnungen und Dokumente.
- `ServiceReport` besitzt Positionen und Dokumente.
- `Invoice` besitzt Positionen, Zahlungen, Mahnungen und Dokumente.
- `Document` kann optional mehreren Fachobjekttypen zugeordnet sein.

## Integritätsmuster

- UUID-Primärschlüssel.
- Eindeutige Dokumentnummern.
- Indizes auf Status, Datum, Beziehungen und Soft-Delete-Feldern.
- Cascade bei abhängigen Positionen/Rollenrechten.
- Soft Delete bei Kunde, Angebot, Auftrag, Zahlung und Dokument.
- Hard Delete bei Leistungsnachweisen im aktuellen Service.
- Historische Kunden-/Firmendaten als JSON-Snapshots.

Es existiert kein `prisma/migrations/`-Verzeichnis. Produktionsmigrationen sind daher derzeit
nicht als versionierte Historie im Projekt enthalten.

Quelle: `prisma/schema.prisma`.

Offen: im vorhandenen Code nicht eindeutig bestimmbar, welche produktiven Migrationen außerhalb
des Repositorys bereits ausgeführt wurden.
