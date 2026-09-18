# PROJECT_INDEX

Navigationsindex, keine zweite Spezifikation. Der Code hat immer Vorrang — bei
Widerspruch gilt der Code, dieser Index wird dann als veraltet markiert und erst
nach erfolgreichen Tests korrigiert. Siehe `AGENTS.md` → „Repository Navigation“
für die Suchregeln und `docs/PROJECT_MAP.md` für Modulbeziehungen/Invarianten.

Namenskonvention: `xAction` = Server Action, `xxx.service.ts` = Fachlogik,
`xxx.schema.ts` = Zod-Validator/Berechnung.

## Customer

Purpose: Kundenstammdaten inkl. Kontakte, Liefer-/Rechnungsadressen.

Entry points:
- `app/(dashboard)/customers/actions.ts`

Services:
- `lib/services/customer.service.ts` — `getCustomers`, `getCustomerById`, `createCustomer`, `updateCustomer`, `deleteCustomer`
- `lib/services/customer-address.service.ts`, `customer-billing-address.service.ts`, `customer-delivery-address.service.ts`

Validators:
- `lib/validators/customer.schema.ts`, `customer-address.schema.ts`, `customer-billing-address.schema.ts`, `customer-delivery-address.schema.ts`

Prisma models: `Customer`, `Contact`, `CustomerAddress`

API/routes: keine dedizierte API — nur Server Actions

UI: `app/(dashboard)/customers/{page,[id]/page,new/page,[id]/edit/page}.tsx`

Tests: `tests/unit/customer-*.test.ts` (10 Dateien)

Depends on: Document Archive (bei Kundenbestellung), Auth (intern)

## Offer (Angebot)

Purpose: Angebotserstellung, Versand, Annahme/Ablehnung, Umwandlung in Auftrag.

Entry points:
- `app/(dashboard)/offers/actions.ts` — `createOfferAction`, `changeOfferStatusAction`, `convertToOrderAction`, `deleteOfferAction`

Services:
- `lib/services/offer.service.ts` — `createOffer`, `changeOfferNumber`, `acceptOfferInTransaction`, `changeOfferStatus`, `convertOfferToOrder`, `deleteOffer`
- `lib/services/offer-pdf.service.ts` — `getOfferPdfData`

Validators:
- `lib/validators/offer.schema.ts` — `OfferCreateSchema`, `calcItemAmounts`, `calcOfferTotals` (zentrale Berechnung, von Order/Invoice re-exportiert)

Prisma models: `Offer`, `OfferItem`

API/routes:
- `app/api/offers/[id]/preview/route.ts` (PDF, inline)
- `app/api/offers/[id]/customer-purchase-order/route.ts`

UI: `app/(dashboard)/offers/{page,[id]/page,new/page,[id]/edit/page}.tsx`

Tests: `tests/unit/offer-*.test.ts` (17 Dateien)

Depends on: Customer, CustomerPurchaseOrder, PDF-Infrastruktur → erzeugt Order

## CustomerPurchaseOrder (Kundenbestellung)

Purpose: Hochgeladenes Bestelldokument des Kunden, an ein Offer gehängt.

Entry points: Teil von `app/(dashboard)/offers/actions.ts` (Annahme mit/ohne Bestellung)

Services:
- `lib/services/customer-purchase-order.service.ts`

Prisma models: `CustomerPurchaseOrder`

API/routes: `app/api/offers/[id]/customer-purchase-order/route.ts`

Tests: `tests/integration/customer-purchase-order-*.test.ts`

Depends on: Offer, Document Archive (bedingt: `company_settings.document_archive_path`,
sonst `STORAGE_LOCAL_PATH` — siehe PROJECT_MAP)

## Order (Auftrag)

Purpose: Auftragserstellung (direkt oder aus Offer), Versand, Bestätigung.

Entry points:
- `app/(dashboard)/orders/actions.ts` — `createOrderAction`, `markOrderSentAction`, `changeOrderStatusAction`, `deleteOrderAction`

Services:
- `lib/services/order.service.ts` — `createOrder`, `markOrderSent`, `changeOrderStatus`, `deleteOrder`
- `lib/services/order-pdf.service.ts`

Prisma models: `Order`

API/routes:
- `app/api/orders/[id]/pdf/route.ts`
- `app/api/document-confirmations/[entityType]/[id]/route.ts` (generisch, `entityType='order'`)

UI: `app/(dashboard)/orders/{page,[id]/page,new/page,[id]/edit/page}.tsx`

Tests: `tests/unit/order-*.test.ts` (13 Dateien)

Depends on: Offer (optional Ursprung), Customer → erzeugt ServiceReport

## ServiceReport (Leistungsnachweis)

Purpose: Leistungsdokumentation, Finalisierung, Versand, Bestätigung. Kein Statusmodell
im klassischen Sinn (kein Freigabe-Workflow).

Entry points:
- `app/(dashboard)/services/actions.ts` — `createServiceReportAction`, `finalizeServiceReportAction`, `markServiceReportSentAction`, `deleteServiceReportAction`

Services:
- `lib/services/service-report.service.ts` — `finalizeServiceReport`, `markServiceReportSent`
- `lib/services/service-report-pdf.service.ts`, `service-report-template.service.ts`

Prisma models: `ServiceReport`, `ServiceReportItem`

API/routes:
- `app/api/services/[id]/pdf/route.ts`, `app/api/services/preview/route.ts`
- `.../document-confirmations/[entityType]/[id]/route.ts`, `entityType='service-report'`

UI: `app/(dashboard)/services/{page,[id]/page,new/page}.tsx`

Tests: `tests/unit/service-report-*.test.ts` (9 Dateien)

Depends on: Order → erzeugt Invoice

## Invoice (Rechnung)

Purpose: Rechnungsentwurf, Finalisierung (sperrt, vergibt Nummer atomar), Versand, Storno.

Entry points:
- `app/(dashboard)/invoices/actions.ts` — `createInvoiceDraftAction`, `finalizeInvoiceAction`, `cancelInvoiceAction`

Services:
- `lib/services/invoice.service.ts` — `createInvoiceDraft`, `finalizeInvoice`, `cancelInvoice`, `buildCompanySnapshot`, `buildBillingAddressSnapshot`
- `lib/services/invoice-query.service.ts` (Lesezugriffe)
- `lib/services/invoice-pdf.service.ts`

Validators: `lib/validators/invoice.schema.ts` (re-exportiert `calcItemAmounts`/`calcOfferTotals`)

Prisma models: `Invoice`, `InvoiceItem`

API/routes: `app/api/invoices/[id]/pdf/route.ts`, `app/api/invoices/preview/route.ts`

UI: `app/(dashboard)/invoices/{page,[id]/page,new/page}.tsx`

Tests: `tests/unit/invoice-*.test.ts` (9 Dateien)

Depends on: Order, ServiceReport, Customer → erzeugt Payment, DunningNotice

## Payment (Zahlung/Mahnung)

Purpose: Teil-/Vollzahlungen zu einer Rechnung, Mahnwesen bei Verzug.

Entry points:
- `app/(dashboard)/payments/actions.ts` — `addPaymentAction`, `removePaymentAction`, `createDunningAction`, `markDunningNoticeSentAction`

Services:
- `lib/services/payment.service.ts` — `addPayment`, `removePayment`, `getInvoicePaymentState`, `getPaymentJournal`
- `lib/services/dunning.service.ts` — `createDunningNotice`, `getOverdueInvoices`, `markOverdueInvoices`

Validators: `lib/validators/payment.schema.ts`

Prisma models: `Payment`, `DunningNotice`

PDF: Vorlage vorhanden (`lib/pdf-templates/dunning.template.tsx`, `renderDunningPdf`),
**keine live Route** — `DunningNotice.pdfPath` wird bislang nur manuell gepflegt.

UI: `app/(dashboard)/payments/page.tsx`

Tests: `tests/unit/payment-*.test.ts`, dunning-bezogene Tests in `race-condition.test.ts`

Depends on: Invoice

## Accounting (Buchhaltung)

Purpose: Reines Read-only-Reporting über Invoice/Payment — **kein eigenes Prisma-Modell**.

Services:
- `lib/services/accounting.service.ts` — `getAccountingInvoices`, `getOpenAccountingInvoices`, `getAccountingPayments`, `deriveOpenItems`, `getAccountingOverview`

UI: `app/(dashboard)/accounting/page.tsx`

Tests: `tests/unit/accounting-*.test.ts` (2 Dateien)

Depends on: Invoice, Payment. Bekannte Einschränkung: USt-Auswertung nur TEILWEISE
(nicht in dieser Datei vertiefen — Code prüfen).

## Project (interner kaufmännischer Kontext)

Purpose: Optionaler Querverweis zu Angebot/Auftrag. Kein eigener Prozessschritt.
**Nicht identisch mit `CollaborationProject`.**

Services:
- `lib/services/project.service.ts` — `listProjects`, `listProjectsForCustomer`, `createProject`, `updateProject`, `changeProjectStatus`

Validators: `lib/validators/project.schema.ts`

Prisma models: `Project`

UI: `app/(dashboard)/projects/{page,[id]/page,new/page,[id]/edit/page}.tsx`

Tests: `tests/unit/project-*.test.ts` (7 Dateien)

Depends on: Customer (optional), Offer/Order (optionaler Querverweis)

## CollaborationProject (GGA-Domäne, Stages/Tasks)

Purpose: Eigenständige Projektsteuerung für die GGA-/Gefahrstoffschrank-Domäne —
Phasen (Konzept/Planung/Umsetzung/Abnahme/Abschluss), Aufgaben, Checklisten, Blocker,
interne Freigaben. Getrennt von der internen Auth-Domain.

Services:
- `lib/services/collaboration-phase2.service.ts`, `collaboration-project.service.ts`
- Generischer Workflow-Endpunkt: `app/api/collaboration/workflow/route.ts`
  (Actions u. a.: `create-task`, `task-status`, `checklist`, `create-blocker`,
  `request-approval`, `request-operator-approval`)

Auth-Guards: `lib/auth/collaboration-guards.ts` — `requireCollaborationSession`,
`requireCollaborationProjectAccess`, `requireCollaborationManager`,
`handleCollaborationPageError`,
`requireInternalCollaborationProjectAccess` (Mitgliedschaft + Ausschluss
`OPERATOR` — für ausschließlich intern genutzte Lesezugriffe, siehe
PROJECT_MAP → Invariante 10), `internalCollaborationRoles`

Prisma models: `CollaborationProject`, `CollaborationMembership`,
`CollaborationProjectStage`, `CollaborationTask`, `CollaborationChecklistItem`,
`CollaborationBlocker`, `CollaborationApproval`

Rollen: `CollaborationRole` — `COLLAB_VIEWER`, `COLLAB_MEMBER`, `COLLAB_MANAGER`,
`EXTERNAL_PLANNER`, `INTERNAL_PLANNER`, `OPERATOR`, `PARTNER`

UI: `app/(collaboration)/collaboration/{dashboard,projects,tasks,checklists,blockers,approvals,team}/page.tsx`

Tests: `tests/*/collaboration-*.test.ts` (10 Dateien)

Depends on: nichts aus der internen Domäne außer geteiltem `NEXTAUTH_SECRET`
→ trägt GgaCabinet

## GGA Cabinet (Gefahrstoffschrank)

Purpose: Bestandsaufnahme, Maßnahmen, interne Prüfung/Abnahme, Mangel-/Nachprüfungs-
Zyklus (über CollaborationBlocker), Schrankakte-PDF.

Services:
- `lib/services/gga-cabinet.service.ts` — `createGgaCabinet`, `updateGgaCabinet`,
  `getGgaCabinetDetail`, `applyGgaCabinetChecklistTemplate`, `setGgaCabinetInspectionItem`,
  `getGgaCabinetAuditHistory`, `getGgaCabinetControlTowerSummary`, `getGgaCabinetProjectWorklist`,
  `requestGgaCabinetOperatorApproval`, `decideGgaCabinetOperatorApproval`
- `lib/services/gga-cabinet-schrankakte.service.ts` — `getGgaCabinetSchrankaktePdfData`
  (PDF wird live generiert, nicht persistiert)

Wizards (Client): `components/collaboration/{GgaCabinetInspectionWizard,GgaCabinetIntakeWizard}.tsx`

Mangelbehebung (Client): `components/collaboration/GgaCabinetBlockerList.tsx` — Mangel wird direkt im
Schrankkontext mit Pflicht-Behebungsbeschreibung geschlossen (`resolve-blocker` über
`app/api/collaboration/workflow/route.ts`, Resolution serverseitig als Pflichtfeld erzwungen)

Prisma models: `GgaCabinet` (Ex-Schutz-Bewertung als expliziter Tri-State:
„Noch nicht bewertet“/„Erforderlich“/„Nicht erforderlich“ — nie automatisch abgeleitet)

API/routes: `app/api/collaboration/cabinets/[id]/schrankakte/route.ts`

Tests: `tests/*/gga-*.test.ts` (5 Dateien)

Depends on: CollaborationProject (Container), CollaborationDocument (Fotos/Protokolle)

## Operator Portal (Betreiberportal)

Purpose: Externe Sicht für den Betreiber — nur faktischer Prüfstatus, keine automatische
Konformitätsaussage, Freigabe nur nach expliziter Attestierung.

Services: Teil von `lib/services/gga-cabinet.service.ts`
(`requestGgaCabinetOperatorApproval`, `decideGgaCabinetOperatorApproval`) —
separat von der internen Freigabe (`CollaborationApproval`).

UI: `app/(collaboration)/collaboration/betreiber/{page,[id]/page}.tsx`

Rolle: `OPERATOR` (`CollaborationRole`)

Invariante: Betreiberfreigabe ist erst nach bestandener interner Prüfung anforderbar
(Gate in der UI und im Service).

Depends on: GGA Cabinet, CollaborationDocument (nur `visibility=EXTERNAL` sichtbar)

## Document Archive (Dokumentenarchiv/Notfallarchiv)

Purpose: Zweites, vom internen `Document`-Modell getrenntes Speichersystem —
Notfallarchiv mit menschenlesbarer Ordnerstruktur, z. B. für OneDrive-Sync-Ordner.

Storage-Klasse: `lib/documents/archive-storage.ts` — `LocalFilesystemArchiveStorage`
(atomarer Write: Temp-Datei im selben Zielverzeichnis + `rename`/`link`)

Services: `lib/documents/document-archive.service.ts`, `archive-explorer.service.ts`,
`customer-archive.service.ts`

Prisma: kein eigenes Modell — Pfad liegt in `company_settings.document_archive_path`/
`document_archive_enabled` (DB-konfiguriert, **nicht** env-gesteuert)

Erstinstallation: `deploy/initial-production-setup.ts` (idempotent, ändert nie eine
bestehende Zeile, liest Zielpfad nur aus `INITIAL_DOCUMENT_ARCHIVE_PATH`)

Tests: `tests/*/archive-*.test.ts` (5 Dateien)

Depends on: Customer (Kundenbestellung), Order/ServiceReport (externe Bestätigungen)
— siehe PROJECT_MAP für die genaue Pfadtrennung zu `STORAGE_LOCAL_PATH`

## PDF-Infrastruktur

Purpose: Gemeinsame Rendering-Basis für alle Dokumenttypen.

Templates: `lib/pdf-templates/{offer,order,service-report,invoice,dunning,gga-cabinet-schrankakte}.template.tsx`, `company-logo.ts`, `document-header.tsx`

Logo speichern (Upload): `app/(dashboard)/settings/actions.ts` — `updateSettingsAction`
(Formular-Submit, kein eigener Endpunkt) → `lib/services/settings.service.ts` —
`saveCompanyLogo`, `getCompanyLogoMetadata`, `hasValidCompanyLogoSignature`

Logo-Rendering (PDF-Zeitpunkt): `lib/services/company-logo-rendering.service.ts` —
`prepareCompanyLogoForRendering` (sharp: `trim()` + `toBuffer({resolveWithObject:true})`,
schmale API-Fläche, siehe CP16) — **anderer Code als der Upload-Pfad oben**

Live-Routen: Offer (`/api/offers/[id]/preview`), Order (`/api/orders/[id]/pdf`),
ServiceReport (`/api/services/[id]/pdf`), Invoice (`/api/invoices/[id]/pdf`),
GGA-Schrankakte (`/api/collaboration/cabinets/[id]/schrankakte`).
Mahnung: Template existiert, keine Route (siehe Payment-Modul).

Tests: `tests/unit/pdf-rendering.test.tsx`, `tests/unit/company-logo-*.test.ts`

## Auth-Domains

Purpose: Zwei vollständig getrennte, gleichzeitig aktive Auth-Domains in einer App.

Intern: `lib/auth/options.ts` (`authOptions`) — Cookie `(__Secure-)twir-internal-session`
Collaboration: `lib/auth/collaboration-options.ts` — Cookie `(__Secure-)twir-collaboration-session`
Gemeinsam: `lib/auth/session-cookies.ts` (leitet `secure` aus `NODE_ENV` ab), `NEXTAUTH_SECRET`

Grenzdurchsetzung: `proxy.ts` — Matcher, `authScope`-JWT-Claim-Prüfung pro Pfadpräfix.
Health-Ausnahme exakt `api/health$`, keine Präfix-Ausnahmen (Regression: `tests/unit/health-endpoint-auth.test.ts`)

Berechtigung: `lib/auth/permissions.ts` — `requirePermission` (Actions/API),
`requirePagePermission` (Server-Component-Seiten, next/navigation `forbidden()`/`unauthorized()`)

Rollen: `RoleName` (intern) vs. `CollaborationRole` (Collaboration) — disjunkt, siehe Module oben

Tests: `tests/unit/auth-domain-middleware.test.ts`, `admin-dual-access.test.ts`,
`collaboration-access.test.ts`, `page-read-authorization.test.ts`

## Deployment-Infrastruktur

Purpose: Hetzner-VPS-Zielarchitektur, Docker Compose, kein Serverless.

Container: `deploy/Dockerfile` (Multi-Stage, Node 24, non-root, kein CLI/devDeps im
Runtime-Image — `openssl` explizit installiert, siehe CP17-Fund), `deploy/docker-compose.production.yml`
(Services: app/db/caddy), `deploy/Caddyfile`

Volumes: `uploads` (`STORAGE_LOCAL_PATH`), `archive` (Dokumentenarchiv),
`postgres-data`, `caddy-data`, `caddy-config` — zwei getrennte Storage-Volumes,
siehe Document-Archive-Modul

Healthcheck: `app/api/health/route.ts` (nur `{"status":"ok"/"error"}`, 200/503)

Pinning: `.nvmrc` (24.21.0), `package.json` `engines`, `next.config.mjs` `output:'standalone'`

Env-Vorlage: `deploy/.env.production.example`

Tests: end-to-end via lokaler Docker-Compose-Simulation (nicht als Vitest-Datei,
siehe CP17-Bericht) — kein automatisierter Deployment-Test im Repo

Depends on: alle Module (Runtime), Document Archive + Storage (Volume-Trennung)
