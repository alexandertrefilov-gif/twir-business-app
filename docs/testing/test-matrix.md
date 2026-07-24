# Testmatrix

| Bereich | Vorhandene Tests | Lücke |
|---|---|---|
| Rollenmatrix | `tests/unit/permissions.test.ts` | Objektbezogene Autorisierung |
| Uploadrechte | `upload-authorization.test.ts` | Dateiinhalt/Magic Bytes |
| Login-Callback | `callback-url.test.ts` | vollständiger Browserfluss |
| Rechnung | `invoice-business-rules.test.ts` | PDF und reale DB-Transaktion |
| Zahlung/Nummern | `payment-and-numbers.test.ts` | weitere Parallelitätsfälle |
| Nummern-Race | `integration/race-condition.test.ts` | läuft nur mit `TEST_DATABASE_URL` |
| UI/Accessibility | keine | kein Browser-/a11y-Framework vorhanden |
| PDF | keine | Rendering und Mehrseitigkeit |
| Server Actions | teilweise indirekt | konsistente ActionState-Fehler |

Vorhandene Befehle:

- `npm run typecheck`
- `npm run test:run`
- `npm run lint`
- `npm run build`

Vitest läuft in Node; Coverage via V8 ist konfiguriert, aber es gibt kein separates
`coverage`-Script. Keine neue Infrastruktur ohne ausdrücklichen Auftrag installieren.

Quelle: `package.json`, `vitest.config.ts`, `tests/**`.
