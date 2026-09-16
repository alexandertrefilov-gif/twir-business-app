-- Additive delivery lifecycle metadata. Existing operational status values stay unchanged.
ALTER TYPE "DocumentType" ADD VALUE 'ORDER_CONFIRMATION';
ALTER TYPE "DocumentType" ADD VALUE 'SERVICE_REPORT_CONFIRMATION';

ALTER TABLE "orders"
  ADD COLUMN "sent_at" TIMESTAMP(3),
  ADD COLUMN "confirmed_at" TIMESTAMP(3);

ALTER TABLE "service_reports"
  ADD COLUMN "sent_at" TIMESTAMP(3),
  ADD COLUMN "confirmed_at" TIMESTAMP(3);
