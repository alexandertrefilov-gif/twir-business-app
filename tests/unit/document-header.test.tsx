import React from 'react'
import { Text, View } from '@react-pdf/renderer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PDF_BODY_LINE_HEIGHT,
  PDF_BODY_TEXT_SIZE,
  DOCUMENT_BROWSER_FONT_FAMILY,
  PDF_DOCUMENT_FONT_BOLD,
  PDF_DOCUMENT_FONT_FAMILY,
  PDF_DOCUMENT_TITLE_SIZE,
  PDF_FOOTER_TEXT_SIZE,
  PDF_HEADER_HEADING_SIZE,
  PDF_HEADER_HEADING_STYLE,
  PDF_HEADER_COLUMN_TOP,
  PDF_HEADER_LEFT_COLUMN_STYLE,
  PDF_HEADER_RIGHT_COLUMN_STYLE,
  PDF_HEADER_ROW_STYLE,
  PDF_HEADER_TEXT_SIZE,
  PDF_HEADER_TEXT_STYLE,
  PDF_LABEL_TEXT_SIZE,
  PDF_SECTION_TITLE_SIZE,
  PDF_TABLE_BODY_TEXT_SIZE,
  PDF_TABLE_HEADER_TEXT_SIZE,
  PdfSenderAddressDivider,
} from '@/lib/pdf-templates/document-header'

describe('Gemeinsamer PDF-Dokumentheader', () => {
  it('definiert eine konsistente Hierarchie für das A4-Dokument', () => {
    expect(DOCUMENT_BROWSER_FONT_FAMILY).toBe('Arial, Helvetica, sans-serif')
    expect(PDF_DOCUMENT_FONT_FAMILY).toBe('Helvetica')
    expect(PDF_DOCUMENT_FONT_BOLD).toBe('Helvetica-Bold')
    expect(PDF_BODY_TEXT_SIZE).toBe(11)
    expect(PDF_BODY_LINE_HEIGHT).toBe(1.18)
    expect(PDF_DOCUMENT_TITLE_SIZE).toBe(16)
    expect(PDF_SECTION_TITLE_SIZE).toBe(11)
    expect(PDF_LABEL_TEXT_SIZE).toBe(8)
    expect(PDF_TABLE_HEADER_TEXT_SIZE).toBe(11)
    expect(PDF_TABLE_BODY_TEXT_SIZE).toBe(11)
    expect(PDF_FOOTER_TEXT_SIZE).toBe(7.5)
    expect(PDF_HEADER_TEXT_STYLE).toEqual({
      fontFamily: PDF_DOCUMENT_FONT_FAMILY,
      fontSize: PDF_HEADER_TEXT_SIZE,
      lineHeight: PDF_BODY_LINE_HEIGHT,
    })
    expect(PDF_HEADER_HEADING_SIZE).toBe(PDF_DOCUMENT_TITLE_SIZE)
    expect(PDF_HEADER_HEADING_STYLE).toEqual({
      fontFamily: PDF_DOCUMENT_FONT_BOLD,
      fontSize: PDF_HEADER_HEADING_SIZE,
    })
  })

  it('richtet Empfänger und Dokumentmetadaten an derselben oberen Linie aus', () => {
    expect(PDF_HEADER_COLUMN_TOP).toBe(8)
    expect(PDF_HEADER_ROW_STYLE).toEqual({
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    })
    expect(PDF_HEADER_LEFT_COLUMN_STYLE).toEqual({ flex: 1, paddingTop: 8 })
    expect(PDF_HEADER_RIGHT_COLUMN_STYLE).toEqual({
      width: 210,
      alignItems: 'flex-end',
      paddingTop: 8,
    })
  })

  it.each([
    'lib/pdf-templates/offer.template.tsx',
    'lib/pdf-templates/order.template.tsx',
    'lib/pdf-templates/service-report.template.tsx',
    'lib/pdf-templates/invoice.template.tsx',
  ])('verwendet in %s die gemeinsame Header-Geometrie ohne individuellen oberen Abstand', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')

    expect(source).toContain('PDF_HEADER_ROW_STYLE')
    expect(source).toContain('PDF_HEADER_LEFT_COLUMN_STYLE')
    expect(source).toContain('PDF_HEADER_RIGHT_COLUMN_STYLE')
    expect(source).not.toMatch(/(?:address|addressBlock):\s*\{[^}]*marginTop:\s*8/)
    expect(source).not.toMatch(/(?:meta|metaBox|headerRight):\s*\{[^}]*paddingTop:\s*[048]/)
  })

  it('rendert zuerst die Absenderadresse und danach eine Vollbreitenlinie', () => {
    const element = PdfSenderAddressDivider({ sender: 'TWIR · Musterstraße 1 · 12345 Musterstadt' })
    const children = React.Children.toArray(element.props.children) as Array<
      React.ReactElement<{ style?: Record<string, unknown> }>
    >

    expect(children).toHaveLength(2)
    expect(children[0].type).toBe(Text)
    expect(children[0].props.style).toMatchObject(PDF_HEADER_TEXT_STYLE)
    expect(children[1].type).toBe(View)
    expect(children[1].props.style).toMatchObject({
      width: '100%',
      borderTop: '1 solid #9f9c95',
    })
  })

  it.each([
    'lib/pdf-templates/offer.template.tsx',
    'lib/pdf-templates/service-report.template.tsx',
  ])('ordnet in %s Logo, Absenderlinie und Empfänger-/Metadatenblock', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    const logo = source.indexOf('<PdfImage')
    const senderDivider = source.indexOf('<PdfSenderAddressDivider')
    const recipientAndMeta = source.indexOf('<View style={S.headerRow}>', senderDivider)

    expect(logo).toBeGreaterThan(-1)
    expect(senderDivider).toBeGreaterThan(logo)
    expect(recipientAndMeta).toBeGreaterThan(senderDivider)
  })
})
