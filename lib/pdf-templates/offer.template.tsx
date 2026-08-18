// lib/pdf-templates/offer.template.tsx
// React-PDF Template für Angebote
// Verwendung: pdfService.generateOffer(offerId) → Buffer → speichern
// Import: @react-pdf/renderer (in package.json)

import React from 'react'
import {
  Document, Image as PdfImage, Page, Text, View, StyleSheet, Font,
  renderToBuffer,
} from '@react-pdf/renderer'
import {
  decodeOfferText,
  getTableColumnPercentages,
  type RichTextMark,
  type RichTextNode,
} from '@/lib/offers/rich-text'
import { normalizeWordFontSize } from '@/lib/offers/word-paste'

const A4_WIDTH_POINTS = 595.28
const OFFER_PAGE_LEFT_PADDING = 50
const OFFER_PAGE_RIGHT_PADDING = 40
export const OFFER_PAGE_BOTTOM_PADDING = 104
export const OFFER_FOOTER_BOTTOM = 20
export const OFFER_FOOTER_MIN_HEIGHT = 72
export const OFFER_CONTENT_WIDTH_POINTS =
  A4_WIDTH_POINTS - OFFER_PAGE_LEFT_PADDING - OFFER_PAGE_RIGHT_PADDING
const RICH_TABLE_PAGE_BUDGET_POINTS = 400

// ── Typen ─────────────────────────────────────────────────────

export interface OfferPdfData {
  offerNumber:  string
  offerDate:    string    // 'dd.MM.yyyy'
  validUntil?:  string
  title?:       string | null
  introText?:   string | null
  outroText?:   string | null
  logoDataUri?: string
  logoScale?: number

  company: {
    companyName: string
    legalForm?:  string | null
    businessActivity?: string | null
    street?:     string | null
    houseNumber?: string | null
    postalCode?: string | null
    city?:       string | null
    vatId?:      string | null
    taxNumber?:  string | null
    email?:      string | null
    phone?:      string | null
    website?:    string | null
    bankName?:   string | null
    iban?:       string | null
    bic?:        string | null
    registerCourt?: string | null
    registerNumber?: string | null
    managingDirector?: string | null
    supplierNumber?: string | null
  }

  customer: {
    name:        string
    street?:     string | null
    houseNumber?: string | null
    postalCode?: string | null
    city?:       string | null
    vatId?:      string | null
    contactSalutation?: string | null
    contactFirstName?:  string | null
    contactLastName?:   string | null
    contactDepartment?: string | null
  }

  items: Array<{
    position:    number
    description: string
    quantity:    number
    unit:        string
    unitPrice:   number
    taxRate:     number
    netAmount:   number
    taxAmount:   number
    grossAmount: number
    notes?:      string | null
  }>

  totalNet:   number
  totalTax:   number
  totalGross: number
  taxGroups:  Record<string, number>
}

export function getOfferLogoDimensions(scale = 140) {
  const safeScale = Math.min(200, Math.max(50, scale))
  const width = 110 * safeScale / 100
  const height = 55 * safeScale / 100
  const pageFit = Math.min(1, 420 / width, 240 / height)
  return {
    width: width * pageFit,
    height: height * pageFit,
  }
}

// ── Styles ────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily:  'Helvetica',
    fontSize:    9,
    color:       '#1a1917',
    paddingTop:  28,
    // Platz für fünf Footerzeilen plus kompakter Abstand oberhalb der Linie.
    paddingBottom: OFFER_PAGE_BOTTOM_PADDING,
    paddingLeft: 50,
    paddingRight: 40,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  logoAddressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 18,
    borderBottom: '1 solid #9f9c95',
    paddingBottom: 2,
    marginBottom: 4,
  },
  headerRight: {
    width: 210,
    alignItems: 'flex-end',
    paddingTop: 8,
  },
  companyLogo: {
    width: 110,
    height: 80,
    objectFit: 'contain',
  },
  companyName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  companyDetail: {
    fontSize: 8,
    color:    '#6b6b80',
    lineHeight: 1.5,
  },
  // Sender line above address
  senderSmall: {
    flex: 1,
    fontSize: 7,
    color:    '#6b6b80',
  },
  // Address block
  addressBlock: {
    marginTop: 8,
  },
  addressLine: {
    fontSize: 9,
    lineHeight: 1.5,
  },
  // Doc meta
  docMeta: {
    alignItems: 'flex-end',
    fontSize: 9,
    color: '#6b6b80',
    lineHeight: 1.5,
  },
  docNumber: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1e3a5f',
    marginBottom: 0,
  },
  introText: {
    fontSize: 9,
    lineHeight: 1.6,
    color: '#3a3a50',
    marginBottom: 16,
  },
  richSection: { marginBottom: 14 },
  documentType: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
  },
  richSectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1e3a5f',
    marginBottom: 8,
  },
  richHeading: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1e3a5f',
    marginTop: 8,
    marginBottom: 6,
  },
  richParagraph: {
    fontSize: 11,
    lineHeight: 1.35,
    color: '#3a3a50',
    marginBottom: 6,
  },
  richQuote: {
    fontSize: 11,
    lineHeight: 1.5,
    color: '#4b5563',
    backgroundColor: '#f5f7fa',
    borderLeft: '2 solid #93b4d8',
    padding: 6,
    marginBottom: 5,
  },
  richRule: { borderTop: '0.5 solid #c9c7c1', marginVertical: 6 },
  richTable: {
    width: OFFER_CONTENT_WIDTH_POINTS,
    alignSelf: 'stretch',
    borderTop: '1 solid #68645d',
    borderLeft: '1 solid #68645d',
    marginVertical: 6,
  },
  richTableRow: {
    width: OFFER_CONTENT_WIDTH_POINTS,
    alignSelf: 'stretch',
    flexDirection: 'row',
  },
  richTableCell: {
    borderRight: '1 solid #68645d',
    borderBottom: '1 solid #68645d',
    padding: 4,
    fontSize: 11,
    lineHeight: 1.4,
  },
  richTableHeader: {
    backgroundColor: '#f0f3f6',
    fontFamily: 'Helvetica-Bold',
  },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f4f1',
    borderBottom: '0.5 solid #d8d6d0',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.3 solid #ebe9e4',
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  tableRowAlt: {
    backgroundColor: '#faf9f7',
  },
  colPos:   { width: '6%' },
  colDesc:  { width: '36%' },
  colQty:   { width: '10%', textAlign: 'right' },
  colUnit:  { width: '8%',  textAlign: 'right' },
  colPrice: { width: '14%', textAlign: 'right' },
  colTax:   { width: '8%',  textAlign: 'right' },
  colNet:   { width: '14%', textAlign: 'right' },
  colGross: { width: '14%', textAlign: 'right' },
  thText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#6b6b80',
    textTransform: 'uppercase',
  },
  tdText: {
    fontSize: 8.5,
    lineHeight: 1.4,
  },
  tdMono: {
    fontSize: 8,
    fontFamily: 'Helvetica',
  },
  tdBold: {
    fontFamily: 'Helvetica-Bold',
  },
  // Totals
  totalsSection: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  totalsBox: {
    width: 200,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
  },
  totalsLabel: { fontSize: 8.5, color: '#3a3a50' },
  totalsValue: { fontSize: 8.5, fontFamily: 'Helvetica' },
  totalsDivider: {
    borderTop: '0.5 solid #c0bdb8',
    marginVertical: 3,
  },
  totalsBoldLabel: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  totalsBoldValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  // Outro
  outroText: {
    marginTop: 20,
    fontSize: 9,
    lineHeight: 1.6,
    color: '#3a3a50',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: OFFER_FOOTER_BOTTOM,
    left: 50,
    right: 40,
    minHeight: OFFER_FOOTER_MIN_HEIGHT,
    borderTop: '1 solid #aaa7a0',
    paddingTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: '#9a9890',
    lineHeight: 1.6,
  },
  footerLeftText: {
    width: '52%',
  },
  footerRightText: {
    width: '48%',
    fontSize: 7,
    color: '#9a9890',
    lineHeight: 1.6,
  },
  pageNumber: {
    position: 'absolute',
    right: 0,
    bottom: -10,
    fontSize: 7,
    color: '#9a9890',
  },
})

// ── PDF Component ─────────────────────────────────────────────

export function OfferDocument({ data }: { data: OfferPdfData }) {
  const c   = data.company
  const paginatedIntro = getPaginatedRichTable(data.introText)

  if (paginatedIntro) {
    return (
      <Document title={`Angebot ${data.offerNumber}`} author={c.companyName}>
        {paginatedIntro.pages.map((tablePage, pageIndex) => {
          const firstPage = pageIndex === 0
          const lastPage = pageIndex === paginatedIntro.pages.length - 1
          return (
            <Page key={pageIndex} size="A4" style={S.page} wrap={false}>
              {firstPage && (
                <>
                  <OfferHeader data={data} />
                  <Text style={S.documentType}>Angebot</Text>
                  <PdfBlocks nodes={paginatedIntro.beforeTable} />
                </>
              )}
              <PdfTablePageView page={tablePage} columnWidths={paginatedIntro.columnWidths} />
              {lastPage && (
                <>
                  <PdfBlocks nodes={paginatedIntro.afterTable} />
                  <OfferCommercialBody data={data} />
                  <OfferRichTextPdf value={data.outroText} />
                </>
              )}
              <OfferFooter data={data} />
            </Page>
          )
        })}
      </Document>
    )
  }

  return (
    <Document
      title={`Angebot ${data.offerNumber}`}
      author={c.companyName}
    >
      <Page size="A4" style={S.page}>
        <OfferHeader data={data} />

        <Text style={S.documentType}>Angebot</Text>

        {/* ── Intro ── */}
        <OfferRichTextPdf value={data.introText} />

        <OfferCommercialBody data={data} />

        {/* ── Outro ── */}
        <OfferRichTextPdf value={data.outroText} />

        <OfferFooter data={data} />

      </Page>
    </Document>
  )
}

function OfferHeader({ data }: { data: OfferPdfData }) {
  const c = data.company
  return (
    <>
      <View style={S.logoAddressRow}>
        <Text style={S.senderSmall}>
          {c.companyName} TB · {[c.street, c.houseNumber].filter(Boolean).join(' ')} · {[c.postalCode, c.city].filter(Boolean).join(' ')}
        </Text>
        {data.logoDataUri && (
          <PdfImage
            src={data.logoDataUri}
            style={[S.companyLogo, getOfferLogoDimensions(data.logoScale)]}
          />
        )}
      </View>
      <View style={S.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={S.addressBlock}>
            {getOfferRecipientLines(data.customer).map((line, index) => (
              <Text key={index} style={S.addressLine}>{line}</Text>
            ))}
            {data.customer.vatId && (
              <Text style={[S.addressLine, { color: '#6b6b80', marginTop: 4, fontSize: 7.5 }]}>
                USt-IdNr.: {data.customer.vatId}
              </Text>
            )}
          </View>
        </View>
        <View style={S.headerRight}>
          <View style={S.docMeta}>
            <Text style={S.docNumber}>
              Angebot {offerNumberForDocument(data.offerNumber)}
            </Text>
            {c.supplierNumber && <Text>LN-Nr.: {c.supplierNumber}</Text>}
            <Text>Datum: {data.offerDate}</Text>
            {data.validUntil && <Text>Gültig bis: {data.validUntil}</Text>}
          </View>
        </View>
      </View>
    </>
  )
}

function OfferCommercialBody({ data }: { data: OfferPdfData }) {
  const fmt = (number: number) =>
    number.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  return (
    <>
      <View style={S.tableHeader}>
        <Text style={[S.colPos, S.thText]}>#</Text>
        <Text style={[S.colDesc, S.thText]}>Beschreibung</Text>
        <Text style={[S.colQty, S.thText]}>Menge</Text>
        <Text style={[S.colUnit, S.thText]}>Einh.</Text>
        <Text style={[S.colPrice, S.thText]}>Einzelpr.</Text>
        <Text style={[S.colTax, S.thText]}>MwSt.</Text>
        <Text style={[S.colNet, S.thText]}>Netto</Text>
        <Text style={[S.colGross, S.thText]}>Brutto</Text>
      </View>
      {data.items.map((item, index) => (
        <View key={index} style={[S.tableRow, index % 2 === 1 ? S.tableRowAlt : {}]}>
          <Text style={[S.colPos, S.tdText, { color: '#9a9890' }]}>{item.position}</Text>
          <View style={S.colDesc}>
            <Text style={[S.tdText, S.tdBold]}>{item.description}</Text>
            {item.notes && <Text style={[S.tdText, { color: '#6b6b80', fontSize: 7.5 }]}>{item.notes}</Text>}
          </View>
          <Text style={[S.colQty, S.tdMono]}>{item.quantity.toLocaleString('de-DE', { maximumFractionDigits: 3 })}</Text>
          <Text style={[S.colUnit, S.tdText]}>{item.unit}</Text>
          <Text style={[S.colPrice, S.tdMono]}>{item.unitPrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <Text style={[S.colTax, S.tdMono]}>{item.taxRate} %</Text>
          <Text style={[S.colNet, S.tdMono]}>{item.netAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <Text style={[S.colGross, S.tdMono, S.tdBold]}>{item.grossAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>
      ))}
      <View style={S.totalsSection}>
        <View style={S.totalsBox}>
          <TotRow label="Nettobetrag" value={fmt(data.totalNet)} />
          {Object.entries(data.taxGroups)
            .filter(([, value]) => value > 0)
            .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
            .map(([rate, amount]) => (
              <TotRow key={rate} label={`zzgl. ${rate}% MwSt.`} value={fmt(amount)} muted />
            ))}
          <View style={S.totalsDivider} />
          <View style={S.totalsRow}>
            <Text style={S.totalsBoldLabel}>Gesamtbetrag brutto</Text>
            <Text style={S.totalsBoldValue}>{fmt(data.totalGross)}</Text>
          </View>
        </View>
      </View>
    </>
  )
}

function OfferFooter({ data }: { data: OfferPdfData }) {
  const c = data.company
  return (
    <View style={S.footer} fixed>
      <FooterRow left={`${c.companyName} Technisches Büro`} right={[
        c.registerNumber ? `HRB ${c.registerNumber}` : '',
        c.registerCourt ? `Amtsgericht ${c.registerCourt}` : '',
      ].filter(Boolean).join('  ')} />
      <FooterRow left={c.businessActivity ? `Art der Tätigkeit: ${c.businessActivity}` : ''} right="" />
      <FooterRow left={c.managingDirector ? `Geschäftsführer: ${c.managingDirector}` : ''} right={c.taxNumber ? `Steuernummer: ${c.taxNumber}` : ''} />
      <FooterRow left={`Firmensitz: ${[c.postalCode, c.city].filter(Boolean).join(' ')}, ${[c.street, c.houseNumber].filter(Boolean).join(' ')}`} right={c.bankName ? `BANK: ${c.bankName}` : ''} />
      <FooterRow left={c.phone ? `M: ${formatCompanyPhone(c.phone)}` : ''} right={c.iban ? `IBAN: ${c.iban}` : ''} />
      <FooterRow left={c.email ? `E-Mail: ${c.email}` : ''} right={c.bic ? `Swift (BIC):${c.bic}` : ''} />
      <Text
        style={S.pageNumber}
        render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`}
        fixed
      />
    </View>
  )
}

// ── Render helper ─────────────────────────────────────────────

/**
 * Erzeugt ein PDF als Buffer.
 * Aufruf in Server-Kontext (API Route oder Server Action).
 *
 * @example
 * const buf = await renderOfferPdf(data)
 * await fs.writeFile(`/storage/offers/${data.offerNumber}.pdf`, buf)
 */
export async function renderOfferPdf(data: OfferPdfData): Promise<Buffer> {
  return renderToBuffer(<OfferDocument data={data} />)
}

/** Im Dokument steht nur der numerische Anteil; Übersicht und Dateiname behalten das Präfix. */
export function offerNumberForDocument(offerNumber: string): string {
  return offerNumber.match(/\d.*$/)?.[0] ?? offerNumber
}

export function getOfferRecipientLines(
  customer: OfferPdfData['customer'],
): string[] {
  const contactName = [
    customer.contactFirstName,
    customer.contactLastName,
  ].filter(Boolean).join(' ')
  const contactLine = [
    customer.contactSalutation,
    customer.contactFirstName,
    customer.contactLastName,
  ].filter(Boolean).join(' ')
  const customerDuplicatesContact = Boolean(
    contactName &&
    normalizeRecipientName(customer.name) === normalizeRecipientName(contactName),
  )

  return [
    customerDuplicatesContact ? '' : customer.name,
    contactLine,
    customer.contactDepartment,
    [customer.street, customer.houseNumber].filter(Boolean).join(' '),
    [customer.postalCode, customer.city].filter(Boolean).join(' '),
  ].filter((line): line is string => Boolean(line))
}

function normalizeRecipientName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/^(herr|frau)\s+/, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
}

// ── Helper component ──────────────────────────────────────────

function TotRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={S.totalsRow}>
      <Text style={[S.totalsLabel, muted ? { color: '#9a9890' } : {}]}>{label}</Text>
      <Text style={[S.totalsValue, muted ? { color: '#9a9890' } : {}]}>{value}</Text>
    </View>
  )
}

function FooterRow({ left, right }: { left: string; right: string }) {
  return (
    <View style={S.footerRow}>
      <Text style={[S.footerText, S.footerLeftText]}>{left}</Text>
      <Text style={S.footerRightText}>{right}</Text>
    </View>
  )
}

function formatCompanyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('49')) {
    return `(+ 49) ${digits.slice(2, 6)} ${digits.slice(6, 9)}-${digits.slice(9, 10)}-${digits.slice(10)}`
  }
  if (digits.length === 15 && digits.startsWith('0049')) {
    return `(+ 49) ${digits.slice(4, 8)} ${digits.slice(8)}`
  }
  if (digits.length === 12 && digits.startsWith('0')) {
    return `(+ 49) ${digits.slice(1, 5)} ${digits.slice(5, 8)}-${digits.slice(8, 9)}-${digits.slice(9)}`
  }
  return phone
}

function OfferRichTextPdf({ value }: { value?: string | null }) {
  if (!value) return null
  const document = decodeOfferText(value)

  return (
    <>
      {document.sections.map((section) => (
        <React.Fragment key={section.id}>
          {section.title && <Text style={S.richSectionTitle}>{section.title}</Text>}
          <PdfBlocks nodes={section.content.content ?? []} />
        </React.Fragment>
      ))}
    </>
  )
}

function PdfBlocks({ nodes }: { nodes: RichTextNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        const textAlign = pdfTextAlign(node)
        switch (node.type) {
          case 'paragraph':
            return (
              <Text key={index} style={[S.richParagraph, textAlign]}>
                {(node.content?.length ?? 0) > 0
                  ? <PdfInline nodes={node.content ?? []} legacyPixelFontSize={11} />
                  : '\u00A0'}
              </Text>
            )
          case 'heading':
            return (
              <Text
                key={index}
                style={[S.richHeading, headingSpacing(node), textAlign]}
              >
                <PdfInline
                  nodes={node.content ?? []}
                  legacyPixelFontSize={headingFontSize(node)}
                  forceBold
                />
              </Text>
            )
          case 'blockquote':
            return (
              <Text key={index} style={S.richQuote}>
                <PdfInline nodes={node.content ?? []} legacyPixelFontSize={11} />
              </Text>
            )
          case 'bulletList':
          case 'orderedList':
            return (
              <View key={index}>
                {(node.content ?? []).map((item, itemIndex) => (
                  <Text key={itemIndex} style={S.richParagraph}>
                    {node.type === 'bulletList' ? '• ' : `${itemIndex + 1}. `}
                    <PdfInline nodes={item.content ?? []} legacyPixelFontSize={11} />
                  </Text>
                ))}
              </View>
            )
          case 'horizontalRule':
            return <View key={index} style={S.richRule} />
          case 'table': {
            const columnWidths = getPdfTableColumnWidths(node)
            return (
              <React.Fragment key={index}>
                {paginatePdfTable(node, columnWidths).map((page, pageIndex) => (
                  <PdfTablePageView
                    key={pageIndex}
                    page={page}
                    columnWidths={columnWidths}
                  />
                ))}
              </React.Fragment>
            )
          }
          default:
            return null
        }
      })}
    </>
  )
}

function headingSpacing(node: RichTextNode) {
  const fontSize = headingFontSize(node)
  if (fontSize === 14) return { fontSize, marginTop: 10, marginBottom: 8 }
  if (fontSize === 11) return { fontSize, marginTop: 6, marginBottom: 5 }
  return { fontSize, marginTop: 8, marginBottom: 6 }
}

function headingFontSize(node: RichTextNode): 11 | 12 | 14 {
  const level = Number(node.attrs?.level ?? 2)
  if (level === 1) return 14
  if (level === 3) return 11
  return 12
}

export function getPdfTableColumnWidths(table: RichTextNode): number[] {
  return getTableColumnPercentages(table)
}

export interface PdfTablePage {
  headerRows: RichTextNode[]
  bodyRows: RichTextNode[]
  hasOversizedRow: boolean
}

interface PaginatedRichTable {
  beforeTable: RichTextNode[]
  afterTable: RichTextNode[]
  columnWidths: number[]
  pages: PdfTablePage[]
}

function getPaginatedRichTable(value?: string | null): PaginatedRichTable | null {
  if (!value) return null
  const document = decodeOfferText(value)
  const blocks = document.sections.flatMap((section) => [
    ...(section.title
      ? [{
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: section.title }],
        } satisfies RichTextNode]
      : []),
    ...(section.content.content ?? []),
  ])
  const tableIndexes = blocks.flatMap((node, index) => node.type === 'table' ? [index] : [])
  if (tableIndexes.length !== 1) return null
  const tableIndex = tableIndexes[0]
  const table = blocks[tableIndex]
  if (!table) return null
  const columnWidths = getPdfTableColumnWidths(table)
  const pages = paginatePdfTable(table, columnWidths)
  if (pages.length < 2 || pages.some((page) => page.hasOversizedRow)) return null
  return {
    beforeTable: blocks.slice(0, tableIndex),
    afterTable: blocks.slice(tableIndex + 1),
    columnWidths,
    pages,
  }
}

export function paginatePdfTable(
  table: RichTextNode,
  columnWidths = getPdfTableColumnWidths(table),
  pageBudget = RICH_TABLE_PAGE_BUDGET_POINTS,
): PdfTablePage[] {
  const rows = table.content ?? []
  const headerRows = rows.filter((row, index) =>
    index === 0 || rows.slice(0, index).every(isPdfHeaderRow)
      ? isPdfHeaderRow(row)
      : false)
  const bodyRows = rows.slice(headerRows.length)
  if (bodyRows.length === 0) {
    return [{ headerRows: [], bodyRows: headerRows, hasOversizedRow: false }]
  }

  const headerHeight = headerRows.reduce(
    (sum, row) => sum + estimatePdfTableRowHeight(row, columnWidths),
    0,
  )
  const bodyBudget = Math.max(80, pageBudget - headerHeight)
  const pages: PdfTablePage[] = []
  let currentRows: RichTextNode[] = []
  let currentHeight = 0

  for (const row of bodyRows) {
    const rowHeight = estimatePdfTableRowHeight(row, columnWidths)
    if (currentRows.length > 0 && currentHeight + rowHeight > bodyBudget) {
      pages.push({ headerRows, bodyRows: currentRows, hasOversizedRow: false })
      currentRows = []
      currentHeight = 0
    }
    if (rowHeight > bodyBudget) {
      if (currentRows.length > 0) {
        pages.push({ headerRows, bodyRows: currentRows, hasOversizedRow: false })
        currentRows = []
        currentHeight = 0
      }
      pages.push({ headerRows, bodyRows: [row], hasOversizedRow: true })
      continue
    }
    currentRows.push(row)
    currentHeight += rowHeight
  }
  if (currentRows.length > 0) {
    pages.push({ headerRows, bodyRows: currentRows, hasOversizedRow: false })
  }
  return pages
}

export function estimatePdfTableRowHeight(
  row: RichTextNode,
  columnWidths: number[],
): number {
  let offset = 0
  let maximum = 24
  for (const cell of row.content ?? []) {
    const colspan = pdfCellColspan(cell)
    const width = columnWidths
      .slice(offset, offset + colspan)
      .reduce((sum, percentage) => sum + OFFER_CONTENT_WIDTH_POINTS * percentage / 100, 0)
    offset += colspan
    const text = pdfNodeText(cell)
    const charactersPerLine = Math.max(4, Math.floor((width - 8) / 5.8))
    const paragraphs = text.split('\n')
    const lineCount = paragraphs.reduce(
      (sum, paragraph) => sum + Math.max(1, Math.ceil(paragraph.length / charactersPerLine)),
      0,
    )
    const contentHeight = lineCount * 11 * 1.4 + 8
    const requestedHeight = typeof cell.attrs?.rowHeight === 'number'
      ? cell.attrs.rowHeight * 0.75
      : 0
    maximum = Math.max(maximum, contentHeight, requestedHeight)
  }
  return maximum
}

function isPdfHeaderRow(row: RichTextNode): boolean {
  return (row.content?.length ?? 0) > 0 &&
    (row.content ?? []).every((cell) => cell.type === 'tableHeader')
}

function pdfNodeText(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'paragraph') return (node.content ?? []).map(pdfNodeText).join('')
  return (node.content ?? []).map(pdfNodeText).filter(Boolean).join('\n')
}

function PdfTableRow({
  row,
  columnWidths,
  allowSplit,
}: {
  row: RichTextNode
  columnWidths: number[]
  allowSplit: boolean
}) {
  return (
    <View style={S.richTableRow} wrap={allowSplit}>
      {(row.content ?? []).map((cell, cellIndex) => {
        const columnOffset = (row.content ?? [])
          .slice(0, cellIndex)
          .reduce((sum, previousCell) => sum + pdfCellColspan(previousCell), 0)
        return (
          <View
            key={cellIndex}
            style={[
              S.richTableCell,
              cell.type === 'tableHeader' ? S.richTableHeader : {},
              pdfTableCellSize(cell, columnWidths, columnOffset),
              typeof cell.attrs?.backgroundColor === 'string'
                ? {
                    backgroundColor: cell.attrs.backgroundColor,
                    color: isDarkPdfCellColor(cell.attrs.backgroundColor)
                      ? '#ffffff'
                      : '#1a1917',
                  }
                : {},
            ]}
          >
            <PdfTableCellContent
              nodes={cell.content ?? []}
              forceBold={cell.type === 'tableHeader'}
            />
          </View>
        )
      })}
    </View>
  )
}

function PdfTablePageView({
  page,
  columnWidths,
}: {
  page: PdfTablePage
  columnWidths: number[]
}) {
  return (
    <View style={S.richTable} wrap={page.hasOversizedRow}>
      {[...page.headerRows, ...page.bodyRows].map((row, rowIndex) => (
        <PdfTableRow
          key={rowIndex}
          row={row}
          columnWidths={columnWidths}
          allowSplit={page.hasOversizedRow && page.bodyRows.includes(row)}
        />
      ))}
    </View>
  )
}

function pdfTableCellSize(
  cell: RichTextNode,
  columnWidths: number[],
  columnOffset: number,
) {
  const colspan = pdfCellColspan(cell)
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0)
  const cellWidth = columnWidths
    .slice(columnOffset, columnOffset + colspan)
    .reduce((sum, width) => sum + width, 0)
  return {
    ...(cellWidth > 0 && totalWidth > 0
      ? {
          width: OFFER_CONTENT_WIDTH_POINTS * cellWidth / totalWidth,
          flexGrow: 0,
          flexShrink: 0,
        }
      : {}),
    minHeight: typeof cell.attrs?.rowHeight === 'number'
      ? cell.attrs.rowHeight * 0.75
      : undefined,
  }
}

function pdfCellColspan(cell: RichTextNode): number {
  const colspan = Number(cell.attrs?.colspan ?? 1)
  return Number.isInteger(colspan) && colspan > 0 ? colspan : 1
}

function PdfTableCellContent({
  nodes,
  forceBold,
}: {
  nodes: RichTextNode[]
  forceBold: boolean
}) {
  return (
    <Text>
      {nodes.map((node, index) => (
        <React.Fragment key={index}>
          {index > 0 ? '\n' : null}
          <PdfInline
            nodes={node.content ?? [node]}
            legacyPixelFontSize={11}
            forceBold={forceBold}
          />
        </React.Fragment>
      ))}
    </Text>
  )
}

function isDarkPdfCellColor(color: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return false
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 < 128
}

function PdfInline({
  nodes,
  legacyPixelFontSize,
  forceBold = false,
}: {
  nodes: RichTextNode[]
  legacyPixelFontSize?: number
  forceBold?: boolean
}) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'hardBreak') return <Text key={index}>{'\n'}</Text>
        if (node.type === 'text') {
          return (
            <Text
              key={index}
              style={pdfMarkStyle(node.marks ?? [], legacyPixelFontSize, forceBold)}
            >
              {node.text}
            </Text>
          )
        }
        return (
          <PdfInline
            key={index}
            nodes={node.content ?? []}
            legacyPixelFontSize={legacyPixelFontSize}
            forceBold={forceBold}
          />
        )
      })}
    </>
  )
}

function pdfMarkStyle(
  marks: RichTextMark[],
  legacyPixelFontSize?: number,
  forceBold = false,
) {
  const types = new Set(marks.map((mark) => mark.type))
  const textStyle = marks.find((mark) => mark.type === 'textStyle')?.attrs
  const family = typeof textStyle?.fontFamily === 'string' ? textStyle.fontFamily : 'Helvetica'
  const fontFamily = pdfFontFamily(
    family,
    forceBold || types.has('bold'),
    types.has('italic'),
  )
  const fontSize = editorFontSizeToPdfPoints(
    typeof textStyle?.fontSize === 'string' ? textStyle.fontSize : undefined,
    legacyPixelFontSize,
  )

  return {
    fontFamily,
    fontSize,
    color: typeof textStyle?.color === 'string' ? textStyle.color : undefined,
    backgroundColor: typeof textStyle?.backgroundColor === 'string'
      ? textStyle.backgroundColor
      : undefined,
    textDecoration: types.has('underline')
      ? 'underline'
      : types.has('strike')
        ? 'line-through'
        : undefined,
  } as const
}

/**
 * Browser und Editor verwenden CSS-Pixel, React-PDF erwartet typografische
 * Punkte. Bei 96 dpi entsprechen 4 px genau 3 pt.
 */
export function editorFontSizeToPdfPoints(
  fontSize?: string,
  legacyPixelFallback?: number,
): number | undefined {
  if (!fontSize) return undefined
  if (/^\d+(?:\.\d+)?px$/.test(fontSize) && legacyPixelFallback) {
    return legacyPixelFallback
  }
  const normalized = normalizeWordFontSize(fontSize)
  if (!normalized) return undefined
  return Number.parseFloat(normalized)
}

function pdfFontFamily(family: string, bold: boolean, italic: boolean) {
  const base = family === 'Times New Roman' || family === 'Georgia'
    ? 'Times'
    : family === 'Courier New'
      ? 'Courier'
      : 'Helvetica'
  if (base === 'Times') return bold && italic ? 'Times-BoldItalic' : bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman'
  if (base === 'Courier') return bold && italic ? 'Courier-BoldOblique' : bold ? 'Courier-Bold' : italic ? 'Courier-Oblique' : 'Courier'
  return bold && italic ? 'Helvetica-BoldOblique' : bold ? 'Helvetica-Bold' : italic ? 'Helvetica-Oblique' : 'Helvetica'
}

function pdfTextAlign(
  node: RichTextNode,
): { textAlign?: 'center' | 'right' | 'justify' } {
  const value = node.attrs?.textAlign
  return value === 'center' || value === 'right' || value === 'justify'
    ? { textAlign: value }
    : {}
}
