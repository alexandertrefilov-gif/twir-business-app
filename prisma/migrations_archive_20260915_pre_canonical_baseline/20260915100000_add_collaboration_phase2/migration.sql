CREATE TYPE "CollaborationTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'SKIPPED');
CREATE TYPE "CollaborationTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "CollaborationBlockerStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "CollaborationApprovalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

CREATE TABLE "collaboration_tasks" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "stage_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "CollaborationTaskStatus" NOT NULL DEFAULT 'TODO',
  "priority" "CollaborationTaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "responsible_membership_id" TEXT,
  "due_date" TIMESTAMP(3),
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collaboration_tasks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "collaboration_checklist_items" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "stage_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "responsible_membership_id" TEXT,
  "completed_at" TIMESTAMP(3),
  "completed_by_membership_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collaboration_checklist_items_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "collaboration_blockers" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "stage_id" TEXT,
  "task_id" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "CollaborationBlockerStatus" NOT NULL DEFAULT 'OPEN',
  "responsible_membership_id" TEXT,
  "cause" TEXT,
  "resolution" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolved_by_id" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collaboration_blockers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "collaboration_approvals" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "stage_id" TEXT NOT NULL,
  "status" "CollaborationApprovalStatus" NOT NULL DEFAULT 'REQUESTED',
  "requested_by_id" TEXT NOT NULL,
  "decided_by_id" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMP(3),
  "decision_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collaboration_approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "collaboration_tasks_project_id_status_idx" ON "collaboration_tasks"("project_id","status");
CREATE INDEX "collaboration_tasks_stage_id_sequence_idx" ON "collaboration_tasks"("stage_id","sequence");
CREATE INDEX "collaboration_tasks_responsible_membership_id_idx" ON "collaboration_tasks"("responsible_membership_id");
CREATE INDEX "collaboration_checklist_items_project_id_completed_idx" ON "collaboration_checklist_items"("project_id","completed");
CREATE INDEX "collaboration_checklist_items_stage_id_sequence_idx" ON "collaboration_checklist_items"("stage_id","sequence");
CREATE INDEX "collaboration_checklist_items_responsible_membership_id_idx" ON "collaboration_checklist_items"("responsible_membership_id");
CREATE INDEX "collaboration_blockers_project_id_status_idx" ON "collaboration_blockers"("project_id","status");
CREATE INDEX "collaboration_blockers_stage_id_status_idx" ON "collaboration_blockers"("stage_id","status");
CREATE INDEX "collaboration_blockers_task_id_status_idx" ON "collaboration_blockers"("task_id","status");
CREATE INDEX "collaboration_approvals_project_id_status_idx" ON "collaboration_approvals"("project_id","status");
CREATE INDEX "collaboration_approvals_stage_id_status_idx" ON "collaboration_approvals"("stage_id","status");
ALTER TABLE "collaboration_tasks" ADD CONSTRAINT "collaboration_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_tasks" ADD CONSTRAINT "collaboration_tasks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_tasks" ADD CONSTRAINT "collaboration_tasks_responsible_membership_id_fkey" FOREIGN KEY ("responsible_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_checklist_items" ADD CONSTRAINT "collaboration_checklist_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_checklist_items" ADD CONSTRAINT "collaboration_checklist_items_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_checklist_items" ADD CONSTRAINT "collaboration_checklist_items_completed_by_membership_id_fkey" FOREIGN KEY ("completed_by_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_checklist_items" ADD CONSTRAINT "collaboration_checklist_items_responsible_membership_id_fkey" FOREIGN KEY ("responsible_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "collaboration_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_responsible_membership_id_fkey" FOREIGN KEY ("responsible_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_approvals" ADD CONSTRAINT "collaboration_approvals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_approvals" ADD CONSTRAINT "collaboration_approvals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_approvals" ADD CONSTRAINT "collaboration_approvals_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "collaboration_approvals" ADD CONSTRAINT "collaboration_approvals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
