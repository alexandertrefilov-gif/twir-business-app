import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  scripts?: Record<string, string>
}

describe('Prisma-Installationsskripte', () => {
  it('generiert den Prisma Client ohne Migration oder Schemaänderung', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as PackageManifest

    expect(manifest.scripts?.['db:generate']).toBe('prisma generate')
    expect(manifest.scripts?.postinstall).toBe('prisma generate')
    expect(manifest.scripts?.postinstall).not.toMatch(/\bmigrate\b|\bdb push\b|\bdeploy\b/)
  })
})
