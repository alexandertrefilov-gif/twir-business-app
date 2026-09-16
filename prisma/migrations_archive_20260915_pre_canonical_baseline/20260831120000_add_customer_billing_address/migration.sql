ALTER TABLE "customers"
  ADD COLUMN "has_billing_address" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "billing_name" TEXT,
  ADD COLUMN "billing_additional" TEXT,
  ADD COLUMN "billing_street" TEXT,
  ADD COLUMN "billing_house_number" TEXT,
  ADD COLUMN "billing_postal_code" TEXT,
  ADD COLUMN "billing_city" TEXT,
  ADD COLUMN "billing_country" TEXT;
