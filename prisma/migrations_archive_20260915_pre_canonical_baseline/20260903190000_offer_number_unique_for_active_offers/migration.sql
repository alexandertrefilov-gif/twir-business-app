DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "offers"
    WHERE "deleted_at" IS NULL
    GROUP BY "offer_number"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Aktive Angebote enthalten doppelte Angebotsnummern.';
  END IF;
END
$$;

DROP INDEX "offers_offer_number_key";

CREATE UNIQUE INDEX "offers_offer_number_key"
ON "offers"("offer_number")
WHERE "deleted_at" IS NULL;
