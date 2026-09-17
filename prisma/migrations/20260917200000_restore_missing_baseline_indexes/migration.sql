-- CP15 Release-Verifikation: Vergleich einer aus der aktiven Migrationshistorie
-- frisch aufgebauten Datenbank gegen eine Kopie von business_webapp ergab, dass
-- 2 sicherheitsrelevante partielle Unique-Indizes und 1 Performance-Index bei
-- der Konsolidierung zur canonical_baseline verloren gegangen sind (Prismas
-- Schema-DSL bildet partielle Indizes nicht ab, dadurch für die Konsolidierung
-- unsichtbar). Diese Migration stellt exakt den in business_webapp bereits
-- aktiven Zustand wieder her -- rein additiv, keine Datenänderung.
--
-- Vor Anwendung geprüft: keine bestehenden Verstöße gegen die beiden
-- Unique-Constraints in business_webapp (0 Duplikate).

-- IF NOT EXISTS: einige Umgebungen (z.B. business_webapp selbst) haben diese
-- Indizes bereits aus der ursprünglichen, inkrementellen Vor-Baseline-Historie
-- -- diese Migration muss auf einer bereits aktuellen wie auf einer frischen
-- Datenbank gleichermaßen sicher anwendbar sein.

-- Verhindert doppelte aktive Angebotsnummern (u.a. bei manueller
-- Nummernänderung über changeOfferNumberAction die einzige DB-seitige
-- Absicherung gegen eine Kollision).
CREATE UNIQUE INDEX IF NOT EXISTS "offers_offer_number_key"
  ON "offers"("offer_number")
  WHERE "deleted_at" IS NULL;

-- Verhindert zwei aktive Standardadressen desselben Typs (Rechnung/Lieferung)
-- für denselben Kunden.
CREATE UNIQUE INDEX IF NOT EXISTS "customer_addresses_one_active_default_per_type"
  ON "customer_addresses"("customer_id", "type")
  WHERE "is_default" = true AND "is_active" = true AND "deleted_at" IS NULL;

-- Performance-Index, keine Konsistenzanforderung.
CREATE INDEX IF NOT EXISTS "collaboration_checklist_items_responsible_membership_id_idx"
  ON "collaboration_checklist_items"("responsible_membership_id");
