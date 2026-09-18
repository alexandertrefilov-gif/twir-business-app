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

Innerhalb der Collaboration-Domain gibt es zusätzlich eine zweite Grenze
zwischen internem Bereich und Betreiberportal (beide teilen sich Cookie/
authScope, trennen sich über die `CollaborationRole`):
`requireCollaborationProjectAccess`/`requireCollaborationCabinetAccess`
(`lib/auth/collaboration-guards.ts`) prüfen nur Mitgliedschaft, absichtlich
rollenagnostisch — gemeinsam genutzte Funktionen wie `getGgaCabinetDetail`
oder die Dokumentdienste brauchen OPERATOR weiterhin (Dokumente filtern
stattdessen selbst nach `visibility`, siehe `collaboration-document.service.ts`).
Ausschließlich intern genutzte Lesezugriffe (Projektdetail, Aktivitäten,
GGA-Kennzahlen/-Arbeitsliste, Schrank-Audit-Historie) verwenden zusätzlich
`requireInternalCollaborationProjectAccess` bzw. `requireCollaborationCabinetAccess`
mit `internalCollaborationRoles`, die OPERATOR explizit ausschließen.

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
9. Der projektübergreifende interne GGA Control Tower (`getGgaControlTowerOverview`)
   schließt Projekte, in denen die Rolle des Nutzers `OPERATOR` ist, aus der
   Aggregation aus — der interne Control Tower ist keine Betreiberansicht.
10. `requireCollaborationProjectAccess`/`requireCollaborationCabinetAccess`
    (ohne `allowedRoles`) prüfen ausschließlich Mitgliedschaft, nie Rolle —
    das ist beabsichtigt für Funktionen, die OPERATOR gemeinsam mit internen
    Rollen nutzt (z. B. `getGgaCabinetDetail`, Dokumentdienste). Ein rein
    intern genutzter Lesezugriff MUSS stattdessen `requireInternalCollaboration-
    ProjectAccess` oder `requireCollaborationCabinetAccess(..., internalCollaborationRoles)`
    verwenden — sonst erhält OPERATOR über den direkten Aufruf interner Routen
    (z. B. `/collaboration/projects/[id]`) unbeabsichtigt Lesezugriff auf
    interne Projekt-/GGA-Daten (siehe GGA-04.1).
11. `editorRoles` (`collaboration-phase2.service.ts`) darf `OPERATOR` nie
    enthalten — jede interne Task-/Checklisten-/Blocker-/Freigabe-/Cabinet-
    Checklisten-/Dokument-Mutation läuft über diese Konstante. Der einzige
    legitime OPERATOR-Schreibpfad ist vollständig getrennt und verwendet
    ausschließlich `['OPERATOR']` (`decideGgaCabinetOperatorApproval`).
    `resolveCollaborationBlocker()` muss für Blocker mit UND ohne `stageId`
    dieselbe `editorRoles`-Prüfung erzwingen — COLLAB_VIEWER darf über den
    `stageId === null`-Zweig niemals Schreibrechte erhalten (siehe GGA-04.2).
12. Eine `getVisibleCollaboration*`-Funktion, die einen optionalen
    `projectId`-Filterparameter entgegennimmt (`collaboration-phase2.service.ts`),
    muss bei gesetztem Filter `requireCollaborationProjectAccess` auf GENAU
    diese `projectId` anwenden, bevor Daten zurückgegeben werden — ein
    ungeprüfter `projectId`-Parameter ist ein eigenständiges IDOR-Muster,
    unabhängig davon, ob dieselbe Funktion im ungefilterten Fall bereits
    korrekt auf die `projectIds` der eigenen Mitgliedschaften scoped. Gilt für
    alle fünf `getVisibleCollaboration*`-Funktionen mit `projectId`-Filter:
    `getVisibleCollaborationMemberships` (GGA-04.3), `getVisibleCollaborationTasks`,
    `getVisibleCollaborationChecklistItems`, `getVisibleCollaborationBlockers`
    (GGA-04.4) — Aufrufstellen: `/collaboration/team`, `/collaboration/tasks`,
    `/collaboration/checklists`, `/collaboration/blockers`, jeweils über
    `?project=<id>`. Alle fünf sind geschlossen; keine bekannte offene Instanz.
