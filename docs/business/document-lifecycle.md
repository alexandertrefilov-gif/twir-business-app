# Dokumentlebenszyklen

## Angebot

`DRAFT → SENT → ACCEPTED|REJECTED|EXPIRED`; nur `ACCEPTED → CONVERTED_TO_ORDER`.
Beim Versand wird der Kunde als Snapshot gespeichert. Nur Entwürfe sind editierbar.

## Auftrag

`OPEN → IN_PROGRESS → COMPLETED → INVOICED`; `OPEN` und `IN_PROGRESS` können
`CANCELLED` werden. Nur `OPEN` ist editierbar.

## Leistungsnachweis

`ServiceReport` besitzt keinen Status. Er kann erstellt, bearbeitet und hart gelöscht werden;
für `EMPLOYEE` gibt es im Service Eigentümerprüfungen. Eine Freigabe oder Versionierung ist
nicht implementiert.

## Rechnung

`DRAFT → FINALIZED → SENT`; daraus folgen Zahlung, Überfälligkeit oder Storno gemäß
`INVOICE_TRANSITIONS`. Finalisierung setzt Nummer sowie Kunden-/Firmensnapshot. Storno erzeugt
eine negative Gegenrechnung und markiert das Original `CANCELLED`.

## Dateiarchiv

`Document` besitzt `version`, `isArchived` und `deletedAt`; Registrierung und Soft Delete sind
implementiert. Eine vollständige fachliche Versionierungs-/Ersetzungslogik ist nicht erkennbar.

Quellen: `types/enums.ts`, `prisma/schema.prisma`, zugehörige Services.

Offen: im vorhandenen Code nicht eindeutig bestimmbar, wie Dokumentfreigabe und Ersetzung
außerhalb der Rechnungsstornierung vorgesehen sind.
