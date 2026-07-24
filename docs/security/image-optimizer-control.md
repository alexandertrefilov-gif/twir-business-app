# Deaktivierter Next.js Image Optimizer

## Zweck

Der ungenutzte Next.js Image Optimizer ist als kompensierende Sicherheitsmaßnahme deaktiviert.
Damit ist der Laufzeitpfad zum transitiv installierten Sharp-/libvips-Paket nicht über
`/_next/image` erreichbar, solange das Projekt keine Next.js-Bildoptimierung verwendet.

## Technische Umsetzung

`next.config.mjs` enthält einen exakten `beforeFiles`-Rewrite:

```text
/_next/image → /api/image-optimizer-disabled
```

Der Route Handler `app/api/image-optimizer-disabled/route.ts` liefert für `GET` ohne Datenbank-,
Session- oder Dateizugriff HTTP 404. Der Rewrite enthält keine Wildcard und erfasst insbesondere
nicht `/_next/static`.

Die bestehende Middleware wird dafür nicht verwendet. Eine Produktionsprüfung hat bestätigt,
dass Next.js den internen Image-Optimizer vor einer dafür konfigurierten benutzerdefinierten
Middleware verarbeitet. Der `beforeFiles`-Rewrite greift dagegen vor dem Image-Optimizer und
liefert zuverlässig den vorgesehenen 404-Status.

## Bestätigte Nichtverwendung

Zum Zeitpunkt der Einführung verwendet das Projekt:

- keine Imports aus `next/image`,
- keine `<Image>`-Komponenten,
- keine `images.remotePatterns`,
- keine `images.domains`,
- keinen eigenen Image Loader.

Hochgeladene Bilder werden als geschützte Dokumente gespeichert und über den autorisierten
Dokumentdownload ausgeliefert. Sie werden nicht an den Next.js Image Optimizer übergeben.

## Produktionsprüfung

Der Produktionsserver wurde mit dem vorhandenen `npm run start`-Kommando geprüft:

- `/_next/image` mit Testparametern → HTTP 404,
- vorhandenes Asset unter `/_next/static/...` → HTTP 200,
- `/login` → HTTP 200,
- `/customers` ohne Sitzung → Weiterleitung zur bestehenden NextAuth-Anmeldung.

## Verbleibendes Risiko

Das deaktivierte Laufzeitfeature reduziert die Angriffsfläche des transitiven Sharp-/libvips-
Befunds. Die bekannten PostCSS-Befunde betreffen davon getrennt die Buildzeit. Das Projekt
verarbeitet dort aktuell ausschließlich vertrauenswürdige Projekt- und Abhängigkeitsquellen;
das verbleibende Buildzeitrisiko muss bis zu einem offiziellen kompatiblen Next.js-Patch
dokumentiert und bei Releases erneut geprüft werden.

## Bedingungen für eine spätere Aufhebung

Falls `next/image` künftig benötigt wird:

1. die Sperre bewusst entfernen,
2. die dann verwendeten Next.js-, Sharp- und libvips-Versionen sicherheitlich neu bewerten,
3. Remote-Quellen und erlaubte Bildpfade ausdrücklich begrenzen,
4. Sicherheits- und Regressionstests für den Image Optimizer ergänzen,
5. `npm audit --omit=dev` und alle Release-Gates erneut ausführen,
6. die Entscheidung in `AGENTS.md` und dieser Datei aktualisieren.

## Einführung und Kontext

- Eingeführt am: 24. Juli 2026
- Branch: `next15-react19-upgrade`
- Kontext: Next.js-15-/React-19-Migration auf Basis des Migrations-Commits `fb60017`
