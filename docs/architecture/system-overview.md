# Systemübersicht

## Architektur

TWIR ist eine Next.js-15-App-Router-Anwendung. Seiten unter `app/(dashboard)` sind überwiegend
Server Components; interaktive Formulare und Dialoge unter `components/` sind Client Components.
Schreibzugriffe laufen über Server Actions oder Route Handler, danach über `lib/services/` zu
Prisma/PostgreSQL.

## Schichten

| Bereich | Pfad | Verantwortung |
|---|---|---|
| Routing/UI | `app/`, `components/` | Seiten, Formulare, Tabellen, Interaktion |
| Servergrenzen | `app/(dashboard)/**/actions.ts`, `app/api/` | Auth, Validierung, Fehlertransport |
| Fachlogik | `lib/services/` | Regeln, Transaktionen, Audit |
| Validierung | `lib/validators/` | Zod und Berechnungshelfer |
| Daten | `prisma/schema.prisma`, `lib/db/prisma.ts` | PostgreSQL-Modell und Client |
| Sicherheit | `lib/auth/`, `lib/security/`, `middleware.ts` | Login, Rechte, Uploadschutz |

## Integrationen

- Lokale Dokumentablage ist über `STORAGE_LOCAL_PATH` implementiert; S3 ist nur kommentierte
  Zukunftsoption.
- PDF-Vorlagen existieren für Angebot, Leistungsnachweis und Mahnung.
- DATEV-CSV-Erzeugung ist als reine Exportfunktion vorhanden.
- E-Rechnung ist nur typseitig vorbereitet.
- E-Mail-Versand ist nicht implementiert.
- Eine konkrete Deploymentplattform und CI-Konfiguration sind nicht vorhanden.

## Externes Dokumentenarchiv

Das Notfallarchiv verwendet eine vom Business-Code getrennte Storage-Schnittstelle. Die erste
Implementierung (`LocalFilesystemArchiveStorage`) schreibt atomar in einen in den
Firmeneinstellungen konfigurierten Serverpfad. Damit kann bei lokalem Betrieb auch ein durch den
OneDrive-Desktop-Client synchronisierter Ordner verwendet werden.

Diese Variante ist nicht für das flüchtige Dateisystem von Vercel Functions geeignet und kann von
einem Cloud-Server nicht direkt auf einen Mac schreiben. Für Cloud-Betrieb muss ein weiterer
Storage-Adapter (z. B. Microsoft Graph/SharePoint oder S3-kompatibler Objektspeicher) ergänzt
werden; die Dokument-Lifecycle-Logik bleibt dabei unverändert.

Offen: im vorhandenen Code nicht eindeutig bestimmbar, wie Produktionshosting,
persistenter Dateispeicher und geplante Jobs betrieben werden.
