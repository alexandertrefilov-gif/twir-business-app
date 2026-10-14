# REQ-029 P5-3 Phase C – PostgreSQL-Konkurrenznachweis Mahnwesen

**Ergebnis: P5-3 PHASE C — PASS** (14.10.2026)

| | |
|---|---|
| Getestete Code-Basis | `fix/production-readiness` @ `ee2316c1238176a8b871573a44b408b9cdd602b8` (Production-Code unverändert) |
| Getestete Datenbank | ausschließlich `twir_g6_test`, `localhost:5432` (PostgreSQL 16.13, Sitzungszone Europe/Berlin); `current_database()` und `inet_server_port()` vor dem Lauf und im Test geprüft |
| Schutz | URL-Guards vor dem Prisma-Import (Host, Port, Name, verbotene URL-Parameter, `business_webapp` ausgeschlossen), `P53_CONFIRM_DB=twir_g6_test`, schreibende Zugriffe nur auf eigene Testzeilen (Präfix `P53-DB <Lauf-ID>`), Quelltext-Guard S0 |
| Identitätsprüfung | READ ONLY: 12 Migrationen, letzte `20261008121000_invoice_buyer_reference`, keine wartenden Sitzungen |
| Läufe | UTC, Europe/Berlin, America/New_York: je **46/46 bestanden** |
| Kein Eingriff in | Produktion, Staging, Demo-DB, `business_webapp` |

## Szenarien (C1–C9, Z)
- **C1** Stufenfolge 1→2→3, Snapshot-Audit exakt, Stufe 4 gesperrt, Statuswechsel nur ab Stufe 2.
- **C2** 19 Ablehnungsfälle (Entwurf, nicht versendet, fehlender Versandnachweis, Systemakteur, Toleranz +61 s, Storno/Korrektur, PAID, CANCELLED, Restbetrag 0, Zahlungsziel, Berliner Tagesgrenze, Mahngebühr mit 3 Nachkommastellen); es wird nichts geschrieben.
- **C3** Basis = Brutto − Σ aktive Zahlungen, auch bei bewusst falschem `paidAmount`-Cache.
- **C4a–f** Mahnung × Zahlung in jeder Reihenfolge (Voll-/Teilzahlung), deterministisch verschränkt über Zeilensperre (`SELECT … FOR UPDATE`) und `pg_stat_activity`/`pg_blocking_pids`: B startet erst, nachdem A nachweislich allein wartet.
- **C5a–c** Parallele Anlage derselben Stufe: genau eine Mahnung und ein CREATE-Audit, Verlierer erhält `LEVEL_MISMATCH`; 4 gleichzeitige Anlagen × 3 Runden: je Runde genau eine.
- **C6a/b** Anlage Stufe 2 gegen „versendet“ Stufe 1 in beiden Reihenfolgen.
- **C7a–c** Parallele „versendet“-Markierung: genau ein `sentAt`, genau ein Audit; 4 gleichzeitige × 3 Runden; PAID/CANCELLED verweigert.
- **C8** Spätere Zahlung verändert weder Mahnung noch Snapshot; neue Mahnung bekommt neuen Stand.
- **C9a/b** Reale Statuswechsel FINALIZED→SENT: Differenz `sentAt` ↔ Audit `createdAt` 0–1 ms (Gate ≤ 60 000 ms); Grenzwerte ±60 000 ms mahnbar, ±60 001 ms gesperrt.
- **Z** Nummernkreis 421 → 477 = 56 nummerierte Testrechnungen; Fremdbestand (Rechnungen, Mahnungen, Zahlungen, bestehende Audits) und Stammdaten unverändert; alle Testrechnungen geparkt (Fälligkeit 2099-01-01).

## Invarianten (bewiesen am realen DB-Endzustand)
1. Pro Rechnung und Stufe genau eine Mahnung, genau ein CREATE-Audit, höchstens ein Dunning-Statusaudit.
2. Pro Mahnung genau ein `sentAt` und ein Versand-Audit, auch bei paralleler Markierung.
3. Offener Betrag/Snapshot = Brutto − Σ aktive Zahlungszeilen; nachträgliche Zahlungen ändern bestehende Snapshots nicht.
4. Mahnung nur nach dokumentiertem, nachvollziehbarem Versand; keine unzulässigen Statuszustände (PAID/CANCELLED nie gemahnt, Zahlung setzt OVERDUE nicht zurück).
5. Konkurrierende Schreibvorgänge erzeugen keinen Zustand mit doppelter Mahnung, doppeltem Versandnachweis oder falschem Open Amount.

## Befund während der Abnahme (Testinfrastruktur, kein Produktfehler)
Beim zweiten Lauf (Berlin) schlug nur Test Z fehl: Der Fremd-Audit-Fingerabdruck zeigte 233 zusätzliche Einträge. Ursache: Frühere Läufe schreiben `sent_at = now()` in der DB-Sitzungszone Europe/Berlin; die daraus abgeleiteten Audit-Zeitstempel liegen in UTC-Lesart bis zu 2 h in der Zukunft und verschoben die Audit-Obergrenze des Folgelaufs. Der Test wurde gehärtet (`v2`): Audits der P53-DB-Testdaten (Rechnungen, Mahnungen, Zahlungen mit Präfix) zählen nicht zum Fremdbestand und nicht zur Obergrenze; alle übrigen Audits werden weiter per Fingerabdruck auf Veränderung geprüft. Danach liefen alle drei Zeitzonen 46/46 grün. Original: `p5-3-dunning-db.test.ts.v1-orig` (nicht im Repo, in `~/Downloads/p5-3-db`).

## Belege
`docs/evidence/p5-3-phase-c/`: Identitätsprüfung, Vitest-Logs der drei Läufe (ohne Verbindungsdaten), Testquelltext (als `.txt`, damit er nicht in die Unit-Suite gelangt), Konfiguration, Identitätsskript, README.
Aufruf (nur nach Owner-Freigabe, nur `twir_g6_test`): siehe README im Evidence-Ordner.

## Restrisiken
- Testzeilen (Präfix `P53-DB`) verbleiben geparkt in `twir_g6_test` (kein Löschen im Gate).
- Das Skript läuft nicht in CI; SIGKILL während eines Laufs könnte Zeilen ungeparkt lassen (Identitätsprüfung zeigt Reste).
