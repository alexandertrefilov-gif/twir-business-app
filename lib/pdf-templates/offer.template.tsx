// lib/pdf-templates/offer.template.tsx
// React-PDF Template für Angebote
// Verwendung: pdfService.generateOffer(offerId) → Buffer → speichern
// Import: @react-pdf/renderer (in package.json)

import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Font,
  renderToBuffer,
} from '@react-pdf/renderer'

// ── Typen ─────────────────────────────────────────────────────

export interface OfferPdfData {
  offerNumber:  string
  offerDate:    string    // 'dd.MM.yyyy'
  validUntil?:  string
  title?:       string | null
  introText?:   string | null
  outroText?:   string | null

  company: {
    companyName: string
    legalForm?:  string | null
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
  }

  customer: {
    name:        string
    street?:     string | null
    houseNumber?: string | null
    postalCode?: string | null
    city?:       string | null
    vatId?:      string | null
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

// ── Styles ────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily:  'Helvetica',
    fontSize:    9,
    color:       '#1a1917',
    paddingTop:  40,
    paddingBottom: 50,
    paddingLeft: 50,
    paddingRight: 40,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
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
    fontSize: 7,
    color:    '#6b6b80',
    borderBottom: '0.5 solid #c0bdb8',
    paddingBottom: 2,
    marginBottom: 4,
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
    fontSize: 8,
    color: '#6b6b80',
    lineHeight: 1.7,
  },
  docNumber: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1e3a5f',
    marginBottom: 4,
  },
  // Title
  offerTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    marginTop: 20,
  },
  introText: {
    fontSize: 9,
    lineHeight: 1.6,
    color: '#3a3a50',
    marginBottom: 16,
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
    fontFamily: 'Courier',
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
  totalsValue: { fontSize: 8.5, fontFamily: 'Courier' },
  totalsDivider: {
    borderTop: '0.5 solid #c0bdb8',
    marginVertical: 3,
  },
  totalsBoldLabel: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  totalsBoldValue: { fontSize: 9.5, fontFamily: 'Courier' },
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
    bottom: 25,
    left: 50,
    right: 40,
    borderTop: '0.5 solid #d8d6d0',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: '#9a9890',
    lineHeight: 1.6,
  },
  pageNumber: {
    fontSize: 7,
    color: '#9a9890',
  },
})

// ── PDF Component ─────────────────────────────────────────────

export function OfferDocument({ data }: { data: OfferPdfData }) {
  const c   = data.company
  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

  return (
    <Document
      title={`Angebot ${data.offerNumber}`}
      author={c.companyName}
    >
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.companyName}>
              {c.companyName}{c.legalForm ? ` ${c.legalForm}` : ''}
            </Text>
            <Text style={S.companyDetail}>
              {[c.street, c.houseNumber].filter(Boolean).join(' ')}{'\n'}
              {[c.postalCode, c.city].filter(Boolean).join(' ')}{'\n'}
              {c.phone ? `Tel.: ${c.phone}` : ''}{c.email ? `  ·  ${c.email}` : ''}
            </Text>

            {/* Recipient address */}
            <View style={S.addressBlock}>
              <Text style={S.senderSmall}>
                {c.companyName} · {[c.street, c.houseNumber].filter(Boolean).join(' ')} · {[c.postalCode, c.city].filter(Boolean).join(' ')}
              </Text>
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
              {data.customer.vatId && (
                <Text style={[S.addressLine, { color: '#6b6b80', marginTop: 4, fontSize: 7.5 }]}>
                  USt-IdNr.: {data.customer.vatId}
                </Text>
              )}
            </View>
          </View>

          {/* Doc meta */}
          <View style={S.docMeta}>
            <Text style={S.docNumber}>Angebot {data.offerNumber}</Text>
            <Text>Datum: {data.offerDate}</Text>
            {data.validUntil && <Text>Gültig bis: {data.validUntil}</Text>}
          </View>
        </View>

        {/* ── Title ── */}
        <Text style={S.offerTitle}>
          {data.title
            ? `Angebot – ${data.title}`
            : `Angebot ${data.offerNumber}`}
        </Text>

        {/* ── Intro ── */}
        {data.introText && (
          <Text style={S.introText}>{data.introText}</Text>
        )}

        {/* ── Items table ── */}
        {/* Header */}
        <View style={S.tableHeader}>
          <Text style={[S.colPos,  S.thText]}>#</Text>
          <Text style={[S.colDesc, S.thText]}>Beschreibung</Text>
          <Text style={[S.colQty,  S.thText]}>Menge</Text>
          <Text style={[S.colUnit, S.thText]}>Einh.</Text>
          <Text style={[S.colPrice,S.thText]}>Einzelpr.</Text>
          <Text style={[S.colTax,  S.thText]}>MwSt.</Text>
          <Text style={[S.colNet,  S.thText]}>Netto</Text>
          <Text style={[S.colGross,S.thText]}>Brutto</Text>
        </View>

        {data.items.map((item, idx) => (
          <View
            key={idx}
            style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}
          >
            <Text style={[S.colPos,   S.tdText, { color: '#9a9890' }]}>{item.position}</Text>
            <View style={S.colDesc}>
              <Text style={[S.tdText, S.tdBold]}>{item.description}</Text>
              {item.notes && (
                <Text style={[S.tdText, { color: '#6b6b80', fontSize: 7.5 }]}>{item.notes}</Text>
              )}
            </View>
            <Text style={[S.colQty,   S.tdMono]}>
              {item.quantity.toLocaleString('de-DE', { maximumFractionDigits: 3 })}
            </Text>
            <Text style={[S.colUnit,  S.tdText]}>{item.unit}</Text>
            <Text style={[S.colPrice, S.tdMono]}>
              {item.unitPrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={[S.colTax,   S.tdMono]}>{item.taxRate} %</Text>
            <Text style={[S.colNet,   S.tdMono]}>
              {item.netAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={[S.colGross, S.tdMono, S.tdBold]}>
              {item.grossAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        ))}

        {/* ── Totals ── */}
        <View style={S.totalsSection}>
          <View style={S.totalsBox}>
            <TotRow label="Nettobetrag"  value={fmt(data.totalNet)} />
            {Object.entries(data.taxGroups)
              .filter(([, v]) => v > 0)
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

        {/* ── Outro ── */}
        {data.outroText && (
          <Text style={S.outroText}>{data.outroText}</Text>
        )}

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            {c.companyName}{c.legalForm ? ` ${c.legalForm}` : ''}{'\n'}
            {c.vatId ? `USt-IdNr.: ${c.vatId}` : ''}{c.taxNumber ? `  ·  St-Nr.: ${c.taxNumber}` : ''}{'\n'}
            {c.bankName ? `${c.bankName}` : ''}{c.iban ? `  ·  IBAN: ${c.iban}` : ''}{c.bic ? `  ·  BIC: ${c.bic}` : ''}
          </Text>
          <Text
            style={S.pageNumber}
            render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`}
            fixed
          />
        </View>

      </Page>
    </Document>
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

// ── Helper component ──────────────────────────────────────────

function TotRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={S.totalsRow}>
      <Text style={[S.totalsLabel, muted ? { color: '#9a9890' } : {}]}>{label}</Text>
      <Text style={[S.totalsValue, muted ? { color: '#9a9890' } : {}]}>{value}</Text>
    </View>
  )
}
