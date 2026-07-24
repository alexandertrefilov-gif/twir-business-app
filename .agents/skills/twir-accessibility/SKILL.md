---
name: twir-accessibility
description: Prüft TWIR-Komponenten technisch auf Semantik, Labels, Tastatur, Fokus, Dialoge, Tabellen, Fehlermeldungen, Kontrast und Screenreader-Verständlichkeit. Verwenden bei UI- und Accessibility-Arbeiten; nicht für rein visuelles Styling.
---

# Zweck

Bedienbarkeit ohne Maus und mit assistiven Technologien sichern.

# Aktivierung

Bei a11y, WCAG, Tastatur, Fokus, Label, Dialog, Tabelle, Kontrast oder Screenreader verwenden.

# Nicht verwenden für

Allgemeines Layout ohne Barrierefreiheitsbezug.

# Projektbezug

Formulare/Tabellen unter `components/**`, `ConfirmDialog`, Radix-Dialoge, Sidebar/Drawer, Login und Seiten unter `app/`.

# Verbindlicher Ablauf

1. Semantische Elemente und zugänglichen Namen prüfen.
2. Label-/Fehlerbeziehungen und Fokusreihenfolge verfolgen.
3. Tastaturbedienung und Fokusfang von Dialog/Drawer prüfen.
4. Tabellenköpfe, Live-Status und Screenreadertexte prüfen.
5. Kontrast anhand vorhandener Tokens bewerten.

# Prüfkriterien

Buttons haben Namen; Inputs besitzen Labels; Fehler sind textlich; Dialogfokus kehrt zurück; Tabellen nutzen `th`; Farbe ist nicht einziger Informationsträger.

# Abbruchkriterien

Fix würde Verhalten ohne getestete Fokusführung ändern; Kontrastwert ist nicht messbar; neue UI-Bibliothek wäre erforderlich.

# Tests

`npm run lint`, `npm run typecheck`; Tastatur- und Screenreaderprüfung manuell dokumentieren, da kein a11y-Testtool vorhanden ist.

# Ausgabeformat

Befunde nach Auswirkung, Element/Pfad, Reproduktion, erwartetes Verhalten und Testart.
