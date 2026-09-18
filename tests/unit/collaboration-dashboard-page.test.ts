import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Collaboration-Dashboard (GGA Control Tower, REQ-014)', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'app/(collaboration)/collaboration/dashboard/page.tsx'),
    'utf8',
  )

  it('lädt den projektübergreifenden GGA Control Tower über die dafür vorgesehene Service-Funktion', () => {
    expect(page).toContain("import { getGgaControlTowerOverview } from '@/lib/services/gga-cabinet.service'")
    expect(page).toContain('getGgaControlTowerOverview()')
  })

  it('zeigt die drei geforderten Ebenen: Gesamtübersicht, Projektübersicht, dringende Schränke', () => {
    expect(page).toContain('GGA Control Tower')
    expect(page).toContain('GGA-Projektübersicht')
    expect(page).toContain('Dringende GGA-Schränke')
  })

  it('verlinkt direkt auf Projekt- und Schrankseiten statt eine eigene Detailansicht zu bauen', () => {
    expect(page).toContain('href={`/collaboration/projects/${project.projectId}`}')
    expect(page).toContain('href={`/collaboration/cabinets/${cabinet.cabinetId}`}')
  })

  it('behandelt "keine GGA-Projekte" und "keine dringenden Schränke" als eigene Leerzustände', () => {
    expect(page).toContain('Keine GGA-Schränke in den für Sie sichtbaren Projekten.')
    expect(page).toContain('Keine dringenden GGA-Schränke — alles im grünen Bereich.')
  })
})
