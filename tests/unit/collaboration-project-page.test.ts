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

  it('REQ-013: zeigt neutrale Texte für fehlende Verantwortliche/Fristen statt sie zu verwerfen', () => {
    expect(page).toContain('Nicht zugewiesen')
    expect(page).toContain('Keine Frist hinterlegt')
  })

  it('REQ-013: behandelt "keine Schränke" und "keine offene Arbeit" als zwei unterschiedliche Leerzustände', () => {
    expect(page).toContain('Noch keine GGA-Schränke in diesem Projekt.')
    expect(page).toContain('Keine offenen GGA-Fristen oder nächsten Aktionen.')
  })
})
