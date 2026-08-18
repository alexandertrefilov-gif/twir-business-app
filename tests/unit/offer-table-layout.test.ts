import { describe, expect, it } from 'vitest'
import { getTableColumnPercentages, type RichTextNode } from '@/lib/offers/rich-text'

function cell(
  text: string,
  attrs?: Record<string, unknown>,
  type = 'tableCell',
): RichTextNode {
  return {
    type,
    attrs,
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text }],
    }],
  }
}

function table(rows: RichTextNode[][]): RichTextNode {
  return {
    type: 'table',
    content: rows.map((content) => ({ type: 'tableRow', content })),
  }
}

describe('Tabellenbreiten für Editor, Vorschau und PDF', () => {
  it('normalisiert vier absolute Word-Spalten proportional auf 100 Prozent', () => {
    const percentages = getTableColumnPercentages(table([[
      cell('2026 / Monaten', { colspan: 1, colwidth: [90] }, 'tableHeader'),
      cell('Meilenstein / KPI', { colspan: 1, colwidth: [270] }, 'tableHeader'),
      cell('Projektphase', { colspan: 1, colwidth: [180] }, 'tableHeader'),
      cell('Betrag (EUR)', { colspan: 1, colwidth: [120] }, 'tableHeader'),
    ]]))

    expect(percentages.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100)
    expect(percentages[0]).toBeGreaterThanOrEqual(15)
    expect(percentages[1]).toBeGreaterThan(percentages[2])
    expect(percentages[2]).toBeGreaterThan(percentages[0])
    expect(percentages[3]).toBeGreaterThanOrEqual(15)
  })

  it('verhindert den Kollaps extrem schmaler Word-Spalten', () => {
    const percentages = getTableColumnPercentages(table([[
      cell('A1', { colspan: 1, colwidth: [2] }),
      cell('Abschluss Anforderungsanalyse', { colspan: 1, colwidth: [500] }),
      cell('Grundlagenphase', { colspan: 1, colwidth: [120] }),
      cell('1.000,00 EUR', { colspan: 1, colwidth: [80] }),
    ]]))

    expect(Math.min(...percentages)).toBeGreaterThanOrEqual(15)
    expect(percentages.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100)
  })

  it('ueberstimmt problematische Word-Breiten zugunsten langer untrennbarer Woerter', () => {
    const percentages = getTableColumnPercentages(table([[
      cell('Produktionsreifeprüfungsanforderungen', { colwidth: [25] }),
      cell('Kurz', { colwidth: [575] }),
    ]]))

    expect(percentages[0]).toBeGreaterThan(35)
    expect(percentages.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100)
  })

  it('verteilt Tabellen ohne Breiten anhand des Inhalts statt blind gleichmäßig', () => {
    const percentages = getTableColumnPercentages(table([[
      cell('A1'),
      cell('Abnahme erster End-to-End Tests und Architekturfreigabe'),
      cell('Grundlagenphase'),
      cell('EUR'),
    ]]))

    expect(percentages[1]).toBe(Math.max(...percentages))
    expect(percentages.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100)
  })

  it('berücksichtigt colspan und behält bei rowspan ein stabiles Spaltenraster', () => {
    const percentages = getTableColumnPercentages(table([
      [
        cell('Projekt', { colspan: 2, rowspan: 2, colwidth: [120, 280] }),
        cell('Betrag', { colspan: 1, rowspan: 1, colwidth: [160] }),
      ],
      [
        cell('A1'),
        cell('Meilenstein'),
        cell('1.000 EUR'),
      ],
    ]))

    expect(percentages).toHaveLength(3)
    expect(percentages.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100)
  })

  it('lässt normalen Fließtext und lange deutsche Wörter strukturell unverändert', () => {
    const source = 'Produktionsreifeprüfungsanforderungen'
    const node = table([[cell(source)]])
    expect(node.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe(source)
    expect(getTableColumnPercentages(node)).toEqual([100])
  })
})
