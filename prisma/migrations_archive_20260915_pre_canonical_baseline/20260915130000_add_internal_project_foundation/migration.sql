CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ProjectParticipantRole" AS ENUM ('PROJECT_LEAD', 'PROJECT_MEMBER', 'OBSERVER');

CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "project_number" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "customer_id" TEXT NOT NULL,
  "lead_user_id" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "location" TEXT,
  "building" TEXT,
  "floor" TEXT,
  "area" TEXT,
  "planned_start" TIMESTAMP(3),
  "planned_end" TIMESTAMP(3),
  "actual_start" TIMESTAMP(3),
  "actual_end" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_participants" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "ProjectParticipantRole" NOT NULL DEFAULT 'PROJECT_MEMBER',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_participants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "offers" ADD COLUMN "project_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "project_id" TEXT;
ALTER TABLE "invoices" ADD COLUMN "project_id" TEXT;
ALTER TABLE "documents" ADD COLUMN "project_id" TEXT;
ALTER TABLE "collaboration_projects" ADD COLUMN "internal_project_id" TEXT;

CREATE UNIQUE INDEX "projects_project_number_key" ON "projects"("project_number");
CREATE INDEX "projects_customer_id_deleted_at_idx" ON "projects"("customer_id", "deleted_at");
CREATE INDEX "projects_lead_user_id_idx" ON "projects"("lead_user_id");
CREATE INDEX "projects_status_deleted_at_idx" ON "projects"("status", "deleted_at");
CREATE UNIQUE INDEX "project_participants_project_id_user_id_key" ON "project_participants"("project_id", "user_id");
CREATE INDEX "project_participants_user_id_idx" ON "project_participants"("user_id");
CREATE INDEX "offers_project_id_idx" ON "offers"("project_id");
CREATE INDEX "orders_project_id_idx" ON "orders"("project_id");
CREATE INDEX "invoices_project_id_idx" ON "invoices"("project_id");
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");
CREATE UNIQUE INDEX "collaboration_projects_internal_project_id_key" ON "collaboration_projects"("internal_project_id");

ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_user_id_fkey" FOREIGN KEY ("lead_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offers" ADD CONSTRAINT "offers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_projects" ADD CONSTRAINT "collaboration_projects_internal_project_id_fkey" FOREIGN KEY ("internal_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
