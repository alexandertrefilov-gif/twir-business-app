import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: { auditLog: { create: vi.fn() } } }))
vi.unmock('@/lib/services/audit.service')

import { buildAuditLogCreate } from '@/lib/services/audit.service'

describe('Adress-Audit-Log — Regression für gespreadeten Actor mit role', () => {
  it('customer-address.service.ts schreibt Audit-Logs nur noch über buildAuditLogCreate, nie über rohes tx.auditLog.create', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/services/customer-address.service.ts'), 'utf8')
    expect(source).not.toMatch(/tx\.auditLog\.create/)
    expect(source.match(/buildAuditLogCreate\(tx,/g)?.length).toBeGreaterThanOrEqual(7)
  })

  it('lässt ein aus requirePermission() stammendes Actor-Objekt mit zusätzlichem role-Feld nicht in die Prisma-Query durchsickern', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-1' })
    const actorWithRole = { userId: 'user-1', userEmail: 'admin@demo.local', role: 'ADMIN' } as const
    await buildAuditLogCreate({ auditLog: { create } } as never, {
      ...actorWithRole,
      action: 'CREATE',
      entityType: 'address',
      entityId: 'address-1',
      newValue: { companyName: 'Test GmbH', city: 'Stuttgart' },
    })
    expect(create).toHaveBeenCalledOnce()
    const data = create.mock.calls[0][0].data
    expect(data).not.toHaveProperty('role')
    expect(Object.keys(data).sort()).toEqual(['action', 'entityId', 'entityType', 'metadata', 'newValue', 'oldValue', 'userEmail', 'userId'].sort())
  })
})
