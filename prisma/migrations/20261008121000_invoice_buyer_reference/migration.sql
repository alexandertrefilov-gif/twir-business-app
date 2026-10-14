-- REQ-029 M2: Käuferreferenz (XRechnung BT-10) an der Rechnung (additiv, nullable).
-- Keine automatische Leitweg-ID, kein Backfill, keine Änderung bestehender Rechnungen.
-- CHECK: gespeicherte Länge 1–255 Zeichen UND nicht nur aus Leerzeichen/Tab/CR/LF bestehend
-- (keine vollständige Unicode-Whitespace-Prüfung; die Anwendungsvalidierung bleibt zusätzlich verpflichtend).

ALTER TABLE "invoices"
  ADD COLUMN "buyer_reference" TEXT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_buyer_reference_len_chk"
  CHECK (
    "buyer_reference" IS NULL
    OR (
      char_length("buyer_reference") BETWEEN 1 AND 255
      AND char_length(btrim("buyer_reference", E' \t\r\n')) >= 1
    )
  );
