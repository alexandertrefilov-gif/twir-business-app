CREATE TABLE "customer_billing_addresses" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "additional" TEXT,
  "street" TEXT NOT NULL,
  "house_number" TEXT,
  "postal_code" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'DE',
  "contact_name" TEXT,
  "email" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "customer_billing_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_billing_addresses_customer_id_idx"
  ON "customer_billing_addresses"("customer_id");
CREATE INDEX "customer_billing_addresses_customer_id_is_active_idx"
  ON "customer_billing_addresses"("customer_id", "is_active");
CREATE INDEX "customer_billing_addresses_deleted_at_idx"
  ON "customer_billing_addresses"("deleted_at");

CREATE UNIQUE INDEX "customer_billing_addresses_one_default_per_customer"
  ON "customer_billing_addresses"("customer_id")
  WHERE "is_default" = true AND "deleted_at" IS NULL;

ALTER TABLE "customer_billing_addresses"
  ADD CONSTRAINT "customer_billing_addresses_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Einmaliger Legacy-Backfill. Nur vollständige, tatsächlich aktivierte
-- Rechnungsstellen werden übernommen; pro Kunde entsteht höchstens ein Datensatz.
INSERT INTO "customer_billing_addresses" (
  "id", "customer_id", "label", "company_name", "additional", "street",
  "house_number", "postal_code", "city", "country", "is_active",
  "is_default", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  c."id",
  'Legacy-Rechnungsstelle',
  btrim(c."billing_name"),
  NULLIF(btrim(c."billing_additional"), ''),
  btrim(c."billing_street"),
  NULLIF(btrim(c."billing_house_number"), ''),
  btrim(c."billing_postal_code"),
  btrim(c."billing_city"),
  btrim(c."billing_country"),
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "customers" c
WHERE c."has_billing_address" = true
  AND NULLIF(btrim(c."billing_name"), '') IS NOT NULL
  AND NULLIF(btrim(c."billing_street"), '') IS NOT NULL
  AND NULLIF(btrim(c."billing_postal_code"), '') IS NOT NULL
  AND NULLIF(btrim(c."billing_city"), '') IS NOT NULL
  AND NULLIF(btrim(c."billing_country"), '') IS NOT NULL;
