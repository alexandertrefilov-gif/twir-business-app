import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('expliziter Dual Access des Hauptadministrators', () => {
  const seed = readFileSync(resolve(process.cwd(), 'prisma/seed/seed.ts'), 'utf8')
  const internalOptions = readFileSync(resolve(process.cwd(), 'lib/auth/options.ts'), 'utf8')
  const collaborationGuard = readFileSync(resolve(process.cwd(), 'lib/auth/collaboration-guards.ts'), 'utf8')
  const collaborationService = readFileSync(resolve(process.cwd(), 'lib/services/collaboration-project.service.ts'), 'utf8')

  it('legt eine aktive projektbezogene Manager-Membership idempotent an', () => {
    expect(seed).toContain("email: 'admin@demo.local'")
    expect(seed).toContain('prisma.collaborationMembership.upsert')
    expect(seed).toContain("role: 'COLLAB_MANAGER'")
    expect(seed).toContain('userId_projectId')
  })

  it('führt keine globale interne ADMIN-Ausnahme im Collaboration-Guard ein', () => {
    expect(collaborationGuard).not.toMatch(/ADMIN|RoleName/)
    expect(collaborationGuard).toContain('prisma.collaborationMembership.findFirst')
    expect(collaborationGuard).toContain('userId')
    expect(collaborationGuard).toContain('projectId')
  })

  it('verlangt für den internen Login weiterhin eine interne Rolle', () => {
    expect(internalOptions).toContain('!user.role')
    expect(internalOptions).toContain("authScope: 'INTERNAL'")
  })

  it('liefert im Collaboration-Bereich nur die explizite Projektprojektion aus', () => {
    expect(collaborationService).toContain('const projectSelect = {')
    expect(collaborationService).toContain('stages: { orderBy: { sequence:')
    expect(collaborationService).not.toMatch(/invoice|payment|audit|calculation/i)
  })
})
