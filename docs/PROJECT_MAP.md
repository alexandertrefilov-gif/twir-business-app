# PROJECT_MAP — Architektur-Beziehungen und Invarianten

Kein Datei-Index (dafür `docs/PROJECT_INDEX.md`). Diese Datei zeigt, wie Module
voneinander abhängen und welche Invarianten dabei nicht gebrochen werden dürfen.
Nur lesen, wenn eine Aufgabe Beziehungen zwischen Modulen betrifft.

## Kette 1: Geschäftsprozess (interne Domain)

```
Customer
  └─→ Offer (optional)
        └─→ CustomerPurchaseOrder (optional, an Offer)
        └─→ Order (direkt ODER aus akzeptiertem Offer via convertOfferToOrder)
              └─→ ServiceReport (mit ServiceReportItem-Positionen)
                    └─→ Invoice (an Order ODER direkt an Customer)
                          └─→ Payment (mehrere je Invoice)
                          └─→ DunningNotice (bei Zahlungsverzug)
```

`Project` (interner kaufmännischer Kontext) ist ein optionaler Querverweis auf
Offer/Order, kein eigener Kettenschritt. `Accounting` hängt lesend von
Invoice/Payment ab und hat kein eigenes Modell.

## Kette 2: GGA-/Collaboration-Domäne (unabhängig von Kette 1)

```
CollaborationProject
  └─→ CollaborationMembership (Rolle je Nutzer)
  └─→ CollaborationProjectStage (Konzept/Planung/Umsetzung/Abnahme/Abschluss)
        └─→ CollaborationTask       ("Maßnahmen" der GGA-Schränke sind Tasks,
                                       kein eigenes Fachobjekt)
        └─→ CollaborationChecklistItem
        └─→ CollaborationBlocker    ("Mangel" in der GGA-Prüfung ist ein Blocker)
        └─→ CollaborationApproval   (interne Freigabe)
  └─→ GgaCabinet
        └─→ CollaborationDocument   (Fotos/Protokolle, Sichtbarkeit INTERNAL/EXTERNAL)
        └─→ Operator-Freigabe       (separat von CollaborationApproval, gate: erst
                                       nach bestandener interner Prüfung anforderbar)
        └─→ Schrankakte-PDF         (live generiert, nicht persistiert)
```

Kette 1 und Kette 2 teilen sich ausschließlich: `NEXTAUTH_SECRET`,
`LocalFilesystemArchiveStorage`-Klasse (unterschiedliche Basisverzeichnisse),
Audit-Infrastruktur. Kein gemeinsames Fachobjekt, kein Datenaustausch.

## Auth-Domains

```
proxy.ts (Matcher: alles außer api/auth, api/intern/auth, api/collaboration/auth,
          api/health$, _next/static, _next/image, favicon.ico, public)
  ├─ /intern/**, /api/intern/**         → authOptions (intern)
  └─ /collaboration/**, /api/collaboration/** → collaborationAuthOptions
```

Trennung erfolgt über getrennte Cookie-Namen UND `authScope`-JWT-Claim (doppelt
abgesichert). `/api/health` ist die einzige Ausnahme ohne Auth — exakter
Pfad-Match, keine Präfix-Ausnahme.

## Storage

```
STORAGE_LOCAL_PATH (Volume A, env-gesteuert)
  ├─ allgemeine Uploads (Root)
  ├─ Firmenlogo (Unterordner "logos")
  └─ Collaboration-/GGA-Dokumente (Unterordner "collaboration")

company_settings.document_archive_path (Volume B, DB-konfiguriert)
  ├─ Kundenbestellung        (nur wenn document_archive_enabled=true)
  ├─ externe Bestätigungen   (nur wenn document_archive_enabled=true)
  └─ Dokumentenarchiv-Explorer (immer, wenn Feature aktiv)
```

Beide Basisverzeichnisse nutzen dieselbe Storage-Klasse, sind aber NICHT
dasselbe Volume — getrennt zu mounten/sichern (siehe Deployment).

## PDF

```
lib/pdf-templates/**  (React-Komponenten, @react-pdf/renderer)
  ← Company-Logo (sharp: trim() + Buffer, schmale API-Fläche)
  ← PDF-Service je Dokumenttyp
  ← API-Route je Dokumenttyp (zustandslos, kein Storage-Write)
```

Mahnung ist die einzige Ausnahme: Template + Renderfunktion existieren, aber
keine live Route — nicht automatisch als "implementiert" behandeln.

## Audit

Jede kritische Statusänderung schreibt einen Audit-Eintrag über
`buildAuditLogCreate`, in derselben Prisma-Transaktion wie die fachliche
Mutation (nicht als separater, potenziell inkonsistenter Schritt).

## Permissions

```
Server Action / Route Handler → requirePermission(Resource, Action)
Server-Component-Seite         → requirePagePermission(Resource, Action)
                                   → next/navigation forbidden()/unauthorized()
```

UI-Sichtbarkeit ist nie die einzige Kontrolle — jede schreibende Aktion prüft
serverseitig erneut, unabhängig davon, ob der Button überhaupt sichtbar war.

## Deployment

```
next.config.mjs (output:'standalone', proxyClientMaxBodySize, authInterrupts)
  → .next/standalone/server.js
    → deploy/Dockerfile (runner-Stage: Node 24, openssl, non-root, kein CLI)
      → docker-compose.production.yml (app + db + caddy)
        → Volume A (uploads) + Volume B (archive) + postgres-data
```

`prisma` (CLI) ist devDependency, `@prisma/client` (Runtime) ist reguläre
Abhängigkeit — Migrationen laufen vom Deploy-Host, nicht aus dem schlanken
Runtime-Image heraus.

## Invarianten (dürfen durch keine Änderung gebrochen werden)

1. Nummernvergabe (Offer/Order/ServiceReport/Invoice) ist atomar und läuft in
   derselben Transaktion wie Finalisierung/Versand — nie vorab, nie außerhalb.
2. `Invoice` ist nach Finalisierung gesperrt (`INVOICE_LOCKED_STATUSES`) —
   Änderungen nur über Storno/Gegenrechnung, nie durch Überschreiben.
3. Interne und Collaboration-Session dürfen sich nie gegenseitig Zugriff
   gewähren — geprüft über Cookie-Name UND `authScope`, nicht nur eines von beiden.
4. Ex-Schutz-Bewertung (`GgaCabinet`) hat drei Zustände und wird nie
   automatisch von „Noch nicht bewertet“ auf „Nicht erforderlich“ gesetzt.
5. Betreiberfreigabe ist von interner Freigabe fachlich getrennt — technische
   Prüfung abgeschlossen bedeutet nicht Betreiberfreigabe erteilt.
6. `STORAGE_LOCAL_PATH` und `document_archive_path` sind unterschiedliche
   Basisverzeichnisse — ein Deployment, das nur eines mountet, verliert
   beim anderen Schreibpfad Daten (kein Fehler, aber Datenverlust).
7. `TEST_DELETE_ENABLED` muss in Produktion `"0"`/ungesetzt sein — zusätzlich
   durch `NODE_ENV`-Gate abgesichert, nicht nur durch die Env-Variable.
8. Downloads/Dateizugriffe laufen ausschließlich über geprüfte App-Routen —
   nie direkt aus einem Storage-Pfad über einen statischen File-Server.
