-- CreateEnum
CREATE TYPE "GgaExAssessmentStatus" AS ENUM ('NOT_ASSESSED', 'REQUIRED', 'NOT_REQUIRED');

-- AlterTable
ALTER TABLE "collaboration_approvals" ADD COLUMN     "cabinet_id" TEXT;

-- AlterTable
ALTER TABLE "collaboration_blockers" ADD COLUMN     "cabinet_id" TEXT;

-- AlterTable
ALTER TABLE "collaboration_checklist_items" ADD COLUMN     "cabinet_id" TEXT;

-- AlterTable
ALTER TABLE "collaboration_tasks" ADD COLUMN     "cabinet_id" TEXT;

-- CreateTable
CREATE TABLE "gga_cabinets" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "kennung" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "hersteller_name" TEXT,
    "hersteller_typ" TEXT,
    "seriennummer" TEXT,
    "baujahr" INTEGER,
    "gebaeude" TEXT,
    "ebene" TEXT,
    "raumbezeichnung" TEXT,
    "standort_beschreibung" TEXT,
    "nutzungsart" TEXT,
    "lagerklasse" TEXT,
    "max_lagermenge_kg" DECIMAL(10,2),
    "bestands_beschreibung" TEXT,
    "bestandsaufnahme_am" TIMESTAMP(3),
    "abluft_vorhanden" BOOLEAN NOT NULL DEFAULT false,
    "abluft_anschlussdurchmesser_soll_mm" INTEGER,
    "abluft_volumenstrom_soll_m3h" DECIMAL(8,2),
    "abluft_ueberwachung" BOOLEAN NOT NULL DEFAULT false,
    "abluft_volumenstrom_ist_m3h" DECIMAL(8,2),
    "elektrisch_ausgestattet" BOOLEAN NOT NULL DEFAULT false,
    "spannung_volt" DECIMAL(6,1),
    "potentialausgleich" BOOLEAN NOT NULL DEFAULT false,
    "ex_assessment_status" "GgaExAssessmentStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "ex_zone_klassifikation" TEXT,
    "pruefintervall_monate" INTEGER,
    "letzte_pruefung_am" TIMESTAMP(3),
    "pruefpflicht_norm" TEXT,
    "responsible_membership_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,

    CONSTRAINT "gga_cabinets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_documents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "cabinet_id" TEXT,
    "document_kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "checksum" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "collaboration_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gga_cabinets_project_id_deleted_at_idx" ON "gga_cabinets"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "gga_cabinets_responsible_membership_id_idx" ON "gga_cabinets"("responsible_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "gga_cabinets_project_id_kennung_key" ON "gga_cabinets"("project_id", "kennung");

-- CreateIndex
CREATE INDEX "collaboration_documents_project_id_deleted_at_idx" ON "collaboration_documents"("project_id", "deleted_at");

-- CreateIndex
CREATE INDEX "collaboration_documents_cabinet_id_idx" ON "collaboration_documents"("cabinet_id");

-- CreateIndex
CREATE INDEX "collaboration_approvals_cabinet_id_idx" ON "collaboration_approvals"("cabinet_id");

-- CreateIndex
CREATE INDEX "collaboration_blockers_cabinet_id_idx" ON "collaboration_blockers"("cabinet_id");

-- CreateIndex
CREATE INDEX "collaboration_checklist_items_cabinet_id_idx" ON "collaboration_checklist_items"("cabinet_id");

-- CreateIndex
CREATE INDEX "collaboration_tasks_cabinet_id_idx" ON "collaboration_tasks"("cabinet_id");

-- AddForeignKey
ALTER TABLE "collaboration_tasks" ADD CONSTRAINT "collaboration_tasks_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "gga_cabinets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_checklist_items" ADD CONSTRAINT "collaboration_checklist_items_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "gga_cabinets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "gga_cabinets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_approvals" ADD CONSTRAINT "collaboration_approvals_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "gga_cabinets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gga_cabinets" ADD CONSTRAINT "gga_cabinets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gga_cabinets" ADD CONSTRAINT "gga_cabinets_responsible_membership_id_fkey" FOREIGN KEY ("responsible_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gga_cabinets" ADD CONSTRAINT "gga_cabinets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_documents" ADD CONSTRAINT "collaboration_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_documents" ADD CONSTRAINT "collaboration_documents_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "gga_cabinets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_documents" ADD CONSTRAINT "collaboration_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
