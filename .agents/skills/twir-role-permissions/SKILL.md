---
name: twir-role-permissions
description: Prüft und ändert ausschließlich die vorhandene TWIR-Rollen- und Berechtigungsmatrix für Ressourcen und kritische Aktionen. Verwenden bei Rollen, Rechten oder Sichtbarkeit; keine neuen Rollen ohne ausdrückliche Fachfreigabe.
---

# Zweck

UI-Sichtbarkeit und serverseitige Rechte konsistent halten.

# Aktivierung

Bei ADMIN, OFFICE, PROJECT_MANAGER, EMPLOYEE, ACCOUNTING oder create/read/update/delete/finalize/cancel/export verwenden.

# Nicht verwenden für

Loginmechanik oder allgemeine Objektzugriffe ohne Rollenänderung.

# Projektbezug

Rollen in `types/enums.ts` und Prisma; Matrix/`Resource`/`Action` in `lib/auth/permissions.ts`; Navigation in `components/layout/Sidebar.tsx`; Tests in `tests/unit/permissions.test.ts`.

# Verbindlicher Ablauf

1. Vorhandene Rolle und Ressource bestätigen.
2. Matrix, Action, Server Action/API und UI gemeinsam prüfen.
3. Kritische Aktion separat negativ testen.
4. Seed-Berechtigungen auf Abweichung zur statischen Matrix prüfen.
5. Auditbedarf bestimmen.

# Prüfkriterien

Rechnungsfinalisierung/-storno und Zahlungen: ADMIN/ACCOUNTING; Einstellungen: ADMIN; Dokumentlöschung: ADMIN/OFFICE; keine Rechte allein per UI.

# Abbruchkriterien

Neue Rolle ohne Modell-/Fachfreigabe; statische und DB-Matrix widersprechen sich; kritische Aktion ohne serverseitige Prüfung.

# Tests

`npm run test:run`; Matrix-Tests für erlaubte und verbotene Rollen ergänzen.

# Ausgabeformat

Rolle × Ressource × Aktion, Serverprüfung, UI-Auswirkung, Tests und Soll-Lücken tabellarisch angeben.
