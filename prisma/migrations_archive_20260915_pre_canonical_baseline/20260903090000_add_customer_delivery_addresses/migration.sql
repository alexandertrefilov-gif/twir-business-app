CREATE TABLE "customer_delivery_addresses" (
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
  "phone" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "customer_delivery_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_delivery_addresses_customer_id_idx"
  ON "customer_delivery_addresses"("customer_id");
CREATE INDEX "customer_delivery_addresses_customer_id_is_active_idx"
  ON "customer_delivery_addresses"("customer_id", "is_active");
CREATE INDEX "customer_delivery_addresses_deleted_at_idx"
  ON "customer_delivery_addresses"("deleted_at");

CREATE UNIQUE INDEX "customer_delivery_addresses_one_active_default_per_customer"
  ON "customer_delivery_addresses"("customer_id")
  WHERE "is_default" = true AND "is_active" = true AND "deleted_at" IS NULL;

ALTER TABLE "customer_delivery_addresses"
  ADD CONSTRAINT "customer_delivery_addresses_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
