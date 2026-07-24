---
name: twir-pdf-document-quality
description: Prüft vorhandene React-PDF-Vorlagen für Angebot, Leistungsnachweis und Mahnung auf fachliche Werte, Layout und Archivierung. Verwenden bei PDF-Ausgabe; Rechnungs- oder Auftrags-PDF nicht als vorhanden voraussetzen.
---

# Zweck

PDF-Werte und Darstellung mit Datenbank und UI konsistent halten.

# Aktivierung

Bei PDF, Druck, Dokumentvorlage, Seitenumbruch, Kopf-/Fußzeile oder Dateiname verwenden.

# Nicht verwenden für

Datei-Uploads oder Dokumentstatus ohne PDF-Bezug.

# Projektbezug

`@react-pdf/renderer`; `lib/pdf-templates/offer.template.tsx`, `service-report.template.tsx`, `dunning.template.tsx`; `Document`/`document.service.ts`. Kein Rechnungs- oder Auftrags-PDF-Template und keine erkennbare Angebots-/Leistungs-PDF-Aufrufintegration.

# Verbindlicher Ablauf

1. Tatsächlich vorhandene Vorlage und Aufrufer bestimmen.
2. Datenvertrag gegen Prisma/Service prüfen.
3. Empfänger, Nummer, Datum, Positionen und Summen vergleichen.
4. lange Texte, Mehrseitigkeit, Umbruch und Dateiname testen.
5. Speicherung, Version und Dokumentregistrierung nachvollziehen.

# Prüfkriterien

Keine erfundenen Vorlagen; PDF nutzt Snapshots bei historischen Dokumenten; Werte entsprechen Serverberechnung; Build typisiert Render-Rückgabe korrekt.

# Abbruchkriterien

Vorlage hat keinen bestätigten Datenpfad; DB/UI/PDF widersprechen sich; finalisierte Werte stammen aus aktuellen Stammdaten.

# Tests

`npm run typecheck`, `npm run test:run`, `npm run build`; bei Renderingänderung konkrete PDF-Sichtung dokumentieren.

# Ausgabeformat

Vorlage, Datenquelle, Pflichtinhalt, Layoutfälle, Archivierung, Testergebnis und fehlende Implementierung.
