import React from 'react'
import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import { getCompanyLogoDimensions } from '@/lib/pdf-templates/company-logo'
import {
  PDF_BODY_TEXT_SIZE,
  PDF_BODY_LINE_HEIGHT,
  PDF_DOCUMENT_FONT_BOLD,
  PDF_DOCUMENT_FONT_FAMILY,
  PDF_TABLE_BODY_TEXT_SIZE,
  PDF_TABLE_HEADER_TEXT_SIZE,
  PDF_HEADER_HEADING_STYLE,
  PDF_HEADER_LEFT_COLUMN_STYLE,
  PDF_HEADER_RIGHT_COLUMN_STYLE,
  PDF_HEADER_ROW_STYLE,
  PDF_HEADER_TEXT_STYLE,
  PdfSenderAddressDivider,
} from '@/lib/pdf-templates/document-header'
import type { OrderPdfOptions } from '@/lib/validators/order-pdf.schema'
import {
  OfferRichTextPdf,
  OFFER_RICH_SECTION_TITLE_STYLE,
} from '@/lib/pdf-templates/offer.template'
import { splitOfferTextAtPositions } from '@/lib/offers/rich-text'

export interface OrderPdfData {
  orderNumber?: string
  orderDate?: string
  title?: string | null
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  offerNumber?: string | null
  logoDataUri?: string
  logoScale?: number
  logoSourceWidth?: number
  logoSourceHeight?: number
  options: OrderPdfOptions
  company: {
    companyName: string
    street?: string | null
    houseNumber?: string | null
    postalCode?: string | null
    city?: string | null
    email?: string | null
    phone?: string | null
    bankName?: string | null
    iban?: string | null
  }
  customer?: {
    name: string
    street?: string | null
    houseNumber?: string | null
    postalCode?: string | null
    city?: string | null
    contact?: string | null
    contactPosition?: string | null
  }
  items: Array<{
    position: number
    description: string
    quantity?: number
    unit?: string
    unitPrice?: number
    netAmount?: number
    taxRate?: number
    notes?: string | null
  }>
  totalNet?: number
  totalTax?: number
  totalGross?: number
}

const S = StyleSheet.create({
  page: {
    fontFamily: PDF_DOCUMENT_FONT_FAMILY,
    fontSize: PDF_BODY_TEXT_SIZE,
    color: '#1a1917',
    paddingTop: 28,
    paddingBottom: 72,
    paddingLeft: 50,
    paddingRight: 40,
  },
  logoRow: { alignItems: 'flex-end', marginBottom: 6 },
  logo: { objectFit: 'contain' },
  headerRow: { ...PDF_HEADER_ROW_STYLE, marginBottom: 28 },
  address: { ...PDF_HEADER_LEFT_COLUMN_STYLE },
  addressLine: { ...PDF_HEADER_TEXT_STYLE },
  meta: { ...PDF_HEADER_RIGHT_COLUMN_STYLE },
  metaText: { ...PDF_HEADER_TEXT_STYLE, color: '#6b6b80' },
  metaHeading: { ...PDF_HEADER_HEADING_STYLE, color: '#1e3a5f' },
  documentType: { fontSize: 12, fontFamily: PDF_DOCUMENT_FONT_BOLD, marginBottom: 10 },
  title: { ...OFFER_RICH_SECTION_TITLE_STYLE },
  descriptionBlock: { marginBottom: 8 },
  period: { color: '#6b6b80', marginBottom: 12 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f4f1',
    borderBottom: '0.5 solid #d8d6d0',
    paddingHorizontal: 5,
    paddingVertical: 4,
    marginTop: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.3 solid #ebe9e4',
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  th: { fontSize: PDF_TABLE_HEADER_TEXT_SIZE, fontFamily: PDF_DOCUMENT_FONT_BOLD, color: '#6b6b80', paddingHorizontal: 2 },
  td: { fontSize: PDF_TABLE_BODY_TEXT_SIZE, lineHeight: PDF_BODY_LINE_HEIGHT, paddingHorizontal: 2 },
  notes: { fontSize: PDF_TABLE_BODY_TEXT_SIZE, lineHeight: PDF_BODY_LINE_HEIGHT, color: '#6b6b80', marginTop: 2 },
  totals: { marginTop: 10, marginLeft: 'auto', width: 210 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalStrong: { fontFamily: PDF_DOCUMENT_FONT_BOLD },
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 50,
    right: 40,
    borderTop: '0.5 solid #d8d6d0',
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: '#9a9890', lineHeight: 1.5 },
})

const money = (value: number) => value.toLocaleString('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}) + ' €'

export function getOrderPdfColumns(options: OrderPdfOptions) {
  const optional = [
    options.showQuantities && { key: 'quantity', label: 'Menge', width: 48, align: 'right' as const },
    options.showUnits && { key: 'unit', label: 'Einheit', width: 44, align: 'left' as const },
    options.showUnitPrices && { key: 'unitPrice', label: 'Einzelpreis', width: 72, align: 'right' as const },
    options.showTax && { key: 'taxRate', label: 'MwSt.', width: 48, align: 'right' as const },
    options.showTotalPrices && { key: 'netAmount', label: 'Gesamt', width: 72, align: 'right' as const },
  ].filter(Boolean) as Array<{ key: string; label: string; width: number; align: 'left' | 'right' }>
  const fixedWidth = 32 + optional.reduce((sum, column) => sum + column.width, 0)
  return [
    { key: 'position', label: 'Pos.', width: 32, align: 'left' as const },
    { key: 'description', label: 'Beschreibung', width: 495 - fixedWidth, align: 'left' as const },
    ...optional,
  ]
}

export const ORDER_TABLE_START_MIN_HEIGHT = 48

export function OrderDocument({ data }: { data: OrderPdfData }) {
  const c = data.company
  const columns = getOrderPdfColumns(data.options)
  const logoDimensions = getCompanyLogoDimensions(
    data.logoScale,
    data.logoSourceWidth,
    data.logoSourceHeight,
  )
  const content = splitOfferTextAtPositions(data.description)
  return (
    <Document title={`Auftrag ${data.orderNumber ?? ''}`} author={c.companyName}>
      <Page size="A4" style={S.page}>
        {data.logoDataUri && (
          <View style={S.logoRow}>
            <PdfImage src={data.logoDataUri} style={[S.logo, logoDimensions]} />
          </View>
        )}
        <PdfSenderAddressDivider
          sender={`${c.companyName} · ${[c.street, c.houseNumber].filter(Boolean).join(' ')} · ${[c.postalCode, c.city].filter(Boolean).join(' ')}`}
        />
        <View style={S.headerRow}>
          <View style={S.address}>
            {data.customer && (
              <>
                <Text style={S.addressLine}>{data.customer.name}</Text>
                {data.customer.contact && <Text style={S.addressLine}>{data.customer.contact}</Text>}
                {data.customer.contactPosition && <Text style={S.addressLine}>{data.customer.contactPosition}</Text>}
                <Text style={S.addressLine}>
                  {[data.customer.street, data.customer.houseNumber].filter(Boolean).join(' ')}
                </Text>
                <Text style={S.addressLine}>
                  {[data.customer.postalCode, data.customer.city].filter(Boolean).join(' ')}
                </Text>
              </>
            )}
          </View>
          <View style={S.meta}>
            <Text style={S.metaHeading}>
              Auftrag{data.orderNumber ? ` ${data.orderNumber}` : ''}
            </Text>
            {data.orderDate && <Text style={S.metaText}>Datum: {data.orderDate}</Text>}
            {data.offerNumber && <Text style={S.metaText}>Aus Angebot: {data.offerNumber}</Text>}
          </View>
        </View>

        <Text style={S.documentType}>Auftrag</Text>
        {data.title && <Text style={S.title} minPresenceAhead={28}>{data.title}</Text>}
        {content.before && (
          <View style={S.descriptionBlock}>
            <OfferRichTextPdf value={content.before} />
          </View>
        )}
        {(data.startDate || data.endDate) && (
          <Text style={S.period}>
            Leistungszeitraum: {data.startDate ?? 'offen'} bis {data.endDate ?? 'offen'}
          </Text>
        )}

        {content.positionsEnabled && data.options.showItems && data.items.length > 0 && (
          <>
            <View wrap={false} minPresenceAhead={ORDER_TABLE_START_MIN_HEIGHT}>
              <OrderTableHeader columns={columns} />
              <OrderTableRow item={data.items[0]} columns={columns} />
            </View>
            {data.items.slice(1).map((item) => (
              <OrderTableRow key={item.position} item={item} columns={columns} />
            ))}
          </>
        )}

        {content.after && (
          <View style={S.descriptionBlock}>
            <OfferRichTextPdf value={content.after} />
          </View>
        )}

        {data.options.showSummaries && data.totalNet !== undefined && (
          <View style={S.totals} wrap={false}>
            <View style={S.totalRow}><Text>Netto</Text><Text>{money(data.totalNet)}</Text></View>
            {data.options.showTax && data.totalTax !== undefined && (
              <View style={S.totalRow}><Text>Steuer</Text><Text>{money(data.totalTax)}</Text></View>
            )}
            {data.totalGross !== undefined && (
              <View style={[S.totalRow, S.totalStrong]}><Text>Gesamt</Text><Text>{money(data.totalGross)}</Text></View>
            )}
          </View>
        )}

        <View style={S.footer} fixed>
          <Text style={S.footerText}>{c.companyName}{c.phone ? ` · ${c.phone}` : ''}{c.email ? ` · ${c.email}` : ''}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

type OrderPdfColumn = ReturnType<typeof getOrderPdfColumns>[number]

function OrderTableHeader({ columns }: { columns: OrderPdfColumn[] }) {
  return (
    <View style={S.tableHeader}>
      {columns.map((column) => (
        <Text key={column.key} style={[S.th, { width: column.width, textAlign: column.align }]}>
          {column.label}
        </Text>
      ))}
    </View>
  )
}

function OrderTableRow({
  item,
  columns,
}: {
  item: OrderPdfData['items'][number]
  columns: OrderPdfColumn[]
}) {
  return (
    <View style={S.tableRow} wrap={false}>
      {columns.map((column) => {
        let value: React.ReactNode = ''
        if (column.key === 'position') value = item.position
        if (column.key === 'quantity') value = item.quantity?.toLocaleString('de-DE')
        if (column.key === 'unit') value = item.unit
        if (column.key === 'unitPrice' && item.unitPrice !== undefined) value = money(item.unitPrice)
        if (column.key === 'taxRate' && item.taxRate !== undefined) value = `${item.taxRate} %`
        if (column.key === 'netAmount' && item.netAmount !== undefined) value = money(item.netAmount)
        return (
          <View key={column.key} style={{ width: column.width }}>
            {column.key === 'description' ? (
              <>
                <Text style={S.td}>{item.description}</Text>
                {item.notes && <Text style={S.notes}>{item.notes}</Text>}
              </>
            ) : (
              <Text style={[S.td, { textAlign: column.align }]}>{value}</Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

export async function renderOrderPdf(data: OrderPdfData): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<OrderDocument data={data} />))
}
