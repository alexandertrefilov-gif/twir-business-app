# Rollen und Berechtigungen

Vorhandene Rollen:

- `ADMIN`
- `OFFICE`
- `PROJECT_MANAGER`
- `EMPLOYEE`
- `ACCOUNTING`

Die maßgebliche Laufzeitmatrix liegt in `lib/auth/permissions.ts`. Seiten nutzen
`hasPermission` für UI-Entscheidungen; Server Actions und Upload nutzen `requirePermission`.

Kritische Regeln:

- Rechnung finalisieren/stornieren: `ADMIN`, `ACCOUNTING`.
- Zahlungen verwalten: `ADMIN`, `ACCOUNTING`.
- Einstellungen lesen/ändern: nur `ADMIN`.
- Audit lesen: `ADMIN`, `ACCOUNTING`.
- Dokumente löschen: `ADMIN`, `OFFICE`.
- Leistungsnachweise erstellen: alle Managementrollen plus `EMPLOYEE`.
- Der Service beschränkt Bearbeitung/Löschung durch `EMPLOYEE` zusätzlich auf eigene Nachweise.

Authentifizierung: NextAuth Credentials, bcrypt, JWT-Session, Middleware-Guard. Der Login-Limiter
ist pro Prozess im Speicher und damit nicht clusterfest.

Quellen: `types/enums.ts`, `lib/auth/options.ts`, `permissions.ts`, `middleware.ts`,
`prisma/seed/seed.ts`, `tests/unit/permissions.test.ts`.

Offen: Die Datenbank enthält ebenfalls Permission-Datensätze; die Autorisierungsfunktion nutzt
zur Laufzeit jedoch die statische Matrix. Beide müssen bei Änderungen manuell synchron bleiben.
