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

  it('erlaubt nur den geschützten Dokumentvorschauen das Einbetten aus derselben Origin', async () => {
    const rules = await nextConfig(PHASE_PRODUCTION_SERVER).headers?.()
    const globalRule = rules?.find((rule) => rule.source === '/(.*)')
    const previewRule = rules?.find((rule) => rule.source === '/api/offers/:id/preview')
    const orderPreviewRule = rules?.find((rule) => rule.source === '/api/orders/:id/pdf')
    const archivePreviewRule = rules?.find((rule) => rule.source === '/api/document-archive/file')

    expect(globalRule?.headers).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' })
    expect(previewRule?.headers).toContainEqual({ key: 'X-Frame-Options', value: 'SAMEORIGIN' })
    expect(orderPreviewRule?.headers).toContainEqual({ key: 'X-Frame-Options', value: 'SAMEORIGIN' })
    expect(archivePreviewRule?.headers).toContainEqual({ key: 'X-Frame-Options', value: 'SAMEORIGIN' })
    expect(rules?.indexOf(previewRule!)).toBeGreaterThan(rules?.indexOf(globalRule!) ?? -1)
    expect(rules?.indexOf(orderPreviewRule!)).toBeGreaterThan(rules?.indexOf(globalRule!) ?? -1)
    expect(rules?.indexOf(archivePreviewRule!)).toBeGreaterThan(rules?.indexOf(globalRule!) ?? -1)
  })
})
