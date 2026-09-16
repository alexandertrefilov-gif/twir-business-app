-- Add optional company metadata used in document headers and footers.
ALTER TABLE "company_settings"
ADD COLUMN "business_activity" TEXT,
ADD COLUMN "supplier_number" TEXT;
