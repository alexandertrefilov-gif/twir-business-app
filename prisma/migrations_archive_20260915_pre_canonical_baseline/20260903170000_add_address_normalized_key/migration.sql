ALTER TABLE "addresses" ADD COLUMN "normalized_key" TEXT;

UPDATE "addresses" SET "normalized_key" = concat_ws('|',
  lower(regexp_replace(btrim("company_name"), '\s+', ' ', 'g')),
  lower(regexp_replace(btrim("street"), '\s+', ' ', 'g')),
  lower(regexp_replace(btrim(coalesce("house_number", '')), '\s+', ' ', 'g')),
  lower(regexp_replace(btrim("postal_code"), '\s+', ' ', 'g')),
  lower(regexp_replace(btrim("city"), '\s+', ' ', 'g')),
  lower(regexp_replace(btrim("country"), '\s+', ' ', 'g'))
);

ALTER TABLE "addresses" ALTER COLUMN "normalized_key" SET NOT NULL;
CREATE UNIQUE INDEX "addresses_normalized_key_key" ON "addresses"("normalized_key");
