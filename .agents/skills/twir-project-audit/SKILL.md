---
name: twir-project-audit
description: Erstellt eine read-only Bestandsaufnahme des gesamten TWIR-Projekts mit belegten Architektur-, Prozess-, Sicherheits-, Qualitäts- und Buildbefunden. Verwenden für Audits und Zustandsberichte; nicht zum Implementieren von Fixes.
---

# Zweck

Den Ist-Zustand evidenzbasiert und ohne Änderungen bewerten.

# Aktivierung

Bei Projektanalyse, Audit, technischem Zustand, Sicherheitsprüfung oder Release-Einschätzung verwenden.

# Nicht verwenden für

Implementierungsaufträge oder eng begrenzte Code Reviews eines Diffs.

# Projektbezug

`package.json`, `app/`, `components/`, `lib/`, `types/`, `prisma/`, `tests/`, Konfigurationsdateien und `.agents/skills/`.

# Verbindlicher Ablauf

1. Anweisungen, Scripts, Struktur und Status lesen.
2. Routing, Datenfluss, Modelle, Rollen und Statusmaschinen zuordnen.
3. Auth, APIs, Server Actions, Dateiablage und Audit prüfen.
4. Nur sichere, vorhandene Prüfskripte ausführen.
5. Bestätigte Befunde von Vermutungen trennen.

# Prüfkriterien

- Jeder kritische Befund nennt Datei und Codeposition.
- Keine nicht ausgeführte Prüfung als erfolgreich melden.
- Keine Architektur oder Funktion aus Kommentaren allein ableiten.
- Abweichungen zwischen Dokumentation, Code und Laufzeit kennzeichnen.

# Abbruchkriterien

- Prüfung würde Daten verändern oder externe Systeme beeinflussen.
- Benötigte Umgebung fehlt; dann Begrenzung dokumentieren.

# Tests

Nur passende vorhandene Scripts: `npm run typecheck`, `npm run test:run`, `npm run lint`, `npm run build`.

# Ausgabeformat

Kurzüberblick, bestätigte Befunde nach Schweregrad, Vermutungen, Prüfresultate und priorisierte Maßnahmen.
