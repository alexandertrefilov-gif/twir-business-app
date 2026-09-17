import React from 'react'
import { Document, Image as PdfImage, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { getCompanyLogoDimensions } from '@/lib/pdf-templates/company-logo'
import { PDF_BODY_LINE_HEIGHT, PDF_BODY_TEXT_SIZE, PDF_DOCUMENT_FONT_BOLD, PDF_DOCUMENT_FONT_FAMILY, PDF_FOOTER_TEXT_SIZE, PDF_HEADER_HEADING_STYLE, PDF_HEADER_LEFT_COLUMN_STYLE, PDF_HEADER_RIGHT_COLUMN_STYLE, PDF_HEADER_ROW_STYLE, PDF_HEADER_TEXT_STYLE, PDF_TABLE_BODY_TEXT_SIZE, PDF_TABLE_HEADER_TEXT_SIZE, PdfSenderAddressDivider } from '@/lib/pdf-templates/document-header'
import { OfferRichTextPdf } from '@/lib/pdf-templates/offer.template'

export interface InvoicePdfData {
  invoiceNumber: string | null
  invoiceDate: string
  dueDate?: string | null
  deliveryDate?: string | null
  orderNumber?: string | null
  introText?: string | null
  outroText?: string | null
  logoDataUri?: string
  logoScale?: number
  logoSourceWidth?: number
  logoSourceHeight?: number
  company: {
    companyName: string; legalForm?: string | null; street?: string | null; houseNumber?: string | null
    postalCode?: string | null; city?: string | null; vatId?: string | null; taxNumber?: string | null
    bankName?: string | null; iban?: string | null; bic?: string | null; email?: string | null; phone?: string | null
  }
  customer: {
    name: string; additional?: string | null; contactName?: string | null; street?: string | null; houseNumber?: string | null; postalCode?: string | null
    city?: string | null; country?: string | null; vatId?: string | null
  }
  items: Array<{
    position: number; description: string; quantity: number; unit: string
    unitPrice: number; taxRate: number; netAmount: number; grossAmount: number
  }>
  totalNet: number
  totalTax: number
  totalGross: number
}

const S = StyleSheet.create({
  page: { fontFamily: PDF_DOCUMENT_FONT_FAMILY, fontSize: PDF_BODY_TEXT_SIZE, color: '#1a1917', backgroundColor: '#ffffff', paddingTop: 28, paddingBottom: 76, paddingLeft: 50, paddingRight: 40 },
  logoRow: { alignItems: 'flex-end', marginBottom: 6 },
  logo: { objectFit: 'contain' },
  headerRow: { ...PDF_HEADER_ROW_STYLE, marginBottom: 24 },
  address: { ...PDF_HEADER_LEFT_COLUMN_STYLE },
  addressLine: { ...PDF_HEADER_TEXT_STYLE },
  meta: { ...PDF_HEADER_RIGHT_COLUMN_STYLE },
  metaHeading: { ...PDF_HEADER_HEADING_STYLE, color: '#1e3a5f' },
  metaText: { ...PDF_HEADER_TEXT_STYLE, color: '#6b6b80' },
  intro: { marginBottom: 12, lineHeight: PDF_BODY_LINE_HEIGHT },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f5f4f1', borderBottom: '0.5 solid #d8d6d0', paddingHorizontal: 4, paddingVertical: 4 },
  tableRow: { flexDirection: 'row', borderBottom: '0.3 solid #ebe9e4', paddingHorizontal: 4, paddingVertical: 5 },
  th: { fontSize: PDF_TABLE_HEADER_TEXT_SIZE, fontFamily: PDF_DOCUMENT_FONT_BOLD, color: '#6b6b80', paddingHorizontal: 2 },
  td: { fontSize: PDF_TABLE_BODY_TEXT_SIZE, lineHeight: PDF_BODY_LINE_HEIGHT, paddingHorizontal: 2 },
  pos: { width: 30 }, description: { flex: 1, paddingRight: 5 }, quantity: { width: 42, textAlign: 'right' }, unit: { width: 42 },
  price: { width: 65, textAlign: 'right' }, tax: { width: 42, textAlign: 'right' }, total: { width: 68, textAlign: 'right' },
  totals: { marginTop: 10, marginLeft: 'auto', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalStrong: { fontFamily: PDF_DOCUMENT_FONT_BOLD, borderTop: '0.5 solid #d8d6d0', paddingTop: 4, marginTop: 2 },
  outro: { marginTop: 18, lineHeight: PDF_BODY_LINE_HEIGHT },
  footer: { position: 'absolute', bottom: 24, left: 50, right: 40, borderTop: '0.5 solid #d8d6d0', paddingTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: PDF_FOOTER_TEXT_SIZE, color: '#77756f', lineHeight: 1.4, maxWidth: 330 },
})

const money = (value: number) => `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const companyName = (company: InvoicePdfData['company']) => [company.companyName, company.legalForm].filter(Boolean).join(' ')

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const logoDimensions = getCompanyLogoDimensions(data.logoScale, data.logoSourceWidth, data.logoSourceHeight)
  const title = data.invoiceNumber ? `Rechnung ${data.invoiceNumber}` : 'Rechnungsentwurf'
  return (
    <Document title={title} author={companyName(data.company)}>
      <Page size="A4" style={S.page} wrap>
        {data.logoDataUri && <View style={S.logoRow}><PdfImage src={data.logoDataUri} style={[S.logo, logoDimensions]} /></View>}
        <PdfSenderAddressDivider sender={`${companyName(data.company)} · ${[data.company.street, data.company.houseNumber].filter(Boolean).join(' ')} · ${[data.company.postalCode, data.company.city].filter(Boolean).join(' ')}`} />
        <View style={S.headerRow} wrap={false}>
          <View style={S.address}>
            <Text style={S.addressLine}>{data.customer.name}</Text>
            {data.customer.additional && <Text style={S.addressLine}>{data.customer.additional}</Text>}
            {data.customer.contactName && <Text style={S.addressLine}>{data.customer.contactName}</Text>}
            <Text style={S.addressLine}>{[data.customer.street, data.customer.houseNumber].filter(Boolean).join(' ')}</Text>
            <Text style={S.addressLine}>{[data.customer.postalCode, data.customer.city].filter(Boolean).join(' ')}</Text>
            {data.customer.country && data.customer.country !== 'DE' && <Text style={S.addressLine}>{data.customer.country}</Text>}
          </View>
          <View style={S.meta}>
            <Text style={S.metaHeading}>{title}</Text>
            <Text style={S.metaText}>Datum: {data.invoiceDate}</Text>
            {data.deliveryDate && <Text style={S.metaText}>Leistungsdatum: {data.deliveryDate}</Text>}
            {data.dueDate && <Text style={S.metaText}>Fällig am: {data.dueDate}</Text>}
            {data.orderNumber && <Text style={S.metaText}>Auftrag: {data.orderNumber}</Text>}
          </View>
        </View>
        {data.introText && <View style={S.intro}><OfferRichTextPdf value={data.introText} /></View>}
        <View style={S.tableHeader} wrap={false}>
          <Text style={[S.th, S.pos]}>Pos.</Text><Text style={[S.th, S.description]}>Beschreibung</Text>
          <Text style={[S.th, S.quantity]}>Menge</Text><Text style={[S.th, S.unit]}>Einheit</Text>
          <Text style={[S.th, S.price]}>Einzelpreis</Text><Text style={[S.th, S.tax]}>MwSt.</Text><Text style={[S.th, S.total]}>Netto</Text>
        </View>
        {data.items.map((item) => (
          <View key={item.position} style={S.tableRow} wrap={false}>
            <Text style={[S.td, S.pos]}>{item.position}</Text><Text style={[S.td, S.description]}>{item.description}</Text>
            <Text style={[S.td, S.quantity]}>{item.quantity.toLocaleString('de-DE')}</Text><Text style={[S.td, S.unit]}>{item.unit}</Text>
            <Text style={[S.td, S.price]}>{money(item.unitPrice)}</Text><Text style={[S.td, S.tax]}>{item.taxRate} %</Text><Text style={[S.td, S.total]}>{money(item.netAmount)}</Text>
          </View>
        ))}
        <View style={S.totals} wrap={false}>
          <View style={S.totalRow}><Text>Netto</Text><Text>{money(data.totalNet)}</Text></View>
          <View style={S.totalRow}><Text>Umsatzsteuer</Text><Text>{money(data.totalTax)}</Text></View>
          <View style={[S.totalRow, S.totalStrong]}><Text>Rechnungsbetrag</Text><Text>{money(data.totalGross)}</Text></View>
        </View>
        {data.outroText && <View style={S.outro}><OfferRichTextPdf value={data.outroText} /></View>}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{companyName(data.company)}{data.company.vatId ? ` · USt-IdNr. ${data.company.vatId}` : ''}{data.company.taxNumber ? ` · Steuernr. ${data.company.taxNumber}` : ''}</Text>
          <Text style={[S.footerText, { textAlign: 'right' }]}>{data.company.bankName ?? ''}{data.company.iban ? ` · IBAN ${data.company.iban}` : ''}{data.company.bic ? ` · BIC ${data.company.bic}` : ''}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<InvoiceDocument data={data} />))
}
