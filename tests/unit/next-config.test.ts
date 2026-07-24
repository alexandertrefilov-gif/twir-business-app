import { describe, expect, it } from 'vitest'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants.js'
import nextConfig from '@/next.config.mjs'

describe('Next.js Build-Verzeichnisse', () => {
  it('trennt Entwicklungsartefakte von Produktionsartefakten', () => {
    expect(nextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe('.next-dev')
    expect(nextConfig(PHASE_PRODUCTION_BUILD).distDir).toBeUndefined()
    expect(nextConfig(PHASE_PRODUCTION_SERVER).distDir).toBeUndefined()
  })
})
