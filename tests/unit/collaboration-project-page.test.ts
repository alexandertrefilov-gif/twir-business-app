import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Collaboration-Projektseite', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'app/(collaboration)/collaboration/projects/[id]/page.tsx'),
    'utf8',
  )

  it('übersetzt einen verborgenen oder fremden Projektzugriff in 404', () => {
    expect(page).toContain("import { notFound } from 'next/navigation'")
    expect(page).toContain('error instanceof NotFoundError')
    expect(page).toContain('notFound()')
  })
})
