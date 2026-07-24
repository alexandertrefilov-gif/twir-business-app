---
name: twir-safe-feature-development
description: Führt kleine, autorisierte TWIR-Funktionsänderungen entlang der bestehenden Architektur sicher durch. Verwenden bei Feature- oder Bugfix-Implementierung; nicht für reine Analyse, Migration oder Deployment.
---

# Zweck

Änderungen mit minimalem Scope, vorhandenen Schichten und überprüfbarem Verhalten umsetzen.

# Aktivierung

Bei „implementieren“, „ändern“, „ergänzen“, Bugfix oder bestehende Funktion erweitern verwenden.

# Nicht verwenden für

Read-only Audit, reine Dokumentation oder eigenständige Datenbankmigration.

# Projektbezug

UI in `app/`/`components/`, Server Actions in `app/(dashboard)/**/actions.ts`, Logik in `lib/services/`, Validierung in `lib/validators/`, Daten in Prisma.

# Verbindlicher Ablauf

1. Betroffene Dateien und Datenfluss vollständig lesen.
2. Bestehende Komponenten, Services, Validatoren und Fehlerklassen wiederverwenden.
3. Berechtigung und Audit für schreibende Aktionen bestimmen.
4. Kleinsten kohärenten Patch erstellen.
5. Tests ergänzen, Diff prüfen und vorhandene Gates ausführen.

# Prüfkriterien

- Keine Geschäftslogik ausschließlich im Client.
- Keine Parallelarchitektur oder unnötige Abhängigkeit.
- Servereingaben mit Zod oder gleichwertig validieren.
- Mehrschrittänderungen transaktional ausführen.
- Fehlgeschlagene Prüfungen offen berichten.

# Abbruchkriterien

- Scope oder fachliche Regel ist unklar und würde Verhalten wesentlich ändern.
- Fix erfordert nicht autorisierte Datenmigration oder externe Aktion.
- Bestehende Nutzeränderungen würden überschrieben.

# Tests

Mindestens passende Unit-Tests und `npm run typecheck`; abschließend `test:run`, `lint`, `build` soweit angemessen.

# Ausgabeformat

Ergebnis zuerst, dann Dateien, Verhalten, Befehle, Ergebnisse und offene Risiken.
