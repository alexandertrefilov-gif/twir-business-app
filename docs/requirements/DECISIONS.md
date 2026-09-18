# DECISIONS — freigegebene Entscheidungen

Ausschließlich tatsächlich getroffene fachliche oder technische
Entscheidungen. `ACCEPTED` heißt: die Entscheidung wurde getroffen.
`IMPLEMENTED` heißt: der Code wurde tatsächlich umgesetzt UND verifiziert.
Diese beiden Zustände sind nicht gleichzusetzen.

---

## DEC-001 — Hetzner Cloud VPS statt serverlosem Hosting

Status: ACCEPTED
Date: 2026-09-17
Area: Deployment-Infrastruktur

### Entscheidung
Zielplattform ist ein Hetzner-Cloud-VPS (Deutschland), kein Vercel/serverloses
Hosting.

### Begründung
Bestehende `LocalFilesystemArchiveStorage`-Architektur setzt einen dauerhaft
vorhandenen, persistenten lokalen Datenträger voraus — mit einer serverlosen
Plattform inkompatibel, kein S3-Umbau vorgesehen (siehe DEC-005).

### Konsequenzen
Klassischer, dauerhaft laufender Node-Prozess statt Functions; eigene
Verantwortung für Server-Betrieb (Firewall, Updates, Backup).

### Betroffene Anforderungen
- REQ-010 (Document-Archive-Zielpfad hängt von dieser Entscheidung ab)

### Betroffene Architektur
- Deployment-Infrastruktur

### Implementierungsstatus
NOT_IMPLEMENTED — kein Server bestellt/eingerichtet.

---

## DEC-002 — Docker Compose, klassischer persistenter Node-Betrieb

Status: ACCEPTED
Date: 2026-09-17
Area: Deployment-Infrastruktur

### Entscheidung
Betrieb über Docker Compose (Services app/db/caddy) auf dem VPS, kein
Bare-Metal-Node-Prozess.

### Begründung
Reproduzierbarkeit, saubere Volume-Trennung für die beiden Storage-Bereiche
(siehe DEC-006), einfacher Rollback über Image-Tags.

### Konsequenzen
`deploy/Dockerfile`, `deploy/docker-compose.production.yml`, `deploy/Caddyfile`
sind die maßgebliche Deployment-Konfiguration.

### Betroffene Anforderungen
- keine offenen

### Betroffene Architektur
- Deployment-Infrastruktur (siehe PROJECT_INDEX/PROJECT_MAP)

### Implementierungsstatus
PARTIAL — Dockerfile/Compose gebaut und gegen eine lokale, isolierte
Docker-Instanz vollständig verifiziert (CP17: Migration, Login, Domain-
Grenzen, Upload-/Archiv-Persistenz über Neustart und `down`/`up`, PDF,
6 Negativtests). Nicht auf echter VPS-Infrastruktur verifiziert.

---

## DEC-003 — PostgreSQL 16.x

Status: ACCEPTED
Date: 2026-09-17
Area: Deployment-Infrastruktur / Datenbank

### Entscheidung
Produktions-PostgreSQL-Version ist 16.x.

### Begründung
Entspricht exakt der durchgehend lokal getesteten Version (16.13); keine
Prisma-Extension oder Feature jenseits Standard-JSONB/partieller Indizes
erforderlich.

### Konsequenzen
`docker-compose.production.yml` verwendet `postgres:16`.

### Betroffene Anforderungen
- keine offenen

### Betroffene Architektur
- Deployment-Infrastruktur, alle Module (Datenschicht)

### Implementierungsstatus
PARTIAL — in lokaler Docker-Simulation verifiziert, keine echte
Produktionsdatenbank vorhanden.

---

## DEC-004 — Node 24.x

Status: ACCEPTED
Date: 2026-09-17
Area: Deployment-Infrastruktur

### Entscheidung
Node-Version für Produktion ist 24.x (konkret `24.21.0`), nicht nur die
Next-16-Mindestanforderung `>=20.9.0`.

### Begründung
Aktuelle Active-LTS-Linie, exakt die in diesem gesamten Engagement getestete
Version — kein Sprung ins Ungetestete.

### Konsequenzen
`.nvmrc` und `package.json` `engines` erzwingen dies plattformseitig.

### Betroffene Anforderungen
- keine offenen

### Betroffene Architektur
- Deployment-Infrastruktur

### Implementierungsstatus
IMPLEMENTED — `.nvmrc`/`engines` committet, `npm ci` ohne Lockfile-Änderung
verifiziert (CP17). Bezieht sich auf die Repo-Konfiguration, nicht auf einen
laufenden Produktionsserver.

---

## DEC-005 — Persistenter lokaler Storage, vorerst kein S3-Umbau

Status: ACCEPTED
Date: 2026-09-17
Area: Document Archive / Storage

### Entscheidung
Bestehende `LocalFilesystemArchiveStorage`-Architektur bleibt erhalten; kein
S3-kompatibler Objektspeicher-Adapter in diesem Zeitraum.

### Begründung
Vermeidet einen großen, ungeplanten Umbau; Hetzner-VPS mit persistentem
Volume macht das nicht erforderlich.

### Konsequenzen
Beide Storage-Bereiche (siehe DEC-006) müssen auf dem VPS als echte,
dauerhafte Volumes bereitstehen — kein Verlust bei Redeploy tolerierbar.

### Betroffene Anforderungen
- REQ-010

### Betroffene Architektur
- Document Archive, Storage (siehe PROJECT_MAP)

### Implementierungsstatus
IMPLEMENTED — entspricht dem unveränderten Bestandscode.

---

## DEC-006 — STORAGE_LOCAL_PATH und document_archive_path getrennte Volumes

Status: ACCEPTED
Date: 2026-09-17
Area: Storage / Deployment-Infrastruktur

### Entscheidung
Beide Basisverzeichnisse werden als zwei separate, benannte Docker-Volumes
(`uploads`, `archive`) behandelt, nicht als ein gemeinsames.

### Begründung
Code-Analyse (CP17) bestätigte: beide Pfade sind unabhängig konfigurierbar
und werden von unterschiedlichen Funktionen beschrieben — ein gemeinsames
Volume würde bei falscher Konfiguration einen der beiden Schreibpfade
stillschweigend auf einen nicht persistenten Pfad umleiten.

### Konsequenzen
`docker-compose.production.yml` definiert beide Volumes einzeln; Backup muss
beide erfassen (siehe DEC-007).

### Betroffene Anforderungen
- REQ-010 (konkreter Zielpfad für `document_archive_path` noch offen)

### Betroffene Architektur
- Storage, Document Archive (siehe PROJECT_MAP → Invariante 6)

### Implementierungsstatus
PARTIAL — Volumes im Compose-File definiert und lokal verifiziert (CP17);
`document_archive_path` selbst zeigt in der lokalen DB weiterhin auf den
alten macOS-Pfad (siehe REQ-010, nicht auf Produktionsdaten geändert).

---

## DEC-007 — Backup muss DB und beide Storage-Bereiche umfassen

Status: ACCEPTED
Date: 2026-09-17
Area: Deployment-Infrastruktur / Backup

### Entscheidung
Ein Backup gilt nur dann als erfolgreich, wenn PostgreSQL UND beide
Storage-Volumes (`uploads`, `archive`) gemeinsam wiederherstellbar sind.

### Begründung
Ein reiner DB-Restore ohne Datei-Restore ergibt eine inkonsistente Instanz
(Referenzen auf fehlende Dateien).

### Konsequenzen
Backup-Konzept (`pg_dump` + Volume-Sicherung + Rotation + Integritätsprüfung
+ Restore-Test + Offsite) wurde entworfen, siehe CP17-Bericht.

### Betroffene Anforderungen
- keine offenen

### Betroffene Architektur
- Deployment-Infrastruktur, Storage, Document Archive

### Implementierungsstatus
NOT_IMPLEMENTED — Konzept dokumentiert, kein Backup-Skript/Cron gebaut,
kein echter Server vorhanden.
