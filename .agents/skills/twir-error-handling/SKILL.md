---
name: twir-error-handling
description: Prüft technische, Validierungs-, Berechtigungs-, Not-found-, Konflikt- und Geschäftsregelfehler über Services, Server Actions, APIs und Formulare. Verwenden bei Fehlerpfaden; nicht für Logging allein.
---

# Zweck

Fehler verständlich anzeigen, technisch sicher behandeln und nicht verschweigen.

# Aktivierung

Bei Error, Validation, 401/403/404/409/422/500, ActionState, Toast oder Formularfehler verwenden.

# Nicht verwenden für

Audit-Nachvollziehbarkeit ohne Fehlerfluss.

# Projektbezug

Fehlerklassen/`toHttpError` in `lib/auth/permissions.ts`; ActionState-Muster in Dashboard-Actions; Zod-Validatoren; Formularkomponenten; API-Routen.

# Verbindlicher Ablauf

1. Fehlerquelle und erwartete Kategorie bestimmen.
2. Service → Action/API → UI verfolgen.
3. technische Details serverseitig halten.
4. Formulardaten, Pendingzustand und Erfolgsmeldung prüfen.
5. jeden Fehlerpfad testen.

# Prüfkriterien

Kein falscher Erfolg; keine stillen Catch-Blöcke außer begründeter Cleanup; Nutzertext deutsch und handlungsorientiert; Stacktrace bleibt serverseitig.

# Abbruchkriterien

Fehler wird pauschal verschluckt; Status/ActionState ist widersprüchlich; Eingabe geht unnötig verloren.

# Tests

`npm run test:run`, `npm run typecheck`; Negativtests für bekannte Fehlerklassen ergänzen.

# Ausgabeformat

Fehlerklasse, Ursprung, Transport, Nutzertext, Logging, Test und verbleibende Lücke.
