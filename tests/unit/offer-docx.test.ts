import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { renderBusinessDocumentDocx } from '@/lib/documents/document-docx'
import { encodeOfferText, type OfferTextDocument } from '@/lib/offers/rich-text'

function zipEntry(buffer: Buffer, name: string): string {
  const endSignature = 0x06054b50
  let endOffset = -1
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) throw new Error('ZIP-Endverzeichnis fehlt.')
  const entryCount = buffer.readUInt16LE(endOffset + 10)
  let offset = buffer.readUInt32LE(endOffset + 16)
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Ungültiges ZIP-Verzeichnis.')
    const compression = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const filenameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const filename = buffer.subarray(offset + 46, offset + 46 + filenameLength).toString()
    if (filename === name) {
      const localFilenameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + localFilenameLength + localExtraLength
      const compressed = buffer.subarray(start, start + compressedSize)
      if (compression === 0) return compressed.toString()
      if (compression === 8) return inflateRawSync(compressed).toString()
      throw new Error(`Nicht unterstützte ZIP-Kompression: ${compression}`)
    }
    offset += 46 + filenameLength + extraLength + commentLength
  }
  throw new Error(`ZIP-Eintrag fehlt: ${name}`)
}

function zipEntryNames(buffer: Buffer): string[] {
  const endSignature = 0x06054b50
  let endOffset = -1
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) throw new Error('ZIP-Endverzeichnis fehlt.')
  const entryCount = buffer.readUInt16LE(endOffset + 10)
  const names: string[] = []
  let offset = buffer.readUInt32LE(endOffset + 16)
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Ungültiges ZIP-Verzeichnis.')
    const filenameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    names.push(buffer.subarray(offset + 46, offset + 46 + filenameLength).toString())
    offset += 46 + filenameLength + extraLength + commentLength
  }
  return names
}

function visibleText(xml: string): string {
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

const intro: OfferTextDocument = {
  version: 1,
  sections: [
    {
      id: 'overview',
      title: '1. Allgemeine Projektbeschreibung',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { textAlign: 'center' },
            content: [
              { type: 'text', text: 'Koordination ', marks: [{ type: 'bold' }] },
              { type: 'text', text: 'für München', marks: [
                { type: 'italic' }, { type: 'underline' },
                { type: 'textStyle', attrs: { fontSize: '12pt' } },
              ] },
              { type: 'hardBreak' },
              { type: 'text', text: 'Werk 10' },
            ],
          },
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prüfung der Eingangsdaten' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vor-Ort-Begehung' }] }] },
            ],
          },
          {
            type: 'orderedList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lieferantentermin' }] }] }],
          },
          {
            type: 'table',
            content: [
              { type: 'tableRow', content: [
                { type: 'tableHeader', attrs: { colspan: 2, colwidth: [300, 300], backgroundColor: '#dbeafe', rowHeight: 32 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Meilensteine', marks: [{ type: 'bold' }] }] }] },
              ] },
              { type: 'tableRow', content: [
                { type: 'tableCell', attrs: { rowspan: 2, colwidth: [300] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'KPI' }] }] },
                { type: 'tableCell', attrs: { colwidth: [300], align: 'right' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Monat 09' }] }] },
              ] },
              { type: 'tableRow', content: [
                { type: 'tableCell', attrs: { colwidth: [300] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Monat 09' }] }] },
              ] },
            ],
          },
        ],
      },
    },
  ],
}

const outro: OfferTextDocument = {
  version: 1,
  sections: [{
    id: 'closing',
    title: 'F. Verschwiegenheitspflicht',
    content: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Der Auftragnehmer behandelt alle Angaben vertraulich.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Mit freundlichen Grüßen' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Alexander Trefilov' }] },
    ] },
  }],
}

describe('Angebots-DOCX', () => {
  it('rendert gespeicherten TWIR-Rich-Text als native, editierbare Word-Struktur', async () => {
    const encodedIntro = encodeOfferText(intro)
    const encodedOutro = encodeOfferText(outro)
    const output = await renderBusinessDocumentDocx({
      company: { companyName: 'TWIR', street: 'Wächtergasse', houseNumber: '10', postalCode: '71706', city: 'Markgröningen' },
      customer: { name: 'Mercedes Benz', street: 'Emil-Kessler-Str.', houseNumber: '4', postalCode: '73733', city: 'Esslingen-Mettingen' },
      offerNumber: 'AN 260901', offerDate: '03.09.2026', title: 'GGA Lagerplanung',
      logoDataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAclChXQAAAAASUVORK5CYII=',
      logoScale: 140, logoSourceWidth: 2, logoSourceHeight: 1,
      introText: encodedIntro, outroText: encodedOutro,
      items: [{
        position: 1, description: 'Bauleitung – Rückbau + Umstellung', notes: 'Koordination vor Ort',
        quantity: 1, unit: 'Stk.', unitPrice: 2400, taxRate: 19,
        netAmount: 2400, taxAmount: 456, grossAmount: 2856,
      }],
      totalNet: 2400, totalTax: 456, totalGross: 2856, taxGroups: { '19': 456 },
    }, 'Angebot')

    const xml = zipEntry(output, 'word/document.xml')
    const numbering = zipEntry(output, 'word/numbering.xml')
    const styles = zipEntry(output, 'word/styles.xml')
    const relationships = zipEntry(output, 'word/_rels/document.xml.rels')
    const contentTypes = zipEntry(output, '[Content_Types].xml')
    const text = visibleText(xml)
    const positionTableXml = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)]
      .map((match) => match[0])
      .find((table) => table.includes('>#</w:t>') && table.includes('>BESCHREIBUNG</w:t>'))
    const mediaEntries = zipEntryNames(output)
      .filter((name) => name.startsWith('word/media/') && !name.endsWith('/'))

    expect(output.subarray(0, 2).toString()).toBe('PK')
    expect(xml).not.toContain('TWIR_OFFER_RICH_TEXT_V1:')
    expect(xml).not.toContain('&quot;version&quot;')
    expect(text).not.toContain('{"version":1')
    expect(xml).toContain('descr="TWIR"')
    expect(text).toContain('Mercedes Benz')
    expect(text).toContain('Angebot AN 260901')
    expect(text).toContain('Datum: 03.09.2026')
    expect(text).toContain('GGA Lagerplanung')
    expect(text).toContain('1. Allgemeine Projektbeschreibung')
    expect(text).toContain('Koordination')
    expect(text).toContain('für München')
    expect(text).toContain('Prüfung der Eingangsdaten')
    expect(text).toContain('Meilensteine')
    expect(text).toContain('Bauleitung – Rückbau + Umstellung')
    expect(text).toContain('2.400,00 €')
    expect(text).toContain('Nettobetrag')
    expect(text).toContain('zzgl. 19% MwSt.')
    expect(text).toContain('Gesamtbetrag brutto')
    expect(text).toContain('F. Verschwiegenheitspflicht')
    expect(text).toContain('Alexander Trefilov')
    expect(text.indexOf('1. Allgemeine Projektbeschreibung')).toBeLessThan(text.indexOf('Bauleitung'))
    expect(text.indexOf('Bauleitung')).toBeLessThan(text.indexOf('F. Verschwiegenheitspflicht'))

    expect(xml).toContain('<w:b/>')
    expect(xml).toContain('<w:i/>')
    expect(xml).toMatch(/<w:u w:val="single"\/>/)
    expect(xml).toContain('<w:br/>')
    expect(xml).toContain('<w:numPr>')
    expect(numbering).toContain('w:val="bullet"')
    expect(numbering).toContain('w:val="decimal"')
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('<w:gridSpan w:val="2"/>')
    expect(xml).toContain('<w:vMerge w:val="restart"/>')
    expect(xml).toContain('w:fill="DBEAFE"')
    expect(xml).toContain('<w:trHeight w:val="480" w:hRule="atLeast"/>')
    expect(mediaEntries).toHaveLength(1)
    expect(relationships).toContain('relationships/image')
    expect(contentTypes).toContain('image/png')
    expect(xml).toContain('title="Firmenlogo"')
    expect(positionTableXml).toBeDefined()
    expect(positionTableXml?.match(/<w:gridCol /g)).toHaveLength(8)
    expect(positionTableXml).toContain('>EINH.</w:t>')
    expect(positionTableXml).toContain('>MWST.</w:t>')
    expect(positionTableXml).toContain('>NETTO</w:t>')
    expect(positionTableXml).toContain('>BRUTTO</w:t>')
    expect(positionTableXml).toContain('>19 %</w:t>')
    expect(positionTableXml).toContain('>2.400,00</w:t>')
    expect(positionTableXml).toContain('>2.856,00</w:t>')
    expect(positionTableXml).not.toContain('>2,400.00</w:t>')
    expect(positionTableXml).toContain('w:fill="F5F4F1"')
    expect(positionTableXml).toContain('<w:tblHeader/>')
    expect(positionTableXml).toContain('<w:cantSplit/>')
    expect(styles).toContain('w:ascii="Arial"')
    expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"')
    expect(xml).toContain('<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"')
  })

  it('gibt ungültige strukturierte Rohdaten nicht sichtbar aus', async () => {
    const raw = 'TWIR_OFFER_RICH_TEXT_V1:{"version":1,"sections":[broken]}'
    const output = await renderBusinessDocumentDocx({
      company: { companyName: 'TWIR' }, customer: { name: 'Kunde' },
      offerNumber: 'AN-1', introText: raw, outroText: raw,
    }, 'Angebot')
    const text = visibleText(zipEntry(output, 'word/document.xml'))
    expect(text).not.toContain('TWIR_OFFER_RICH_TEXT_V1')
    expect(text).not.toContain('{"version"')
    expect(text).toContain('Angebot AN-1')
  })

  it('behält lesbare Legacy-HTML-Texte ohne sichtbare Tags bei', async () => {
    const output = await renderBusinessDocumentDocx({
      company: { companyName: 'TWIR' }, customer: { name: 'Kunde' },
      offerNumber: 'AN-2', introText: '<p>Einleitung &amp; Prüfung</p><p>Folgetext</p>',
    }, 'Angebot')
    const text = visibleText(zipEntry(output, 'word/document.xml'))
    expect(text).toContain('Einleitung & Prüfung')
    expect(text).toContain('Folgetext')
    expect(text).not.toContain('<p>')
  })
})
