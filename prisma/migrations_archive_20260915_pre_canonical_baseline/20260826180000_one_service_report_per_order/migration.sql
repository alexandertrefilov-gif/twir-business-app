-- Fachliche Invariante: Pro Auftrag darf höchstens ein Leistungsnachweis existieren.
-- Vorhandene Duplikate werden bewusst nicht automatisch gelöscht oder verändert.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "service_reports"
    GROUP BY "order_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration abgebrochen: Es existieren Aufträge mit mehreren Leistungsnachweisen. Datenbestand zuerst fachlich prüfen und manuell bereinigen.';
  END IF;
END $$;

DROP INDEX IF EXISTS "service_reports_order_id_idx";
CREATE UNIQUE INDEX "service_reports_order_id_key" ON "service_reports"("order_id");
