-- CreateEnum
CREATE TYPE "CollaborationDocumentVisibility" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "CollaborationApprovalType" AS ENUM ('INTERNAL', 'OPERATOR_ACCEPTANCE');

-- AlterTable
ALTER TABLE "collaboration_approvals" ADD COLUMN     "approval_type" "CollaborationApprovalType" NOT NULL DEFAULT 'INTERNAL';

-- AlterTable
ALTER TABLE "collaboration_documents" ADD COLUMN     "visibility" "CollaborationDocumentVisibility" NOT NULL DEFAULT 'INTERNAL';

-- CreateIndex
CREATE INDEX "collaboration_approvals_cabinet_id_approval_type_requested__idx" ON "collaboration_approvals"("cabinet_id", "approval_type", "requested_at");

-- CreateIndex
CREATE INDEX "collaboration_documents_cabinet_id_visibility_idx" ON "collaboration_documents"("cabinet_id", "visibility");

-- Partieller Unique-Index: verhindert auf DB-Ebene, dass fuer dasselbe
-- Cabinet gleichzeitig zwei offene (REQUESTED) Freigaben desselben Typs
-- entstehen -- der eigentliche Concurrency-/Doppelklick-Schutz. Gilt fuer
-- INTERNAL wie OPERATOR_ACCEPTANCE gleichermassen, betrifft aber praktisch
-- nur cabinet-gebundene Freigaben (cabinet_id IS NOT NULL).
CREATE UNIQUE INDEX "collaboration_approvals_open_per_cabinet_type_key"
  ON "collaboration_approvals"("cabinet_id", "approval_type")
  WHERE "status" = 'REQUESTED' AND "cabinet_id" IS NOT NULL;
