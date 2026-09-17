import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findSettings: vi.fn(),
  ensureDirectory: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: { companySetting: { findFirst: mocks.findSettings } },
}))

vi.mock('@/lib/documents/archive-storage', () => ({
  LocalFilesystemArchiveStorage: class {
    ensureDirectory = mocks.ensureDirectory
  },
}))

import { ensureCustomerArchiveDirectory } from '@/lib/documents/customer-archive.service'

describe('Kundenordner im Dokumentenarchiv', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a deterministic year/customer directory when the archive is enabled', async () => {
    mocks.findSettings.mockResolvedValue({ documentArchiveEnabled: true, documentArchivePath: '/archive' })
    mocks.ensureDirectory.mockResolvedValue(undefined)

    await expect(ensureCustomerArchiveDirectory({
      number: 'KD-0003',
      name: 'Müller GmbH',
      createdAt: new Date('2026-04-20T12:00:00Z'),
    })).resolves.toEqual({ status: 'created', relativePath: '2026/KD-0003_Muller-GmbH' })
    expect(mocks.ensureDirectory).toHaveBeenCalledWith('2026/KD-0003_Muller-GmbH')
  })

  it('does not touch storage while the archive is disabled', async () => {
    mocks.findSettings.mockResolvedValue({ documentArchiveEnabled: false, documentArchivePath: null })
    await expect(ensureCustomerArchiveDirectory({ number: 'KD-0003', name: 'Kunde' })).resolves.toEqual({ status: 'disabled' })
    expect(mocks.ensureDirectory).not.toHaveBeenCalled()
  })
})
