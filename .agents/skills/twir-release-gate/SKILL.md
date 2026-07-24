---
name: twir-release-gate
description: Entscheidet anhand der vorhandenen TWIR-Prüfbefehle und kritischen Risiken über Release-Freigabe oder Stopp. Verwenden vor Merge, Release oder Deployment; nicht während früher Entwurfsarbeit.
---

# Zweck

Eine nachvollziehbare Go/No-Go-Entscheidung ohne kaschierte Fehler treffen.

# Aktivierung

Bei Release, Produktionsfreigabe, Merge-Gate, Go/No-Go oder Deployment-Vorbereitung verwenden.

# Nicht verwenden für

Lokale Featureentwicklung ohne Freigabeentscheidung.

# Projektbezug

`package.json`, `vitest.config.ts`, `next.config.mjs`, `tsconfig.json`, Prisma-Schema und Migrationslage.

# Verbindlicher Ablauf

1. Diff und Scope prüfen.
2. `npm run typecheck` ausführen.
3. `npm run test:run` ausführen.
4. `npm run lint` ausführen.
5. `npm run build` ausführen.
6. Migrationen, Secrets, bekannte Sicherheitslücken und Rollback prüfen.

# Prüfkriterien

- Alle Pflichtbefehle mit Exitcode 0.
- Kritische Auth-, Datenverlust-, Rechnungs- oder Nummernrisiken blockieren.
- Übersprungene DB-Integrationstests werden sichtbar benannt.
- Produktionsmigrationen sind versioniert; aktuell fehlt `prisma/migrations/`.

# Abbruchkriterien

- Typecheck, Tests, Lint oder Build schlagen fehl.
- Destruktive Migration ohne Backup/Rollback.
- Kritische Abhängigkeitsschwachstelle ohne akzeptierte Ausnahme.

# Tests

Die vier oben genannten npm-Scripts; `db:generate` bei Prisma-Änderungen.

# Ausgabeformat

`GO` oder `NO-GO`, danach Befehle, Exitcodes, Blocker, Ausnahmen und Restrisiken.
