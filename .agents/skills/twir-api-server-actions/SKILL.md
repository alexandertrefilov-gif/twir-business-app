---
name: twir-api-server-actions
description: Prüft TWIR-API-Routen und Server Actions auf Validierung, Authentifizierung, Autorisierung, Fehlerformate, Transaktionen, Idempotenz und Serialisierung. Verwenden bei `app/api` oder `actions.ts`; nicht für reine Serviceabfragen.
---

# Zweck

Servergrenzen sicher, konsistent und wiederholbar machen.

# Aktivierung

Bei API, Route Handler, Server Action, FormData, HTTP-Status, Mutation oder Idempotenz verwenden.

# Nicht verwenden für

Interne Servicefunktion ohne extern aufrufbare Grenze.

# Projektbezug

`app/api/auth`, `app/api/upload`, `app/api/documents/[id]/download`; `app/(dashboard)/**/actions.ts`; Zod in `lib/validators`; Rechte/Fehler in `lib/auth/permissions.ts`.

# Verbindlicher Ablauf

1. Eingabe und Aufrufer identifizieren.
2. Auth vor Verarbeitung prüfen.
3. Zod-/ID-/Enum-Validierung verfolgen.
4. Service/Transaktion und Doppelübermittlung bewerten.
5. Fehler in stabiles Action- oder HTTP-Format übersetzen.

# Prüfkriterien

Keine Rohfehler/Stacks; 401/403/404/409/422 korrekt; kritische Mehrschritte transaktional; keine Geschäftslogik nur im Client.

# Abbruchkriterien

Unvalidierte externe Eingabe erreicht Prisma; fehlende Berechtigung; Teilzustand bei Fehler; Idempotenzanforderung unklar.

# Tests

`npm run test:run`, `npm run typecheck`; Erfolgs- und Negativtests für Grenze ergänzen.

# Ausgabeformat

Endpunkt/Action, Eingabe, Auth, Validierung, Transaktion, Fehlervertrag, Tests und Risiko.
