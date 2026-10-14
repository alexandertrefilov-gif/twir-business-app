-- REQ-029 M1: Positionsrabatt auf Rechnungspositionen (additiv, nullable).
-- NULL = Altbestand (vor Einführung des Rabattmodells); neue Positionen schreiben explizit einen Wert.
-- Keine Datenänderung an bestehenden Zeilen, kein Backfill.

ALTER TABLE "invoice_items"
  ADD COLUMN "discount_rate" DECIMAL(5,2);

ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_discount_rate_range_chk"
  CHECK ("discount_rate" IS NULL OR ("discount_rate" >= 0 AND "discount_rate" <= 100));
