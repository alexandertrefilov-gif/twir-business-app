CREATE TYPE "OrderConfirmationType" AS ENUM (
  'SIGNED_DOCUMENT',
  'EMAIL',
  'VERBAL',
  'CUSTOMER_PURCHASE_ORDER',
  'NOT_REQUIRED'
);

ALTER TABLE "orders"
  ADD COLUMN "confirmation_type" "OrderConfirmationType",
  ADD COLUMN "confirmation_note" TEXT;
