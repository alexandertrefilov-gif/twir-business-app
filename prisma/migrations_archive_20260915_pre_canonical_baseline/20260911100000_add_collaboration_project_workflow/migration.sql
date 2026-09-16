CREATE TYPE "CollaborationProjectStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CollaborationHealthStatus" AS ENUM ('GREEN', 'YELLOW', 'RED');
CREATE TYPE "CollaborationStageStatus" AS ENUM ('NOT_STARTED', 'READY', 'IN_PROGRESS', 'WAITING_FOR_APPROVAL', 'BLOCKED', 'COMPLETED', 'SKIPPED');

ALTER TYPE "CollaborationRole" ADD VALUE 'EXTERNAL_PLANNER';
ALTER TYPE "CollaborationRole" ADD VALUE 'INTERNAL_PLANNER';
ALTER TYPE "CollaborationRole" ADD VALUE 'OPERATOR';
ALTER TYPE "CollaborationRole" ADD VALUE 'PARTNER';

ALTER TABLE "collaboration_projects"
  ADD COLUMN "actual_end" TIMESTAMP(3),
  ADD COLUMN "actual_start" TIMESTAMP(3),
  ADD COLUMN "area" TEXT,
  ADD COLUMN "building" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "floor" TEXT,
  ADD COLUMN "health_status" "CollaborationHealthStatus" NOT NULL DEFAULT 'GREEN',
  ADD COLUMN "location" TEXT,
  ADD COLUMN "planned_end" TIMESTAMP(3),
  ADD COLUMN "planned_start" TIMESTAMP(3),
  ADD COLUMN "project_number" TEXT,
  ADD COLUMN "status" "CollaborationProjectStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "year" INTEGER;

CREATE TABLE "collaboration_project_stages" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "CollaborationStageStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "requires_approval" BOOLEAN NOT NULL DEFAULT false,
  "responsible_membership_id" TEXT,
  "planned_start" TIMESTAMP(3),
  "planned_end" TIMESTAMP(3),
  "actual_start" TIMESTAMP(3),
  "actual_end" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "blocked_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collaboration_project_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collaboration_project_stage_dependencies" (
  "id" TEXT NOT NULL,
  "stage_id" TEXT NOT NULL,
  "depends_on_stage_id" TEXT NOT NULL,
  "required_status" "CollaborationStageStatus" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collaboration_project_stage_dependencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "collaboration_projects_project_number_key" ON "collaboration_projects"("project_number");
CREATE INDEX "collaboration_projects_status_deleted_at_idx" ON "collaboration_projects"("status", "deleted_at");
CREATE INDEX "collaboration_projects_health_status_deleted_at_idx" ON "collaboration_projects"("health_status", "deleted_at");
CREATE UNIQUE INDEX "collaboration_project_stages_project_id_code_key" ON "collaboration_project_stages"("project_id", "code");
CREATE UNIQUE INDEX "collaboration_project_stages_project_id_sequence_key" ON "collaboration_project_stages"("project_id", "sequence");
CREATE INDEX "collaboration_project_stages_project_id_status_idx" ON "collaboration_project_stages"("project_id", "status");
CREATE INDEX "collaboration_project_stages_responsible_membership_id_idx" ON "collaboration_project_stages"("responsible_membership_id");
CREATE UNIQUE INDEX "collaboration_project_stage_dependencies_stage_id_depends_o_key" ON "collaboration_project_stage_dependencies"("stage_id", "depends_on_stage_id");
CREATE INDEX "collaboration_project_stage_dependencies_depends_on_stage_i_idx" ON "collaboration_project_stage_dependencies"("depends_on_stage_id");

ALTER TABLE "collaboration_project_stages"
  ADD CONSTRAINT "collaboration_project_stages_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_project_stages"
  ADD CONSTRAINT "collaboration_project_stages_responsible_membership_id_fkey"
  FOREIGN KEY ("responsible_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_project_stage_dependencies"
  ADD CONSTRAINT "collaboration_project_stage_dependencies_stage_id_fkey"
  FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_project_stage_dependencies"
  ADD CONSTRAINT "collaboration_project_stage_dependencies_depends_on_stage__fkey"
  FOREIGN KEY ("depends_on_stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
