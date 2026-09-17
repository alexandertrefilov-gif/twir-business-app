import React from 'react'
import { Text, View, StyleSheet } from '@react-pdf/renderer'

// React-PDF ships Helvetica as its metrically compatible, embedded core font.
// Browser/editor typography uses Arial; keeping the PDF name explicit prevents
// an unnoticed fallback to a different renderer font.
export const DOCUMENT_BROWSER_FONT_FAMILY = 'Arial, Helvetica, sans-serif'
export const PDF_DOCUMENT_FONT_FAMILY = 'Helvetica'
export const PDF_DOCUMENT_FONT_BOLD = 'Helvetica-Bold'
export const PDF_BODY_TEXT_SIZE = 11
export const PDF_BODY_LINE_HEIGHT = 1.18
export const PDF_DOCUMENT_TITLE_SIZE = 16
export const PDF_SECTION_TITLE_SIZE = 11
export const PDF_LABEL_TEXT_SIZE = 8
export const PDF_TABLE_HEADER_TEXT_SIZE = PDF_BODY_TEXT_SIZE
export const PDF_TABLE_BODY_TEXT_SIZE = PDF_BODY_TEXT_SIZE
export const PDF_FOOTER_TEXT_SIZE = 7.5
export const PDF_HEADER_TEXT_SIZE = PDF_BODY_TEXT_SIZE
export const PDF_HEADER_HEADING_SIZE = PDF_DOCUMENT_TITLE_SIZE
export const PDF_HEADER_TEXT_STYLE = {
  fontFamily: PDF_DOCUMENT_FONT_FAMILY,
  fontSize: PDF_HEADER_TEXT_SIZE,
  lineHeight: PDF_BODY_LINE_HEIGHT,
} as const
export const PDF_HEADER_HEADING_STYLE = {
  fontFamily: PDF_DOCUMENT_FONT_BOLD,
  fontSize: PDF_HEADER_HEADING_SIZE,
} as const
export const PDF_HEADER_ROW_STYLE = {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
} as const
export const PDF_HEADER_COLUMN_TOP = 8
export const PDF_HEADER_LEFT_COLUMN_STYLE = {
  flex: 1,
  paddingTop: PDF_HEADER_COLUMN_TOP,
} as const
export const PDF_HEADER_RIGHT_COLUMN_STYLE = {
  width: 210,
  alignItems: 'flex-end',
  paddingTop: PDF_HEADER_COLUMN_TOP,
} as const

const S = StyleSheet.create({
  sender: {
    ...PDF_HEADER_TEXT_STYLE,
    color: '#6b6b80',
    paddingBottom: 3,
  },
  divider: {
    width: '100%',
    borderTop: '1 solid #9f9c95',
    marginBottom: 4,
  },
})

export function PdfSenderAddressDivider({ sender }: { sender: string }) {
  return (
    <>
      <Text style={S.sender}>{sender}</Text>
      <View style={S.divider} />
    </>
  )
}
