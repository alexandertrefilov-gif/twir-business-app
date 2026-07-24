---
name: twir-ui-ux
description: Prüft und verbessert die bestehende TWIR-Business-Oberfläche, Formulare, Tabellen, Filter, Statusanzeigen und Dialoge konsistent mit Tailwind/Radix. Verwenden für UI/UX; keine neue Komponentenbibliothek einführen.
---

# Zweck

Konsistente, verständliche und responsive Arbeitsabläufe erhalten.

# Aktivierung

Bei Formular, Tabelle, Suche, Filter, Statusbadge, Dialog, Lade-/Leerzustand oder Responsive Design verwenden.

# Nicht verwenden für

Reine Barrierefreiheitsprüfung; dafür `twir-accessibility`.

# Projektbezug

`app/globals.css`, `tailwind.config.ts`, `components/shared`, domänenspezifische Komponenten, `DashboardShell`/`Sidebar`, Radix-Abhängigkeiten.

# Verbindlicher Ablauf

1. Bestehendes Komponenten- und Tokenmuster suchen.
2. Desktop, Tablet und Smartphone betrachten.
3. Fehler-, Pending-, Leer- und Bestätigungszustände prüfen.
4. Kritische Aktionen gegen Doppelübermittlung schützen.
5. Deutsche Bezeichnungen und Buttonhierarchie abgleichen.

# Prüfkriterien

Vorhandene Komponenten wiederverwenden; Tabellen mobil scrollbar; Formulare responsiv; kritische Lösch-/Stornoaktionen bestätigt; keine Geschäftslogik in Anzeige verschieben.

# Abbruchkriterien

Parallelbibliothek nötig ohne Freigabe; rein kosmetischer Umbau vergrößert Scope; Verhalten ist fachlich unklar.

# Tests

`npm run lint`, `npm run typecheck`, passende Komponententests sofern vorhanden; visuelle Prüfung als manuell kennzeichnen.

# Ausgabeformat

Betroffener Ablauf, Viewports/Zustände, wiederverwendete Komponenten, Tests und manuelle Prüfpunkte.
