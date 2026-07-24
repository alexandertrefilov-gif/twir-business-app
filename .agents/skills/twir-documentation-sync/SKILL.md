---
name: twir-documentation-sync
description: Gleicht TWIR-Dokumentation mit Code, Schema, Rollen, Status, Umgebungsvariablen, Tests und Build ab. Verwenden bei Dokumentationsänderungen oder nach Architekturänderungen; keine unbestätigten Funktionen dokumentieren.
---

# Zweck

Dokumentation als belegte Beschreibung des aktuellen Codes erhalten.

# Aktivierung

Bei README, docs, Architektur, Prozess, Datenmodell, Rollen, Status, Env oder Testmatrix verwenden.

# Nicht verwenden für

Produktcodeänderungen ohne Dokumentationsauswirkung.

# Projektbezug

`docs/**`, `AGENTS.md`, `package.json`, `.env.example`, Prisma, `types/enums.ts`, `lib/auth/permissions.ts`, Services und Tests.

# Verbindlicher Ablauf

1. Behauptung zur maßgeblichen Codequelle verfolgen.
2. Pfad, Symbol und Statuswert exakt übernehmen.
3. Implementiert, teilweise und nicht vorhanden trennen.
4. offene Punkte ausdrücklich markieren.
5. Links/Pfade und Befehle validieren.

# Prüfkriterien

Keine Projekt-/Bestellmodelle erfinden; E-Mail als nicht implementiert; PDF nur für vorhandene Templates; Befehle nur aus `package.json`.

# Abbruchkriterien

Fakt ist im Code nicht eindeutig; Dokumentation würde Zukunftsplanung als Ist-Zustand darstellen.

# Tests

Pfad-/Symbolsuche, Skill-Validierung und passende npm-Prüfungen; reine Markdownänderung benötigt keinen erfundenen Test.

# Ausgabeformat

Synchronisierte Aussagen, Quellen, offene Punkte und nicht dokumentierte Zukunftsfunktionen.
