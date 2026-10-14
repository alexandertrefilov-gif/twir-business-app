# REQ-029 P5-6 – Closure (C-2 / D7)

- Datum: 2026-10-14
- Basis-Commit: `6508b27930c7947e240d26839c2478c9c4c035de` (Branch `feature/req029-frozen-baseline`; davor `dec7e1c6…` Baseline P3–P5-6 B-3, `51f3ff50…` Schema M1/M2, `8c1412d4…` Ausgangsbasis)
- Quellen: `REQ-029-P5-6-restbefund-audit` (Restbefund-Matrix), `REQ-029-P5-6-B3-abnahme-und-backlog`, D7-Läufe vom 2026-10-14.

## 1. Status der P5-6-Teile

| Teil | Inhalt | Status |
|---|---|---|
| A | Phase-A-Befunde (A1–A4, B1/B2, C3, D1/D2) | CLOSED (durch B-1/B-2/B-3, siehe Restbefund-Audit) |
| B-1 | Nummernkreis, Storno-Rechnungsdatum, Buchungsperioden | CLOSED, frozen, committed (Baseline) |
| B-2 | Fristenfamilie (Aufgaben, Projektfristen, Angebotsgültigkeit, Schrankakte) | CLOSED, frozen, committed (Baseline) |
| B-3 inkl. D2 | Kalendertag vs. Instant in Web, PDF, Archivjahr, Formular-Defaults | CLOSED, frozen, committed (Baseline) |
| C-1 | Von/Bis-Filter (N1/N2), Berliner Monatsfenster im Dashboard, ESLint-Escaping `InvoiceForm.tsx:256` | CLOSED, committed `6508b279…` (tsc, ESLint, 3726 Tests UTC und America/New_York, Build PASS) |
| C-2 / D7 | Legacy-Datumswerte (Datenprüfung) | siehe Abschnitt 2–4 |

## 2. C-2 / D7 – Scope und Methode

- Frage: Enthalten Kalenderfelder Werte mit Uhrzeit ≠ 00:00 UTC, insbesondere `T22:00Z`/`T23:00Z` (Altwerte von lokaler Berliner Mitternacht, die als Vortag gelesen würden)?
- Methode: rein lesend (`BEGIN READ ONLY` … `ROLLBACK`), fail-closed an `current_database()`, Original-DB `business_webapp` ausgeschlossen. Skripte: `run-c2-d7.sh`, `c2-d7-readonly.sql`, `run-c2-d7-detail.sh`, `c2-d7-detail.sql` (Ablage beim Owner, `~/Downloads/req029-c2/`).
- Geprüft: 30 Spalten (19 Spaltennamen) in 15 Tabellen: Rechnung (invoice_date, due_date, delivery_date, delivery_period_start/end), Angebot (offer_date, valid_until), Auftrag (order_date, start_date, end_date), Leistungsnachweis (report_date), Zahlung (payment_date), Mahnung (due_date), Kundenbestellung (order_date), Projekt-/Phasen-/Aufgabentermine, GGA (bestandsaufnahme_am, letzte_pruefung_am, pruefdatum).
- Datenbasis: ausschließlich `business_webapp_demo` (Seed- und QA-Daten). **Keine Staging- oder Produktivdaten geprüft.**

## 3. Ergebnis der Bestandsdatenprüfung (Demo-DB)

- 86 Werte, davon 72 auf 00:00 UTC, **1 auf T22:00Z**, 0 auf T23:00Z, 13 mit anderer Uhrzeit.
- Insgesamt 14 Zeilen mit Uhrzeit ≠ 00:00. Zuordnung:
  - **13 Zeilen** gehören zu den absichtlich angelegten B-3-Acceptance-Fixtures (IDs `b3-*-altwert*`, `created_at` 2026-10-13 21:12:31 = Seed-Zeitpunkt). Dazu zählt der einzige T22:00Z-Wert (`b3-inv-altwert`, `delivery_date` 2026-10-19 22:00:00). Sie sind synthetische Grenzfälle, keine echten Altdaten, und bleiben als Testfixtures unverändert.
  - **1 Zeile** (`orders`, `e8c78500-…`, `order_date` 2026-10-13 17:43:41.156 = `created_at`) wurde von der Anwendung selbst erzeugt: **Ursache** ist `convertOfferToOrder` (Angebot → Auftrag). Die Funktion setzte `orderDate` nicht, und die DB füllte das Kalenderfeld über `@default(now())` mit einem Zeitpunkt.
- Eingabeseitige Gegenprobe: `offerDate` hat dasselbe Schema-Default, wird aber in `createOffer`/`updateOffer` immer aus der Eingabe gesetzt (`data.offerDate`); in der Demo-DB sind alle Formular-Angebote 00:00Z. Weitere Schreibstellen mit `new Date()` auf Kalenderfeldern wurden per Quellsuche nicht gefunden.

## 4. Korrektur (innerhalb C-2)

- Ursache behoben, nicht der Datensatz: `lib/services/offer.service.ts` setzt bei der Umwandlung `orderDate: berlinDayStartUtc(new Date())` (Berliner Kalendertag als UTC-Mitternacht, gleiche Konvention wie B-1 für das Storno-Rechnungsdatum).
- Keine Schemaänderung, keine Migration (das Default `now()` bleibt bestehen und wird in dieser Schreibstelle überschrieben).
- Der bereits vorhandene Demo-Datensatz `e8c78500-…` wird nicht korrigiert: Sein UTC-Tag (13.10.) entspricht dem Berliner Tag (19:43 Uhr), die Anzeige ist richtig; er dient nur als Beleg.
- Regressionstest: `tests/unit/c2-offer-to-order-calendar-date.test.ts` (Mittag, 00:30 Berlin bei UTC-Vortag, Jahreswechsel, Winterzeit; TZ-unabhängig).
- Auswirkung ohne Korrektur: Anzeige-/Archivjahr-Abweichung um einen Tag nur bei Umwandlungen zwischen 00:00 und 02:00 (Sommer) bzw. 01:00 Uhr (Winter) Berliner Zeit; geringes Risiko, aber echter Schreibfehler.

## 5. Validierung

Der Commit mit dieser Datei entsteht nur, wenn das Gate-Skript `run-c2-gate.sh` vollständig PASS meldet: `tsc --noEmit`, ESLint (geänderte Dateien, `--max-warnings=0`), gezielte Tests unter UTC / Europe/Berlin / America/New_York, vollständige Unit-Suite unter UTC und America/New_York (Referenz C-1: 3726 bestanden, 0 fehlgeschlagen, 268 übersprungen; Abweichung = neue C-2-Tests), Production Build. Es werden keine DB-Schreibtests ausgeführt.

## 6. Einordnung der übrigen P5-6-Punkte

| Punkt | Einstufung | Begründung |
|---|---|---|
| D7 für Staging/Produktion | DEFERRED (vor Pilot/P8) | Dieselbe Read-only-Prüfung ist vom Owner mit `EXPECT_DB=<Zieldatenbank>` auszuführen. Treffer auf 22:00Z/23:00Z erfordern ein eigenes Entscheidungs-Gate. Blockiert den REQ-029-Code-Abschluss nicht. |
| Dashboard-Begrüßung nach Prozessstunde | BACKLOG (LOW) | reine UI, kein Rechnungswesen |
| `ExternalConfirmationDialog` (`confirmedAt` Instant vs. Tag) | BACKLOG (LOW) | Semantik-Entscheidung nötig |
| `invoice-query.service` Monatsstart, `dunning.getOverdueInvoices` | DEAD/UNWIRED (LOW) | ohne produktiven Aufrufer, Aufräumen nach REQ-029 |
| DATEV-Datumslogik (F6) | OUT OF SCOPE (Gate X-1) | nicht verdrahtet, vor Aktivierung zu schließen |
| F2 Angebots-/Rechnungsrundung | DEFERRED (Owner-Entscheidung vor P7) | nicht P5-6 |
| P5-3 Phase C (PostgreSQL-Konkurrenztests) | DEFERRED | nicht P5-6 |
| Console-Befunde (Decimal-Warnung, HMR, 404/401), Decimal-Overfetch `invoices/new`, Auckland-Fixture, Favicon, Seed-Artefakte | BACKLOG (LOW) | keine Auth-Lücke, nicht release-blockierend (Restbefund-Audit) |
| Gesamt-Browser-/Rollen-/PDF-Regressionslauf | DEFERRED (vor P6/P7 bzw. WF-Integration) | Querschnittslauf, nicht P5-6-spezifisch |
| Mischdokumente `DECISIONS.md`/`BACKLOG.md` (Collaboration-Hunks) | DEFERRED (Doku-Gate) | nicht hunkweise angefasst; dieses Dokument ersetzt sie als P5-6-Nachweis |

## 7. Closure-Entscheidung

**P5-6: CLOSED** für den Code- und Demo-Datenstand. Begründung: Alle in der Restbefund-Matrix als OPEN geführten Funktionsbefunde (N1, N2, Dashboard-Monatsstart) sind durch C-1 geschlossen, D7 ist für die Demo-DB geprüft und die dabei gefundene Schreibursache ist behoben. Die verbleibenden Punkte sind LOW, DEAD, OUT OF SCOPE oder DEFERRED mit eigenen Gates und halten P5-6 nicht offen. Die Produktions-/Staging-D7-Prüfung bleibt eine Vorbedingung vor Pilot/P8, keine Voraussetzung für den REQ-029-Abschluss.
