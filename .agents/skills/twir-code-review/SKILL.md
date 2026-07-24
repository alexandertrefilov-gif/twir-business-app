---
name: twir-code-review
description: Reviewt TWIR-Diffs auf fachliche Fehler, Berechnung, Sicherheit, Datenintegrität, Status, Transaktionen, Fehlerbehandlung und Tests. Verwenden für konkrete Änderungen oder PRs; nicht für vollständige Projekt-Audits.
---

# Zweck

Regressions- und Produktionsrisiken in Änderungen priorisiert finden.

# Aktivierung

Bei Review, Diff, PR, Änderungsprüfung oder Freigabe verwenden.

# Nicht verwenden für

Gesamtaudit ohne konkreten Diff; dafür `twir-project-audit`.

# Projektbezug

Je nach Diff `app/`, `components/`, `lib/`, `types/`, `prisma/`, `tests/`; Regeln in `AGENTS.md` und zuständigen TWIR-Skills.

# Verbindlicher Ablauf

1. Diff und angrenzenden Produktionscode lesen.
2. Geschäftsverknüpfung, Geldwerte, Status und Rechte prüfen.
3. Datenverlust, Transaktion, Fehler und Doppelübermittlung bewerten.
4. Tests gegen tatsächliche Risiken abgleichen.
5. Nur belegte Findings ausgeben.

# Prüfkriterien

Findings nennen konkrete Datei/Position, Auswirkung und Reproduktion; unnötige Refactorings/Abhängigkeiten markieren; keine Stilpräferenzen als Fehler.

# Abbruchkriterien

Diff unvollständig; notwendiger Kontext fehlt; mutmaßlicher Befund ist nicht belegbar.

# Tests

Passende npm-Scripts nachvollziehen oder ausführen; fehlende Tests als Finding nennen.

# Ausgabeformat

Findings zuerst nach `kritisch`, `hoch`, `mittel`, `niedrig`; danach Fragen, Teststatus und Kurzfazit.
