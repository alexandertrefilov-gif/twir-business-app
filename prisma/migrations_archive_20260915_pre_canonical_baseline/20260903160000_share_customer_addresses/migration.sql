CREATE TYPE "CustomerAddressType" AS ENUM ('BILLING', 'SHIPPING');

CREATE TABLE "addresses" (
  "id" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "additional" TEXT,
  "street" TEXT NOT NULL,
  "house_number" TEXT,
  "postal_code" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'DE',
  "contact_name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_addresses" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "address_id" TEXT NOT NULL,
  "type" "CustomerAddressType" NOT NULL,
  "label" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "addresses_company_name_idx" ON "addresses"("company_name");
CREATE INDEX "addresses_street_postal_code_city_country_idx" ON "addresses"("street", "postal_code", "city", "country");
CREATE INDEX "customer_addresses_customer_id_type_is_active_idx" ON "customer_addresses"("customer_id", "type", "is_active");
CREATE INDEX "customer_addresses_address_id_idx" ON "customer_addresses"("address_id");
CREATE INDEX "customer_addresses_deleted_at_idx" ON "customer_addresses"("deleted_at");
CREATE UNIQUE INDEX "customer_addresses_customer_id_address_id_type_key" ON "customer_addresses"("customer_id", "address_id", "type");
CREATE UNIQUE INDEX "customer_addresses_one_active_default_per_type"
  ON "customer_addresses"("customer_id", "type")
  WHERE "is_default" = true AND "is_active" = true AND "deleted_at" IS NULL;

ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_address_id_fkey"
  FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bestandsdaten beider bisherigen Tabellen werden zunächst vereinheitlicht.
-- Der normalisierte Schlüssel verhindert unnötige Kopien derselben Postanschrift.
CREATE TEMP TABLE "_legacy_address_sources" AS
SELECT "id" AS "legacy_id", "customer_id", 'BILLING'::"CustomerAddressType" AS "type",
  "label", "company_name", "additional", "street", "house_number", "postal_code", "city",
  "country", "contact_name", "email", NULL::TEXT AS "phone", "is_active", "is_default",
  "created_at", "updated_at", "deleted_at"
FROM "customer_billing_addresses"
UNION ALL
SELECT "id", "customer_id", 'SHIPPING'::"CustomerAddressType", "label", "company_name",
  "additional", "street", "house_number", "postal_code", "city", "country", "contact_name",
  "email", "phone", "is_active", "is_default", "created_at", "updated_at", "deleted_at"
FROM "customer_delivery_addresses";

ALTER TABLE "_legacy_address_sources" ADD COLUMN "normalized_key" TEXT;
UPDATE "_legacy_address_sources" SET "normalized_key" = concat_ws('|',
  lower(btrim("company_name")), lower(btrim("street")), lower(btrim(coalesce("house_number", ''))),
  lower(btrim("postal_code")), lower(btrim("city")), upper(btrim("country"))
);

CREATE TEMP TABLE "_legacy_address_map" AS
SELECT "normalized_key", gen_random_uuid()::text AS "address_id"
FROM "_legacy_address_sources" GROUP BY "normalized_key";

INSERT INTO "addresses" ("id", "company_name", "additional", "street", "house_number",
  "postal_code", "city", "country", "contact_name", "email", "phone", "created_at", "updated_at")
SELECT DISTINCT ON (s."normalized_key") m."address_id", s."company_name", s."additional", s."street",
  s."house_number", s."postal_code", s."city", upper(s."country"), s."contact_name", s."email",
  s."phone", s."created_at", s."updated_at"
FROM "_legacy_address_sources" s JOIN "_legacy_address_map" m USING ("normalized_key")
ORDER BY s."normalized_key", s."updated_at" DESC;

INSERT INTO "customer_addresses" ("id", "customer_id", "address_id", "type", "label",
  "is_active", "is_default", "created_at", "updated_at", "deleted_at")
SELECT s."legacy_id", s."customer_id", m."address_id", s."type", s."label", s."is_active",
  s."is_default", s."created_at", s."updated_at", s."deleted_at"
FROM "_legacy_address_sources" s JOIN "_legacy_address_map" m USING ("normalized_key")
ON CONFLICT ("customer_id", "address_id", "type") DO NOTHING;

-- Die Legacy-Tabellen bleiben für einen einfachen Rollback erhalten. Der Anwendungscode
-- liest und schreibt nach dieser Migration ausschließlich addresses/customer_addresses.
