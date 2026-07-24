---
name: twir-testing
description: Plant, ergänzt und führt TWIR-Tests mit der vorhandenen Vitest-Infrastruktur aus. Verwenden bei Teständerungen, Regressionen und Verifikation; nicht zum Einführen eines neuen Testframeworks.
---

# Zweck

Fachliche Regeln, Autorisierung, Berechnungen und Parallelität reproduzierbar absichern.

# Aktivierung

Bei Test, Vitest, Regression, Coverage, Mock, Race Condition oder Abnahmekriterium verwenden.

# Nicht verwenden für

Neue Testinfrastruktur oder Browser-E2E ohne ausdrückliche Freigabe.

# Projektbezug

- `vitest.config.ts`, `tests/setup.ts`.
- Unit: `tests/unit/**`.
- Integration: `tests/integration/race-condition.test.ts`.
- Scripts: `test`, `test:run`.
- Umgebung ist `node`; `TEST_DATABASE_URL` aktiviert den DB-Test.

# Verbindlicher Ablauf

1. Verhalten und Risiko aus Produktionscode ableiten.
2. Bestehende Testart und Mocks prüfen.
3. Erfolgs-, Fehler-, Berechtigungs- und Grenzfälle ergänzen.
4. Test isoliert und danach gesamte Suite ausführen.
5. Skips, Warnungen und nicht getestete Pfade berichten.

# Prüfkriterien

- Test scheitert vor dem Fix aus dem richtigen Grund.
- Keine produktive Datenbank verwenden.
- Tests prüfen beobachtbares Verhalten statt Implementierungsdetails.
- Autorisierung deckt 401 und 403 getrennt ab.
- Geldlogik enthält Rundungs- und Grenzfälle.

# Abbruchkriterien

- Integrationstest würde gegen unbekannte oder produktive DB laufen.
- Test benötigt neue Infrastruktur außerhalb des Auftrags.

# Tests

`npm run test:run`; Coverage ist konfiguriert, aber kein eigenes Coverage-Script vorhanden.

# Ausgabeformat

Testfälle, Befehl, bestanden/fehlgeschlagen/übersprungen und verbleibende Lücken angeben.
