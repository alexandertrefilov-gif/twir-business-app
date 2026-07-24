# Isolation der Next.js-Build-Artefakte

Stand: 24. Juli 2026
Branch-Kontext: `fix/next15-production-middleware`, ausgehend von `794f803`

## Beobachtetes Fehlerbild

Bei einem Produktions-Smoke-Test lieferte eine geschützte Route HTTP 500. Der Server meldete
einen `EvalError: Code generation from strings disallowed for this context` in
`.next/server/middleware.js:985`, statt den nicht angemeldeten Benutzer zur Anmeldung
weiterzuleiten.

## Bestätigte Ursache

`next dev` und `next build` beziehungsweise `next start` verwendeten gleichzeitig das
Buildverzeichnis `.next`. Dadurch konnten Entwicklungs- und Produktionsprozesse die dort
liegenden Artefakte gegenseitig verändern.

Nach dem Entfernen von `.next`, einer Installation mit der Lockdatei und einem sauberen
Produktionsbuild war der Fehler nicht mehr reproduzierbar. Das neu erzeugte Middleware-Bundle
enthielt keine Verwendung von `eval`, `new Function` oder WebAssembly-Codegenerierung und keine
Prisma- oder Bcrypt-Imports. Sein Aufbau passte außerdem nicht zur zuvor gemeldeten Zeile 985.
`middleware.ts` importiert weiterhin ausschließlich `next-auth/middleware` und `next/server`.
Damit war der Authentifizierungs- oder Middleware-Quellcode nicht die Ursache des beobachteten
Fehlers.

## Technische Umsetzung

- Die Next.js-Konfiguration setzt `distDir` nur für
  `PHASE_DEVELOPMENT_SERVER` auf `.next-dev`.
- `next build` und `next start` verwenden weiterhin das Next.js-Standardverzeichnis `.next`.
- `.next-dev` ist in `.gitignore` eingetragen.
- `tsconfig.json` berücksichtigt sowohl `.next/types/**/*.ts` als auch
  `.next-dev/types/**/*.ts`.
- NextAuth-Middleware, Matcher, Rollen, Berechtigungen, Geschäftslogik und Paket-Skripte wurden
  nicht verändert.

Betroffene Dateien:

- `next.config.mjs`
- `.gitignore`
- `tsconfig.json`
- `tests/unit/next-config.test.ts`
- `tests/unit/image-optimizer-block.test.ts`
- `AGENTS.md`
- `docs/architecture/build-artifact-isolation.md`

## Verifikation

Beim Paralleltest lief `next dev` auf Port 3001 und erzeugte `.next-dev`. Während dieser Server
aktiv war, erzeugte `npm run build` die Produktionsartefakte unter `.next`. Der
Entwicklungsserver blieb danach erreichbar.

Der anschließend mit `next start` auf Port 3127 ausgeführte Produktions-Smoke-Test bestätigte:

- `/_next/image?url=%2Ftest.png&w=640&q=75` liefert HTTP 404.
- Ein tatsächlich vorhandenes Asset unter `/_next/static` liefert HTTP 200.
- `/login` liefert HTTP 200.
- `/customers` und `/offers` liefern ohne Sitzung HTTP 307 mit Weiterleitung zur Anmeldung.

## Bedingungen für spätere Änderungen

Änderungen an `distDir`, den Befehlen `dev`, `build` oder `start` oder der Middleware müssen die
Trennung der Build-Artefakte erhalten. Erforderlich sind danach:

1. ein Parallelbetrieb-Test mit laufendem Entwicklungsserver und gleichzeitigem
   Produktionsbuild;
2. ein Produktions-Smoke-Test mit `next start`;
3. die Middleware-Regressionstests;
4. `npm run test:run`, `npm run lint`, `npm run typecheck` und `npm run build`;
5. die Kontrolle, dass weder `.next` noch `.next-dev` versioniert werden.
