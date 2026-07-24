---
name: twir-logging-audit
description: Prüft technische Logs und fachliche Audit-Einträge für kritische TWIR-Aktionen auf Vollständigkeit und Geheimnisschutz. Verwenden bei Änderungsverlauf, Login, Status, Zahlung, Storno oder Löschung; nicht für reine UI-Meldungen.
---

# Zweck

Wer, wann, was geändert hat nachvollziehbar halten, ohne Geheimnisse zu protokollieren.

# Aktivierung

Bei AuditLog, console, Logging, Historie, Login, Finalisierung, Zahlung oder Löschung verwenden.

# Nicht verwenden für

Allgemeine Fehlerdarstellung ohne Log-/Auditbedarf.

# Projektbezug

`AuditLog`/`AuditAction` in Prisma und `types/enums.ts`; `lib/services/audit.service.ts`, `audit-query.service.ts`; Audit-Seiten; Audit-Aufrufe in Services/Auth.

# Verbindlicher Ablauf

1. Aktion als technisches Log oder fachliches Audit klassifizieren.
2. Benutzer, Zeitpunkt, Entity und vorher/nachher bestimmen.
3. Transaktionskopplung zur Mutation prüfen.
4. Geheimnisse und sensible Vollwerte ausschließen.
5. Anzeige und Zugriff auf Auditdaten prüfen.

# Prüfkriterien

Kritische Status-, Finalisierungs-, Storno-, Zahlungs-, Dokument- und Einstellungsaktionen sind auditierbar; Passwörter/Tokens nie loggen; Audit nur ADMIN/ACCOUNTING lesbar.

# Abbruchkriterien

Audit außerhalb kritischer Transaktion kann falschen Verlauf erzeugen; Secret würde geloggt; Identität fehlt.

# Tests

`npm run test:run`, `npm run typecheck`; Mutation und Audit gemeinsam mocken/prüfen.

# Ausgabeformat

Aktion, Entity, Actor, gespeicherte Felder, Transaktionsstatus, Zugriff und Risiko.
