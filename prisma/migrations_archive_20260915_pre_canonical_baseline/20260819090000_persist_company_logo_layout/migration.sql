ALTER TABLE "company_settings"
ADD COLUMN "logo_scale" INTEGER NOT NULL DEFAULT 140,
ADD COLUMN "logo_width" INTEGER,
ADD COLUMN "logo_height" INTEGER;
