import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('gemeinsame Dokumenttypografie', () => {
  const theme = source('lib/pdf-templates/document-header.tsx')
  const templates = [
    'lib/pdf-templates/offer.template.tsx',
    'lib/pdf-templates/order.template.tsx',
    'lib/pdf-templates/service-report.template.tsx',
    'lib/pdf-templates/invoice.template.tsx',
  ]

  it('definiert 11 PDF-Punkte und keine 11 CSS-Pixel als Grundschrift', () => {
    expect(theme).toContain('PDF_BODY_TEXT_SIZE = 11')
    expect(theme).toContain('PDF_BODY_LINE_HEIGHT = 1.18')
    const css = source('app/globals.css')
    expect(css).toContain('font-size: 11pt')
    expect(css).not.toContain('font-size: 11px')
  })

  it.each(templates)('%s verwendet das gemeinsame PDF-Font-Theme', (file) => {
    const template = source(file)
    expect(template).toContain('PDF_DOCUMENT_FONT_FAMILY')
    expect(template).toContain('PDF_BODY_TEXT_SIZE')
    expect(template).toContain('PDF_HEADER_TEXT_STYLE')
  })

  it('nutzt für Empfänger und Metadaten denselben 11-Punkt-Basisstyle', () => {
    expect(theme).toContain('PDF_HEADER_TEXT_SIZE = PDF_BODY_TEXT_SIZE')
    for (const file of templates) {
      const template = source(file)
      expect(template).toContain('addressLine:')
      expect(template).toContain('PDF_HEADER_TEXT_STYLE')
    }
  })

  it('nutzt in allen Dokumenttabellen die zentrale 11-Punkt-Typografie', () => {
    expect(theme).toContain('PDF_TABLE_HEADER_TEXT_SIZE = PDF_BODY_TEXT_SIZE')
    expect(theme).toContain('PDF_TABLE_BODY_TEXT_SIZE = PDF_BODY_TEXT_SIZE')
    for (const file of templates) {
      const template = source(file)
      expect(template).toContain('PDF_TABLE_BODY_TEXT_SIZE')
      expect(template).toContain('PDF_TABLE_HEADER_TEXT_SIZE')
    }
  })

  it('behält die PDF-Kernschrift explizit statt eines stillen Arial-Fallbacks', () => {
    expect(theme).toContain("PDF_DOCUMENT_FONT_FAMILY = 'Helvetica'")
    expect(theme).toContain("PDF_DOCUMENT_FONT_BOLD = 'Helvetica-Bold'")
    expect(theme).not.toContain("fontFamily: 'Arial'")
  })

  it('bewahrt bewusst gesetzte Rich-Text-Schriften und -Größen', () => {
    const offer = source('lib/pdf-templates/offer.template.tsx')
    expect(offer).toContain("family === 'Times New Roman' || family === 'Georgia'")
    expect(offer).toContain("family === 'Courier New'")
    expect(offer).toContain('return Number.parseFloat(normalized)')
  })

  it('startet neue Editorbereiche weiterhin mit Arial 11 pt', () => {
    const editor = source('components/offers/RichTextSectionsEditor.tsx')
    expect(editor).toContain("fontFamily: 'Arial'")
    expect(editor).toContain("fontSize: '11pt'")
  })
})
