import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: { auditLog: { create: vi.fn() } } }))
vi.unmock('@/lib/services/audit.service')

import { buildAuditLogCreate } from '@/lib/services/audit.service'

describe('transaktionales Audit', () => {
  it('verwendet den übergebenen TransactionClient', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-1' })
    await buildAuditLogCreate({ auditLog: { create } } as never, { action: 'CREATE', entityType: 'invoice', entityId: 'invoice-1' })
    expect(create).toHaveBeenCalledOnce()
  })

  it('propagiert Auditfehler, damit die Fachtransaktion zurückrollen kann', async () => {
    const error = new Error('audit failed')
    const create = vi.fn().mockRejectedValue(error)
    await expect(buildAuditLogCreate({ auditLog: { create } } as never, { action: 'CREATE', entityType: 'invoice', entityId: 'invoice-1' })).rejects.toBe(error)
  })
})
