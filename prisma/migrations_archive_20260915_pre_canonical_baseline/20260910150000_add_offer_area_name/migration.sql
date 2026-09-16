-- Additive, nullable field. Existing offers remain unchanged and use the
-- application-level fallback to their previous title until reviewed.
ALTER TABLE "offers" ADD COLUMN "area_name" TEXT;
