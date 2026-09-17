import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    companySetting: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}))

import {
  getCompanyLogoScale,
  saveCompanyLogoScale,
} from '@/lib/services/settings.service'

describe('persistente Firmenlogo-Größe', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([100, 140, 150])(
    'speichert und lädt %i Prozent aus CompanySetting',
    async (logoScale) => {
      mocks.update.mockResolvedValue({})
      mocks.findUnique.mockResolvedValue({ logoScale })

      await saveCompanyLogoScale(logoScale)
      const reloaded = await getCompanyLogoScale()

      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: '00000000-0000-0000-0000-000000000001' },
        data: { logoScale },
      })
      expect(reloaded).toBe(logoScale)
    },
  )
})
