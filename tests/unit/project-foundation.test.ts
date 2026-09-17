import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { ProjectInputSchema, ProjectParticipantInputSchema } from '@/lib/validators/project.schema'
import { Action, Resource, roleHasPermission } from '@/lib/auth/permissions'

describe('Internal Project Foundation', () => {
  const input = { projectNumber: 'Ki_02_003', name: 'Umstellung Geb. 2 → 7 Versuchsgießerei ISH', customerId: '00000000-0000-0000-0000-000000000001', status: 'PLANNED', location: 'Werk 10', building: 'Gebäude 2 und 7', floor: 'EG', area: 'Mettingen' }
  it('validiert den kanonischen Projektkontext', () => expect(ProjectInputSchema.safeParse(input).success).toBe(true))
  it('lehnt ungültige Projektdaten und Teilnehmerrollen ab', () => { expect(ProjectInputSchema.safeParse({ ...input, projectNumber: '' }).success).toBe(false); expect(ProjectParticipantInputSchema.safeParse({ userId: input.customerId, role: 'COLLAB_MANAGER' }).success).toBe(false) })
  it('hält Projektmutationen intern berechtigt', () => { expect(roleHasPermission('PROJECT_MANAGER', Resource.PROJECT, Action.CREATE)).toBe(true); expect(roleHasPermission('EMPLOYEE', Resource.PROJECT, Action.UPDATE)).toBe(false) })
  it('enthält ausschließlich additive Project-Foundation-SQL', () => { const sql=fs.readFileSync('prisma/migrations_archive_20260915_pre_canonical_baseline/20260915130000_add_internal_project_foundation/migration.sql','utf8'); expect(sql).toContain('CREATE TABLE "projects"'); expect(sql).toContain('ADD COLUMN "internal_project_id"'); expect(sql).not.toMatch(/(?:^|\n)\s*(DROP|DELETE|TRUNCATE)\b/m) })
})
