import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildServiceReportDocumentSections,
} from '@/lib/documents/service-report-document'
import { decodeOfferText, encodeOfferText } from '@/lib/offers/rich-text'

const richText = encodeOfferText({
  version: 1,
  positionsAfterSectionId: 'scope',
  sections: [
    { id: 'scope', title: 'Leistungsumfang', content: { type: 'doc', content: [] } },
    { id: 'calculation', title: 'Kalkulation', content: { type: 'doc', content: [] } },
    { id: 'payment', title: 'Zahlung und Meilensteine', content: { type: 'doc', content: [] } },
    { id: 'confidentiality', title: 'Verschwiegenheit', content: { type: 'doc', content: [] } },
  ],
})

describe('Leistungsnachweis-Dokumentreihenfolge', () => {
  it('ordnet Rich-Text, Positionen und Signaturen zentral und jeweils genau einmal', () => {
    const items = [{ position: 1, description: 'Montage' }]
    const sections = buildServiceReportDocumentSections({
      description: richText,
      items,
      preparedBy: 'Erika Muster',
      customerName: 'Kunde GmbH',
    })

    expect(sections.map((section) => section.id)).toEqual([
      'richText:scope',
      'positions',
      'richText:calculation',
      'richText:payment',
      'richText:confidentiality',
      'signatures',
    ])
    expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length)
    expect(sections[0]).toMatchObject({ kind: 'richText', sectionId: 'scope' })
    expect(sections[1]).toMatchObject({ kind: 'positions', items })
    expect(sections.at(-1)).toMatchObject({ kind: 'signatures', preparedBy: 'Erika Muster', customerName: 'Kunde GmbH' })
  })

  it('bewahrt die fachliche Reihenfolge der Rich-Text-Unterabschnitte unverändert', () => {
    const sections = buildServiceReportDocumentSections({
      description: richText,
      items: [],
      preparedBy: 'Erika Muster',
      customerName: 'Kunde GmbH',
    })

    expect(sections.filter((section) => section.kind === 'richText').map((section) => {
      if (section.kind !== 'richText') throw new Error('Rich-Text-Abschnitt fehlt')
      return decodeOfferText(section.value).sections[0]?.title
    })).toEqual([
      'Leistungsumfang',
      'Kalkulation',
      'Zahlung und Meilensteine',
      'Verschwiegenheit',
    ])
  })

  it('lässt optionale leere Inhaltsbereiche aus, hält Signaturen aber stets am Ende', () => {
    expect(buildServiceReportDocumentSections({
      description: null,
      items: [],
      preparedBy: 'Erika Muster',
      customerName: 'Kunde GmbH',
    }).map((section) => section.id)).toEqual(['signatures'])
  })

  it('ordnet bestehende Nachweise ohne gespeicherten Anker rückwärtskompatibel nach dem ersten Bereich ein', () => {
    const legacy = encodeOfferText({
      version: 1,
      sections: [
        { id: 'first', title: 'Bereich 1', content: { type: 'doc', content: [] } },
        { id: 'second', title: 'Bereich 2', content: { type: 'doc', content: [] } },
      ],
    })
    const sections = buildServiceReportDocumentSections({
      description: legacy,
      items: [{ position: 1 }],
      preparedBy: 'Erika Muster',
      customerName: 'Kunde GmbH',
    })

    expect(sections.map((section) => section.id)).toEqual([
      'richText:first',
      'positions',
      'richText:second',
      'signatures',
    ])
  })

  it('lässt eine explizit entfernte Positionskarte trotz vorhandener Entwurfsdaten überall aus', () => {
    const withoutPositions = encodeOfferText({
      version: 1,
      positionsEnabled: false,
      positionsAfterSectionId: 'scope',
      sections: decodeOfferText(richText).sections,
    })
    const sections = buildServiceReportDocumentSections({
      description: withoutPositions,
      items: [{ position: 1, description: 'Darf nicht erscheinen' }],
      preparedBy: 'Erika Muster',
      customerName: 'Kunde GmbH',
    })

    expect(sections.some((section) => section.kind === 'positions')).toBe(false)
    expect(sections.map((section) => section.id)).toEqual([
      'richText:scope',
      'richText:calculation',
      'richText:payment',
      'richText:confidentiality',
      'signatures',
    ])
  })

  it('verwendet dieselbe Abschnittsquelle in Web und PDF und erzwingt die Signaturgrenze', () => {
    const detail = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/[id]/page.tsx'), 'utf8')
    const pdf = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/service-report.template.tsx'), 'utf8')

    expect(detail).toContain('buildServiceReportDocumentSections')
    expect(pdf).toContain('buildServiceReportDocumentSections')
    expect(pdf).toContain('style={S.sigBox} minPresenceAhead={70} wrap={false}')
    expect(pdf.indexOf('contentSections.map')).toBeLessThan(pdf.indexOf('<View style={S.footer} fixed>'))
  })
})
