import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const table = readFileSync(resolve(process.cwd(), 'components/offers/OfferTable.tsx'), 'utf8')

describe('Aktionsspalte der Angebotsübersicht', () => {
  it('ordnet Kopieren und Löschen in getrennten Spalten an', () => {
    expect(table).toContain('inline-flex h-8 items-center justify-center')
    expect(table).not.toContain('className="mr-2 inline-flex min-h-8')
    expect(table).toContain('<RecordDeleteButton id={o.id} type="offer" />')
    expect(table).toContain('<th className="w-px whitespace-nowrap text-center">Löschen</th>')
    expect(table).toContain('colSpan={9}')
  })

  it('verhindert Umbrüche in den kompakten Daten- und Aktionszellen', () => {
    expect(table.match(/className="whitespace-nowrap/g)?.length).toBeGreaterThanOrEqual(6)
    expect(table).toContain('className="w-px whitespace-nowrap text-center" onClick=')
  })

  it('richtet Brutto rechts und Aktion am Beginn des Kopieren-Buttons aus', () => {
    expect(table).toContain('label="Brutto" field="totalGross" params={params} nav={nav} align="right"')
    expect(table).toContain('className="w-px whitespace-nowrap text-left"')
    expect(table).toContain('<span className="flex justify-start">Aktion</span>')
    expect(table).toContain("align === 'right' ? 'justify-end' : ''")
  })
})
