REQ-029 P5-3 Phase C – PostgreSQL-Integrationstest Mahnwesen (twir_g6_test)
===========================================================================

STATUS: SCHRITT 1 (nur Testdesign). NICHTS davon wurde gegen eine Datenbank ausgeführt.
Schritt 2 (identity-check.mjs und Testlauf) darf erst nach ausdrücklicher Freigabe durch Alexander im Chat laufen.

Dateien
  p5-3-dunning-db.test.ts   Testfälle C1–C9 und Z
  identity-check.mjs        Identitätsprüfung, nur lesend (READ ONLY-Transaktion)
  vitest.p53.config.mjs     Vitest-Konfiguration ohne setupFiles (echter Prisma-Singleton), Alias '@' -> P53_REPO
  README-P53-DB.txt         diese Datei

Harte Guards (drei Ebenen, alle VOR dem Import des Prisma-Clients bzw. vor der ersten Abfrage)
  1. DATABASE_URL: Protokoll postgres(ql), Host localhost oder 127.0.0.1, Port 5432, Datenbankname genau twir_g6_test;
     URL-Parameter host, hostaddr, port, dbname, service, options sind verboten.
  2. P53_CONFIRM_DB muss exakt 'twir_g6_test' sein.
  3. 'business_webapp' ist in URL und Bestätigungsvariable ausdrücklich ausgeschlossen (fail-closed).
  4. Nach der Verbindung (beforeAll): current_database() = twir_g6_test und inet_server_port() = 5432, sonst Abbruch.
  Zusätzlich: keine fremden Sitzungen mit Lock-Wartezustand, Policy-Toleranz = 60000 ms (wird nicht verändert).

Aufruf (NUR nach Freigabe von Schritt 2; <URL> setzt der Owner selbst ein, keine Zugangsdaten in Chat/Dateien)
  export P53_DIR="$HOME/Downloads/p5-3-db"
  export P53_REPO="$HOME/Downloads/req029-iso/business-app-req029-iso"
  export P53_CONFIRM_DB=twir_g6_test
  export DATABASE_URL='<URL auf localhost:5432/twir_g6_test>'
  cd "$P53_REPO" && node "$P53_DIR/identity-check.mjs"
  # danach, getrennt freizugeben:
  cd "$P53_REPO" && for TZ in UTC Europe/Berlin America/New_York; do TZ=$TZ npx vitest run --config "$P53_DIR/vitest.p53.config.mjs"; done

Schreibschutz (Härtung)
  - Alle schreibenden Zugriffe des Tests liegen im Block OWN-WRITE (ownSet / ownAudit / park). Vor jedem Write wird geprüft:
    ID in der Own-ID-Menge UND in der DB Präfix "P53-DB <Lauf-ID>" (intro_text) bzw. Stornorechnung einer solchen eigenen Rechnung;
    das Eigentumsprädikat steht zusätzlich im WHERE des Statements, es muss genau 1 Zeile betroffen sein, sonst Abbruch (fail closed).
  - Test S0 scannt den eigenen Quelltext: Schreib-SQL/ORM außerhalb des Blocks lässt den Lauf scheitern.
  - Stornorechnungen werden sofort nach der Erzeugung (cancelOwn, try/finally) in die Own-ID-Menge aufgenommen.
  - Parken: afterEach und best-effort afterAll (try/finally, Disconnect immer). SIGKILL bleibt Restrisiko ->
    vor Schritt 2 ist der Identitäts-/Restebefund (identity-check.mjs, 'Vorhandene P53-DB-Reste') Pflicht.
  - C9a: fachlicher Assert nur <= 60000 ms (D9); 6000 ms ist ein geloggter Richtwert, kein Gate.

Eigenschaften
  - Testzeilen tragen das Präfix "P53-DB <Lauf-ID>" (intro_text, Zahlungsreferenz); keine Wiederverwendung der P5-2-Daten.
  - Fachliche Stichtage liegen in 1995/1996 (injiziertes now), Versandnachweise entstehen in Echtzeit (C9).
  - Nebenläufigkeit: Test hält Zeilensperre, weist über pg_stat_activity/pg_blocking_pids Wartende nach, startet B erst danach.
  - Nach jedem Test werden eigene Rechnungen geparkt (Fälligkeit 2099-01-01). Kein Löschen, keine Migration, kein D7.
  - Z weist Fremdbestand (Rechnungen, Mahnungen, Zahlungen, vorhandene Audits) und Stammdaten als unverändert nach.
