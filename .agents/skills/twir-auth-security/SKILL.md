---
name: twir-auth-security
description: Prüft NextAuth-Credentials, JWT-Sessions, Middleware, serverseitige Autorisierung, Secrets, Uploads und geschützte Dokumentzugriffe. Verwenden bei Login, Sessions, Seiten, APIs oder Server Actions; nicht für fachliche Rollenentwürfe.
---

# Zweck

Authentifizierung und Zugriffsschutz an jeder Servergrenze sicherstellen.

# Aktivierung

Bei Login, NextAuth, Middleware, Session, Secret, API, Server Action, Upload oder Download verwenden.

# Nicht verwenden für

Rollenmatrix-Änderungen ohne Auth-Fluss; dafür `twir-role-permissions`.

# Projektbezug

`lib/auth/options.ts`, `permissions.ts`, `callback-url.ts`, `middleware.ts`, `app/api/**`, Dashboard-Actions, `rate-limiter.ts`, `.env.example`.

# Verbindlicher Ablauf

1. Öffentliche und geschützte Route bestimmen.
2. Session, Rolle und Objektzugriff serverseitig verfolgen.
3. Eingaben, IDs, Datei- und Fehlerpfade prüfen.
4. Client darf nur Darstellung steuern.
5. 401/403 und Negativfälle testen.

# Prüfkriterien

- Middleware schützt außer Login/Auth/static alle Routen.
- Schreibgrenzen verwenden `requirePermission`.
- Secrets bleiben ohne `NEXT_PUBLIC_`.
- Downloads laufen über Auth-API, nicht statisch.
- Manipulierte Entity-IDs dürfen keine unzulässige Objektverknüpfung erzeugen.

# Abbruchkriterien

Nur ausgeblendeter Button schützt Aktion; Admin-Endpunkt ist offen; Secret gelangt zum Client; fremde Objekte sind per ID erreichbar.

# Tests

`tests/unit/permissions.test.ts`, `upload-authorization.test.ts`, `callback-url.test.ts`; `npm run test:run`.

# Ausgabeformat

Angriffsfläche, bestehender Schutz, Befund mit Pfad, Auswirkung, Test und Restrisiko.
