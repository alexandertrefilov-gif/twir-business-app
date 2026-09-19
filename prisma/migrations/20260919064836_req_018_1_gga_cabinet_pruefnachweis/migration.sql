-- CreateEnum
CREATE TYPE "GgaPruefart" AS ENUM ('LUEFTUNG', 'ELEKTRO', 'VDE');

-- CreateEnum
CREATE TYPE "GgaPruefergebnis" AS ENUM ('OFFEN', 'BESTANDEN', 'NICHT_BESTANDEN');

-- CreateTable
CREATE TABLE "gga_cabinet_pruefnachweise" (
    "id" TEXT NOT NULL,
    "cabinet_id" TEXT NOT NULL,
    "pruefart" "GgaPruefart" NOT NULL,
    "ergebnis" "GgaPruefergebnis" NOT NULL DEFAULT 'OFFEN',
    "pruefdatum" TIMESTAMP(3),
    "ausfuehrende_stelle" TEXT,
    "bemerkung" TEXT,
    "document_id" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gga_cabinet_pruefnachweise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gga_cabinet_pruefnachweise_cabinet_id_pruefart_idx" ON "gga_cabinet_pruefnachweise"("cabinet_id", "pruefart");

-- CreateIndex
CREATE INDEX "gga_cabinet_pruefnachweise_document_id_idx" ON "gga_cabinet_pruefnachweise"("document_id");

-- AddForeignKey
ALTER TABLE "gga_cabinet_pruefnachweise" ADD CONSTRAINT "gga_cabinet_pruefnachweise_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "gga_cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gga_cabinet_pruefnachweise" ADD CONSTRAINT "gga_cabinet_pruefnachweise_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "collaboration_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gga_cabinet_pruefnachweise" ADD CONSTRAINT "gga_cabinet_pruefnachweise_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
