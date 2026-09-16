import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import PortalPage from '@/app/(public)/page'

describe('öffentliches TWIR Portal', () => {
  const portal = readFileSync(resolve(process.cwd(), 'app/(public)/page.tsx'), 'utf8')
  const card = readFileSync(resolve(process.cwd(), 'components/portal/PortalAccessCard.tsx'), 'utf8')
  const html = renderToStaticMarkup(<PortalPage />)

  it('verlinkt ausschließlich auf die getrennten Loginbereiche', () => {
    expect(html).toContain('href="/intern/login"')
    expect(html).toContain('href="/collaboration/login"')
  })

  it('rendert statisch ohne geschützte Datenquellen', () => {
    const sources = [portal, card,
      readFileSync(resolve(process.cwd(), 'components/portal/PortalHeader.tsx'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'components/portal/PortalHero.tsx'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'components/portal/PortalTrustBar.tsx'), 'utf8'),
    ].join('\n')
    expect(sources).not.toMatch(/prisma|getServerSession|Customer|Invoice|fetch\(/)
  })

  it('besitzt semantische Überschriften und sichtbare Tastaturfokus-Stile', () => {
    expect(html).toContain('<h1')
    expect(html).toContain('Portalbereiche auswählen')
    expect(card).toContain('focus-visible:ring-2')
  })

  it('stapelt mobil und verwendet erst ab Tablet zwei Spalten ohne horizontalen Überlauf', () => {
    expect(portal).toContain('overflow-x-hidden')
    expect(portal).toContain('md:grid-cols-2')
    expect(card).toContain('min-w-0')
  })
})
