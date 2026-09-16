CREATE TYPE "DocumentFormat" AS ENUM ('PDF', 'DOCX', 'JSON', 'OTHER');
CREATE TYPE "DocumentLifecycle" AS ENUM ('DRAFT', 'FINAL', 'UPLOAD');
CREATE TYPE "ArchiveStatus" AS ENUM ('PENDING', 'ARCHIVED', 'FAILED');
CREATE TYPE "ServiceReportStatus" AS ENUM ('DRAFT', 'FINALIZED');

ALTER TYPE "AuditAction" ADD VALUE 'ARCHIVE_SUCCEEDED';
ALTER TYPE "AuditAction" ADD VALUE 'ARCHIVE_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'ARCHIVE_RETRIED';
ALTER TYPE "AuditAction" ADD VALUE 'ARCHIVE_TESTED';

ALTER TABLE "service_reports"
  ADD COLUMN "status" "ServiceReportStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "finalized_at" TIMESTAMP(3),
  ADD COLUMN "customer_snapshot" JSONB,
  ADD COLUMN "company_snapshot" JSONB;

ALTER TABLE "offers" ADD COLUMN "company_snapshot" JSONB;
ALTER TABLE "orders" ADD COLUMN "company_snapshot" JSONB;

ALTER TABLE "documents"
  ADD COLUMN "format" "DocumentFormat" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "lifecycle" "DocumentLifecycle" NOT NULL DEFAULT 'UPLOAD',
  ADD COLUMN "archive_status" "ArchiveStatus" NOT NULL DEFAULT 'ARCHIVED',
  ADD COLUMN "archive_error" TEXT,
  ADD COLUMN "archive_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_archive_attempt_at" TIMESTAMP(3),
  ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "documents_archive_status_idx" ON "documents"("archive_status");
CREATE INDEX "documents_lifecycle_idx" ON "documents"("lifecycle");

ALTER TABLE "company_settings"
  ADD COLUMN "document_archive_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "document_archive_path" TEXT,
  ADD COLUMN "document_archive_json_enabled" BOOLEAN NOT NULL DEFAULT true;
