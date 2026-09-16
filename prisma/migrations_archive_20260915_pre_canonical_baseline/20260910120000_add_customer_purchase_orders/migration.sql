CREATE TABLE "customer_purchase_orders" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" TEXT,
    "order_date" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_purchase_orders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "documents" ADD COLUMN "customer_purchase_order_id" TEXT;

CREATE UNIQUE INDEX "customer_purchase_orders_offer_id_key" ON "customer_purchase_orders"("offer_id");
CREATE UNIQUE INDEX "customer_purchase_orders_order_id_key" ON "customer_purchase_orders"("order_id");
CREATE INDEX "customer_purchase_orders_customer_id_idx" ON "customer_purchase_orders"("customer_id");
CREATE INDEX "customer_purchase_orders_created_by_id_idx" ON "customer_purchase_orders"("created_by_id");
CREATE INDEX "documents_customer_purchase_order_id_idx" ON "documents"("customer_purchase_order_id");

ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_purchase_order_id_fkey" FOREIGN KEY ("customer_purchase_order_id") REFERENCES "customer_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
