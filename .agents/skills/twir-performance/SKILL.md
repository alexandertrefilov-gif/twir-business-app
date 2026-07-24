---
name: twir-performance
description: Untersucht TWIR auf belegbare langsame Prisma-Abfragen, N+1, fehlende Pagination, unnötige Client-Komponenten, Re-Renders und Bundlelast. Verwenden bei Performanceproblemen; keine Optimierung ohne Evidenz.
---

# Zweck

Mess- oder technisch nachvollziehbare Engpässe gezielt beheben.

# Aktivierung

Bei langsam, Performance, N+1, Pagination, Bundle, Render oder große Tabelle verwenden.

# Nicht verwenden für

Vorsorgliche Mikrooptimierung ohne Problemnachweis.

# Projektbezug

Listenservices mit Pagination (`customer`, `offer`, `order`, `invoice`, `payment`, `document`, `audit`), Server Components in `app/`, Client Components in `components/`, Next-Build.

# Verbindlicher Ablauf

1. Symptom und Messpunkt festlegen.
2. Queryanzahl/-menge oder Renderursache bestimmen.
3. vorhandene Pagination/Selects prüfen.
4. kleinste belegte Optimierung umsetzen.
5. Vorher/Nachher vergleichen und Regression testen.

# Prüfkriterien

Keine unbeschränkten Listen; Relationen gezielt select/include; keine unnötige Client-Grenze; gleiche Daten nicht mehrfach laden.

# Abbruchkriterien

Kein reproduzierbares oder statisch klares Problem; Optimierung ändert Fachverhalten; Messumgebung ungeeignet.

# Tests

`npm run typecheck`, `npm run test:run`, `npm run build`; Messmethode separat dokumentieren.

# Ausgabeformat

Evidenz, Ursache, betroffener Pfad, Änderung, Vorher/Nachher und Restrisiko.
