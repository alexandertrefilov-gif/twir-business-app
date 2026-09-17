// lib/pdf-templates/service-report.template.tsx
// React-PDF Template für Leistungsnachweise (LN)
// renderServiceReportPdf(data) → Buffer

import React from 'react'
import { Document, Image as PdfImage, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { ServiceItemType } from '@/lib/validators/service-report.schema'
import { getCompanyLogoDimensions } from '@/lib/pdf-templates/company-logo'
import {
  PDF_BODY_LINE_HEIGHT,
  PDF_BODY_TEXT_SIZE,
  PDF_DOCUMENT_FONT_BOLD,
  PDF_DOCUMENT_FONT_FAMILY,
  PDF_FOOTER_TEXT_SIZE,
  PDF_HEADER_HEADING_STYLE,
  PDF_HEADER_LEFT_COLUMN_STYLE,
  PDF_HEADER_RIGHT_COLUMN_STYLE,
  PDF_HEADER_ROW_STYLE,
  PDF_HEADER_TEXT_STYLE,
  PDF_LABEL_TEXT_SIZE,
  PDF_SECTION_TITLE_SIZE,
  PDF_TABLE_BODY_TEXT_SIZE,
  PDF_TABLE_HEADER_TEXT_SIZE,
  PdfSenderAddressDivider,
} from '@/lib/pdf-templates/document-header'
import { OfferRichTextPdf } from '@/lib/pdf-templates/offer.template'
import { buildServiceReportDocumentSections } from '@/lib/documents/service-report-document'

// ── Types ─────────────────────────────────────────────────────

export interface ServiceReportPdfData {
  reportNumber: string
  reportDate:   string   // 'dd.MM.yyyy'
  title?:       string | null
  description?: string | null
  logoDataUri?: string
  logoScale?: number
  logoSourceWidth?: number
  logoSourceHeight?: number

  company: {
    companyName:  string
    legalForm?:   string | null
    street?:      string | null
    houseNumber?: string | null
    postalCode?:  string | null
    city?:        string | null
    email?:       string | null
    phone?:       string | null
    supplierNumber?: string | null
  }

  order: {
    orderNumber: string
    title?:      string | null
    offerNumber?: string | null
  }

  customer: {
    name:         string
    street?:      string | null
    houseNumber?: string | null
    postalCode?:  string | null
    city?:        string | null
  }

  preparedBy: string  // "Vorname Nachname"

  items: Array<{
    position:    number
    type:        ServiceItemType
    description: string
    quantity:    number
    unit:        string
    unitPrice:   number
    netAmount:   number
    notes?:      string | null
  }>

  totalNet:  number
  byType:    Record<ServiceItemType, number>
}

export function paginateServiceReportItems<T>(items: readonly T[], pageSize = 18): T[][] {
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize))
  }
  return pages
}

export function getServiceReportHeaderMetadata(data: ServiceReportPdfData): Array<{ label: string; value: string }> {
  return [
    ...(data.company.supplierNumber ? [{ label: 'LN-Nr.', value: data.company.supplierNumber }] : []),
    { label: 'Datum', value: data.reportDate },
    { label: 'Auftrag', value: data.order.orderNumber },
    ...(data.order.offerNumber ? [{ label: 'Angebot', value: data.order.offerNumber }] : []),
  ]
}

// ── Styles ────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:    { fontFamily: PDF_DOCUMENT_FONT_FAMILY, fontSize: PDF_BODY_TEXT_SIZE, color: '#1a1917', paddingTop: 42, paddingBottom: 54, paddingLeft: 50, paddingRight: 50 },
  h2:      { fontSize: 13, fontFamily: PDF_DOCUMENT_FONT_BOLD, marginBottom: 6 },
  label:   { fontSize: PDF_LABEL_TEXT_SIZE, color: '#6b6b80', marginBottom: 2 },
  small:   { fontSize: PDF_HEADER_TEXT_STYLE.fontSize, color: '#6b6b80', lineHeight: PDF_BODY_LINE_HEIGHT },
  body:    { fontSize: PDF_BODY_TEXT_SIZE, lineHeight: PDF_BODY_LINE_HEIGHT, color: '#3a3a50' },
  documentType: { fontSize: PDF_SECTION_TITLE_SIZE, fontFamily: PDF_DOCUMENT_FONT_BOLD, marginBottom: 8 },

  headerRow: { ...PDF_HEADER_ROW_STYLE, marginBottom: 18 },
  logoRow:   { alignItems: 'flex-end', marginBottom: 6 },
  companyLogo: { objectFit: 'contain' },
  addressBlock: { ...PDF_HEADER_LEFT_COLUMN_STYLE },
  addressLine: { fontFamily: PDF_DOCUMENT_FONT_FAMILY, fontSize: PDF_BODY_TEXT_SIZE, lineHeight: PDF_BODY_LINE_HEIGHT },
  headerText: { ...PDF_HEADER_TEXT_STYLE, color: '#6b6b80' },
  metaBox:   { ...PDF_HEADER_RIGHT_COLUMN_STYLE },
  docNum:    { ...PDF_HEADER_HEADING_STYLE, color: '#1e3a5f', marginBottom: 3 },

  divider:   { borderTop: '0.5 solid #d8d6d0', marginVertical: 10 },

  tableHdr: { flexDirection: 'row', backgroundColor: '#f5f4f1', borderBottom: '0.5 solid #d8d6d0', paddingHorizontal: 5, paddingVertical: 4 },
  tableRow: { flexDirection: 'row', borderBottom: '0.3 solid #ebe9e4', paddingHorizontal: 5, paddingVertical: 5 },
  tableAlt: { backgroundColor: '#faf9f7' },

  cPos:  { width: '7%' },
  cType: { width: '14%' },
  cDesc: { width: '73%' },
  cQty:  { width: '12%', textAlign: 'right' },
  cUnit: { width: '8%',  textAlign: 'right' },

  th:    { fontSize: PDF_TABLE_HEADER_TEXT_SIZE, fontFamily: PDF_DOCUMENT_FONT_BOLD, color: '#6b6b80', textTransform: 'uppercase', paddingHorizontal: 2 },
  td:    { fontSize: PDF_TABLE_BODY_TEXT_SIZE, lineHeight: PDF_BODY_LINE_HEIGHT, paddingHorizontal: 2 },
  mono:  { fontFamily: PDF_DOCUMENT_FONT_FAMILY, fontSize: PDF_TABLE_BODY_TEXT_SIZE },
  bold:  { fontFamily: PDF_DOCUMENT_FONT_BOLD },

  sigBox:  { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between' },
  sigLine: { borderTop: '0.5 solid #9a9890', width: 160, paddingTop: 4 },
  sigLabel:{ fontSize: 7.5, color: '#9a9890' },

  footer:   { position: 'absolute', bottom: 25, left: 50, right: 40, borderTop: '0.5 solid #d8d6d0', paddingTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt:{ fontSize: PDF_FOOTER_TEXT_SIZE, color: '#9a9890', lineHeight: 1.3 },
  pageNum:  { fontSize: PDF_FOOTER_TEXT_SIZE, color: '#9a9890' },
})

// ── Document ──────────────────────────────────────────────────

export function ServiceReportDocument({ data }: { data: ServiceReportPdfData }) {
  const c   = data.company
  const contentSections = buildServiceReportDocumentSections({
    description: data.description,
    items: data.items,
    preparedBy: data.preparedBy,
    customerName: data.customer.name,
  })
  return (
    <Document title={`Leistungsnachweis ${data.reportNumber}`} author={c.companyName}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        {data.logoDataUri && (
          <View style={S.logoRow}>
            <PdfImage
              src={data.logoDataUri}
              style={[
                S.companyLogo,
                getCompanyLogoDimensions(
                  data.logoScale,
                  data.logoSourceWidth,
                  data.logoSourceHeight,
                ),
              ]}
            />
          </View>
        )}
        <PdfSenderAddressDivider
          sender={`${c.companyName}${c.legalForm ? ` ${c.legalForm}` : ''} · ${[c.street, c.houseNumber].filter(Boolean).join(' ')} · ${[c.postalCode, c.city].filter(Boolean).join(' ')}${c.phone ? ` · ${c.phone}` : ''}${c.email ? ` · ${c.email}` : ''}`}
        />
        <View style={S.headerRow}>
          <View style={S.addressBlock}>
            <Text style={S.addressLine}>{data.customer.name}</Text>
            {(data.customer.street || data.customer.houseNumber) && (
              <Text style={S.addressLine}>
                {[data.customer.street, data.customer.houseNumber].filter(Boolean).join(' ')}
              </Text>
            )}
            {(data.customer.postalCode || data.customer.city) && (
              <Text style={S.addressLine}>
                {[data.customer.postalCode, data.customer.city].filter(Boolean).join(' ')}
              </Text>
            )}
          </View>
          <View style={S.metaBox}>
            <Text style={S.docNum}>Leistungsnachweis {data.reportNumber}</Text>
            {getServiceReportHeaderMetadata(data).map((entry) => (
              <Text key={entry.label} style={S.headerText}>{entry.label}: {entry.value}</Text>
            ))}
          </View>
        </View>

        <Text style={S.documentType}>Leistung</Text>

        {/* Title + centrally ordered document content */}
        {data.title && <Text style={[S.h2, { marginBottom: 4 }]}>{data.title}</Text>}
        {contentSections.map((section) => {
          if (section.kind === 'richText') {
            return <View key={section.id} style={{ marginBottom: 12 }}><OfferRichTextPdf value={section.value} /></View>
          }
          if (section.kind === 'positions') {
            return (
              <React.Fragment key={section.id}>
                {paginateServiceReportItems(section.items).map((items, pageIndex) => (
                  <View key={pageIndex} style={{ marginBottom: 12 }} break={pageIndex > 0} wrap={false}>
                    <View style={S.tableHdr}>
                      <Text style={[S.th, S.cPos]}>Pos.</Text>
                      <Text style={[S.th, S.cDesc]}>Leistung / Material</Text>
                      <Text style={[S.th, S.cQty]}>Menge</Text>
                      <Text style={[S.th, S.cUnit]}>Einheit</Text>
                    </View>
                    {items.map((item, index) => (
                      <View key={item.position} style={[S.tableRow, index % 2 === 1 ? S.tableAlt : {}]}>
                        <Text style={[S.td, S.cPos]}>{item.position}</Text>
                        <View style={S.cDesc}>
                          <Text style={S.td}>{item.description}</Text>
                          {item.notes && <Text style={S.small}>{item.notes}</Text>}
                        </View>
                        <Text style={[S.td, S.cQty]}>{item.quantity.toLocaleString('de-DE')}</Text>
                        <Text style={[S.td, S.cUnit]}>{item.unit}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </React.Fragment>
            )
          }
          return (
            <View key={section.id} style={S.sigBox} minPresenceAhead={70} wrap={false}>
              <View>
                <View style={S.sigLine} />
                <Text style={S.sigLabel}>Ort, Datum, Unterschrift Auftragnehmer</Text>
                <Text style={[S.sigLabel, { marginTop: 2 }]}>{section.preparedBy}</Text>
              </View>
              <View>
                <View style={S.sigLine} />
                <Text style={S.sigLabel}>Ort, Datum, Unterschrift Auftraggeber</Text>
                <Text style={[S.sigLabel, { marginTop: 2 }]}>{section.customerName}</Text>
              </View>
            </View>
          )
        })}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerTxt}>
            {c.companyName}{c.legalForm ? ` ${c.legalForm}` : ''}
            {c.email ? `  ·  ${c.email}` : ''}
          </Text>
          <Text style={S.pageNum}
            render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`}
            fixed
          />
        </View>

      </Page>
    </Document>
  )
}

// ── Render helper ─────────────────────────────────────────────

export async function renderServiceReportPdf(data: ServiceReportPdfData): Promise<Buffer> {
  return renderToBuffer(<ServiceReportDocument data={data} />)
}
