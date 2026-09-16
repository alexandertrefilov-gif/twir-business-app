-- A user may be collaboration-only and therefore have no internal role.
ALTER TABLE "users" ALTER COLUMN "role_id" DROP NOT NULL;

CREATE TYPE "CollaborationRole" AS ENUM (
  'COLLAB_VIEWER',
  'COLLAB_MEMBER',
  'COLLAB_MANAGER'
);

CREATE TABLE "collaboration_projects" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "collaboration_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collaboration_memberships" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "role" "CollaborationRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collaboration_memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "collaboration_projects_active_deleted_at_idx"
  ON "collaboration_projects"("active", "deleted_at");
CREATE INDEX "collaboration_memberships_user_id_active_idx"
  ON "collaboration_memberships"("user_id", "active");
CREATE INDEX "collaboration_memberships_project_id_active_idx"
  ON "collaboration_memberships"("project_id", "active");
CREATE UNIQUE INDEX "collaboration_memberships_user_id_project_id_key"
  ON "collaboration_memberships"("user_id", "project_id");

ALTER TABLE "collaboration_memberships"
  ADD CONSTRAINT "collaboration_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "collaboration_memberships"
  ADD CONSTRAINT "collaboration_memberships_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
