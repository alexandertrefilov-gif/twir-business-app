import { describe, expect, it } from 'vitest'
import {
  canonicalizeOfferTextValue,
  decodeOfferText,
  encodeOfferText,
  isValidOfferTextValue,
  offerIntroToOrderDescription,
  richTextToPlainText,
  type OfferTextDocument,
} from '@/lib/offers/rich-text'
import { OfferCreateSchema } from '@/lib/validators/offer.schema'

const document: OfferTextDocument = {
  version: 1,
  sections: [{
    id: 'section-1',
    title: 'Leistungsumfang',
    content: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Professioneller Angebotstext',
          marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#1d4ed8' } }],
        }],
      }, {
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableHeader',
            attrs: {
              colspan: 1,
              rowspan: 1,
              colwidth: [180],
              backgroundColor: '#dbeafe',
              rowHeight: 48,
            },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Position' }] }],
          }],
        }],
      }],
    },
  }],
}

describe('strukturierte Angebotstexte', () => {
  it('speichert und liest kontrolliertes Editor-JSON', () => {
    const value = encodeOfferText(document)

    expect(isValidOfferTextValue(value)).toBe(true)
    expect(decodeOfferText(value)).toEqual(document)
    expect(richTextToPlainText(value)).toBe(
      'Leistungsumfang\nProfessioneller Angebotstext\nPosition',
    )
  })

  it('entfernt unbekannte optische Word-Attribute vor dem Speichern', () => {
    const withWordAttributes: OfferTextDocument = {
      ...document,
      sections: [{
        ...document.sections[0],
        content: {
          type: 'doc',
          attrs: { class: 'MsoNormal' },
          content: [{
            type: 'paragraph',
            attrs: { textAlign: 'left', msoStyleName: 'Standard' },
            content: [{
              type: 'text',
              text: 'Word-Inhalt',
              marks: [{
                type: 'textStyle',
                attrs: { fontFamily: 'Arial', fontSize: '12px', msoAnsiLanguage: 'DE' },
              }],
            }],
          }],
        },
      }],
    }

    const value = encodeOfferText(withWordAttributes)
    expect(isValidOfferTextValue(value)).toBe(true)
    expect(value).not.toContain('MsoNormal')
    expect(value).not.toContain('msoStyleName')
    expect(value).not.toContain('msoAnsiLanguage')
  })

  it('kanonisiert bereits serialisierte Word-Attribute serverseitig', () => {
    const rawValue = `TWIR_OFFER_RICH_TEXT_V1:${JSON.stringify({
      version: 1,
      sections: [{
        id: 'section-1',
        title: '',
        content: {
          type: 'doc',
          attrs: { class: 'MsoNormal' },
          content: [{
            type: 'paragraph',
            attrs: { textAlign: 'left', msoStyleName: 'Standard' },
            content: [{ type: 'text', text: 'Bestehender Word-Inhalt' }],
          }],
        },
      }],
    })}`

    const canonical = canonicalizeOfferTextValue(rawValue)
    expect(isValidOfferTextValue(canonical)).toBe(true)
    expect(canonical).not.toContain('MsoNormal')
    expect(canonical).not.toContain('msoStyleName')

    expect(OfferCreateSchema.safeParse({
      customerId: '11111111-1111-4111-8111-111111111111',
      offerDate: new Date(),
      introText: rawValue,
      items: [{
        position: 1,
        description: 'Leistung',
        quantity: 1,
        unit: 'Stk.',
        unitPrice: 100,
        taxRate: 19,
      }],
    }).success).toBe(true)
  })

  it('wandelt Word-Schriften, Punktgrößen, RGB-Farben und Tabellenmaße um', () => {
    const rawValue = `TWIR_OFFER_RICH_TEXT_V1:${JSON.stringify({
      version: 1,
      sections: [{
        id: 'section-1',
        title: '',
        content: {
          type: 'doc',
          content: [{
            type: 'table',
            content: [{
              type: 'tableRow',
              content: [{
                type: 'tableCell',
                attrs: {
                  colspan: '1',
                  rowspan: 1,
                  colwidth: '240,180',
                  align: 'center',
                  backgroundColor: 'rgb(219, 234, 254)',
                  rowHeight: '48',
                  msoPaddingAlt: '0cm',
                },
                content: [{
                  type: 'paragraph',
                  content: [{
                    type: 'text',
                    text: 'Word-Tabelle',
                    marks: [{
                      type: 'textStyle',
                      attrs: {
                        fontFamily: 'Calibri, sans-serif',
                        fontSize: '11pt',
                        color: 'rgb(29, 78, 216)',
                        msoAnsiLanguage: 'DE',
                      },
                    }],
                  }],
                }],
              }],
            }],
          }],
        },
      }],
    })}`

    const parsed = OfferCreateSchema.safeParse({
      customerId: '11111111-1111-4111-8111-111111111111',
      offerDate: new Date(),
      introText: rawValue,
      items: [{
        position: 1,
        description: 'Leistung',
        quantity: 1,
        unit: 'Stk.',
        unitPrice: 100,
        taxRate: 19,
      }],
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.introText).toContain('"fontFamily":"Arial"')
      expect(parsed.data.introText).toContain('"fontSize":"11pt"')
      expect(parsed.data.introText).toContain('"color":"#1d4ed8"')
      expect(parsed.data.introText).toContain('"backgroundColor":"#dbeafe"')
      expect(parsed.data.introText).not.toContain('mso')
    }
  })

  it('behält bestehende Klartexte kompatibel', () => {
    expect(isValidOfferTextValue('Bestehender Angebotstext')).toBe(true)
    expect(richTextToPlainText('Bestehender Angebotstext')).toBe(
      'Bestehender Angebotstext',
    )
  })

  it('übernimmt den ersten Angebotstext als bearbeitbare Auftragsbeschreibung', () => {
    const value = encodeOfferText({
      ...document,
      sections: [
        ...document.sections,
        {
          id: 'section-2',
          title: 'Nur im Angebot',
          content: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: 'Dieser Text darf nicht in den Auftrag.' }],
            }],
          },
        },
      ],
    })

    expect(offerIntroToOrderDescription(value)).toBe(
      'Leistungsumfang\nProfessioneller Angebotstext\nPosition',
    )
    expect(offerIntroToOrderDescription('   ')).toBeNull()
    expect(offerIntroToOrderDescription('A'.repeat(3_001))).toHaveLength(3_000)
  })

  it('weist Script-Knoten und freie Attribute serverseitig zurück', () => {
    const malicious = `TWIR_OFFER_RICH_TEXT_V1:${JSON.stringify({
      version: 1,
      sections: [{
        id: 'section-1',
        title: '',
        content: {
          type: 'doc',
          content: [{ type: 'script', attrs: { src: 'https://example.test/x.js' } }],
        },
      }],
    })}`

    expect(isValidOfferTextValue(malicious)).toBe(false)
    expect(OfferCreateSchema.safeParse({
      customerId: '11111111-1111-4111-8111-111111111111',
      offerDate: new Date(),
      introText: malicious,
      items: [{
        position: 1,
        description: 'Leistung',
        quantity: 1,
        unit: 'Stk.',
        unitPrice: 100,
        taxRate: 19,
      }],
    }).success).toBe(false)
  })
})
