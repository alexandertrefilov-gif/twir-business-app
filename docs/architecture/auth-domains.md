# Auth-Domänen und Routing-Migration

## Sicherheitsmodell

- `/` ist ein öffentliches Portal ohne Datenzugriff.
- Die interne Anwendung verwendet den Cookie `twir-internal-session` und den Auth-Endpunkt
  `/api/intern/auth`.
- Das Collaboration-Portal verwendet den Cookie `twir-collaboration-session` und den Auth-Endpunkt
  `/api/collaboration/auth`.
- Middleware und Server-Layouts prüfen zusätzlich den JWT-Claim `authScope`.
- Collaboration-Zugriff setzt mindestens eine aktive Mitgliedschaft in einem aktiven, nicht
  gelöschten `CollaborationProject` voraus.
- Projektabfragen werden über `requireCollaborationProjectAccess` auf `userId + projectId`
  eingeschränkt und verwenden explizite Projektionen.

## Übergang der internen Routen

Die bestehenden Fachrouten (`/offers`, `/orders`, `/services`, `/invoices` usw.) bleiben zunächst
erhalten. Sie akzeptieren ausschließlich die interne Session. Ein Big-Bang-Verschieben würde alle
Links, Redirects, Server Actions, Revalidierungen und Tests gleichzeitig betreffen.

Die weitere Migration erfolgt fachbereichsweise:

1. Für einen Fachbereich `/intern/...` als kanonische Route ergänzen und interne Links sowie
   `revalidatePath`/`redirect` umstellen.
2. Zugehörige APIs unter `/api/intern/...` bereitstellen und Aufrufer umstellen.
3. Alte Route nach erfolgreichem Negativ- und Regressionstest kontrolliert auf die kanonische Route
   weiterleiten.
4. Legacy-Auth-Endpunkt `/api/auth` erst entfernen, wenn keine Clients und Sitzungen ihn mehr nutzen.
5. Nach vollständiger Migration die alten fachlichen Root-Routen aus dem Matcher entfernen.

Der interne Einstieg ist bereits `/intern/dashboard`; `/login` leitet kontrolliert nach
`/intern/login` weiter.

## Noch nicht freigegeben

Das Collaboration-Portal gibt ausschließlich projektbezogene Stammdaten, Phasenstatus,
Fortschritt, Ampel und nächste Aktion sowie die Membership-Rolle aus. Dokumente, Kunden-,
Auftrags-, Rechnungs-, Zahlungs-, Audit- und Mitarbeiterdaten sind nicht an das Portal angebunden.
Jede spätere Freigabe benötigt eine eigene explizite Projektion und einen projektbezogenen
Zugriffstest.
