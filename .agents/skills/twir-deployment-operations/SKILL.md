---
name: twir-deployment-operations
description: Prüft TWIR-Produktionsbuild, Umgebungsvariablen, Prisma-Migrationen, Datenbank, Secrets, Deploymentreihenfolge, Rollback und Health Checks. Verwenden für Betrieb/Deployment; keine Plattform erfinden.
---

# Zweck

Reproduzierbare, sichere Auslieferung anhand vorhandener Konfiguration vorbereiten.

# Aktivierung

Bei Deployment, Produktion, Build, Env, Migration, Secret, Rollback oder Health Check verwenden.

# Nicht verwenden für

Featureentwicklung oder Plattformkonfiguration, die im Projekt nicht existiert.

# Projektbezug

`package.json`, `package-lock.json`, `next.config.mjs`, `.env.example`, Prisma-Schema/Scripts, `middleware.ts`. Keine Docker-, CI-, Hosting- oder Health-Check-Datei vorhanden; kein Migrationsverzeichnis.

# Verbindlicher Ablauf

1. Zielumgebung und vorhandene Artefakte feststellen.
2. Build-/Startbefehle und Node-/Paketversion reproduzieren.
3. Secrets und Storage-/DB-Konfiguration prüfen.
4. Migration vor App-Rollout und Rollback planen.
5. Health-/Smoke-Checks und bekannte Risiken dokumentieren.

# Prüfkriterien

Lockdatei verwenden; keine `.env.local` deployen; `db:migrate:prod` statt `db:push`; Build muss grün sein; lokale Dateispeicherung nicht ungeprüft horizontal skalieren.

# Abbruchkriterien

Plattform unbekannt und konkrete Befehle wären erfunden; Build rot; Migration fehlt; Secrets unsicher; kein Rückfallplan.

# Tests

`npm run typecheck`, `npm run test:run`, `npm run lint`, `npm run build`; `db:generate` bei Schemaänderung.

# Ausgabeformat

Voraussetzungen, Reihenfolge, Befehle, Env-Kategorien, Smoke-Checks, Rollback und Blocker.
