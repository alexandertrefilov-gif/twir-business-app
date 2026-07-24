// lib/pdf-templates/service-report.template.tsx
// React-PDF Template für Leistungsnachweise (LN)
// renderServiceReportPdf(data) → Buffer

import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { SERVICE_ITEM_TYPE_LABELS } from '@/lib/validators/service-report.schema'
import type { ServiceItemType } from '@/lib/validators/service-report.schema'

// ── Types ─────────────────────────────────────────────────────

export interface ServiceReportPdfData {
  reportNumber: string
  reportDate:   string   // 'dd.MM.yyyy'
  title?:       string | null
  description?: string | null

  company: {
    companyName:  string
    legalForm?:   string | null
    street?:      string | null
    houseNumber?: string | null
    postalCode?:  string | null
    city?:        string | null
    email?:       string | null
    phone?:       string | null
  }

  order: {
    orderNumber: string
    title?:      string | null
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

// ── Styles ────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:    { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1917', paddingTop: 40, paddingBottom: 50, paddingLeft: 50, paddingRight: 40 },
  h1:      { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  h2:      { fontSize: 9,  fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  label:   { fontSize: 7,  color: '#6b6b80', marginBottom: 2 },
  small:   { fontSize: 7.5, color: '#6b6b80' },
  body:    { fontSize: 9, lineHeight: 1.5, color: '#3a3a50' },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  metaBox:   { alignItems: 'flex-end' },
  docNum:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1e3a5f', marginBottom: 3 },

  infoGrid:  { flexDirection: 'row', gap: 24, marginBottom: 20 },
  infoCol:   { flex: 1 },

  divider:   { borderTop: '0.5 solid #d8d6d0', marginVertical: 10 },

  tableHdr: { flexDirection: 'row', backgroundColor: '#f5f4f1', borderBottom: '0.5 solid #d8d6d0', paddingHorizontal: 5, paddingVertical: 4 },
  tableRow: { flexDirection: 'row', borderBottom: '0.3 solid #ebe9e4', paddingHorizontal: 5, paddingVertical: 5 },
  tableAlt: { backgroundColor: '#faf9f7' },

  cPos:  { width: '5%' },
  cType: { width: '14%' },
  cDesc: { width: '36%' },
  cQty:  { width: '10%', textAlign: 'right' },
  cUnit: { width: '8%',  textAlign: 'right' },
  cPrice:{ width: '13%', textAlign: 'right' },
  cNet:  { width: '14%', textAlign: 'right' },

  th:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b6b80', textTransform: 'uppercase' },
  td:    { fontSize: 8.5 },
  mono:  { fontFamily: 'Courier', fontSize: 8 },
  bold:  { fontFamily: 'Helvetica-Bold' },

  totals:    { marginTop: 10, alignItems: 'flex-end' },
  totalsBox: { width: 190 },
  totRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },

  sigBox:  { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between' },
  sigLine: { borderTop: '0.5 solid #9a9890', width: 160, paddingTop: 4 },
  sigLabel:{ fontSize: 7.5, color: '#9a9890' },

  footer:   { position: 'absolute', bottom: 25, left: 50, right: 40, borderTop: '0.5 solid #d8d6d0', paddingTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt:{ fontSize: 7, color: '#9a9890', lineHeight: 1.5 },
  pageNum:  { fontSize: 7, color: '#9a9890' },
})

// ── Document ──────────────────────────────────────────────────

export function ServiceReportDocument({ data }: { data: ServiceReportPdfData }) {
  const c   = data.company
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

  return (
    <Document title={`Leistungsnachweis ${data.reportNumber}`} author={c.companyName}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.headerRow}>
          <View>
            <Text style={[S.h1]}>{c.companyName}{c.legalForm ? ` ${c.legalForm}` : ''}</Text>
            <Text style={S.small}>
              {[c.street, c.houseNumber].filter(Boolean).join(' ')}  ·  {[c.postalCode, c.city].filter(Boolean).join(' ')}
              {c.phone ? `  ·  ${c.phone}` : ''}{c.email ? `  ·  ${c.email}` : ''}
            </Text>
          </View>
          <View style={S.metaBox}>
            <Text style={S.docNum}>Leistungsnachweis {data.reportNumber}</Text>
            <Text style={S.small}>Datum: {data.reportDate}</Text>
            <Text style={S.small}>Auftrag: {data.order.orderNumber}</Text>
          </View>
        </View>

        <View style={S.divider} />

        {/* Info grid */}
        <View style={S.infoGrid}>
          <View style={S.infoCol}>
            <Text style={S.label}>Auftraggeber</Text>
            <Text style={S.td}>{data.customer.name}</Text>
            {(data.customer.street || data.customer.houseNumber) && (
              <Text style={S.small}>
                {[data.customer.street, data.customer.houseNumber].filter(Boolean).join(' ')}
              </Text>
            )}
            {(data.customer.postalCode || data.customer.city) && (
              <Text style={S.small}>
                {[data.customer.postalCode, data.customer.city].filter(Boolean).join(' ')}
              </Text>
            )}
          </View>
          <View style={S.infoCol}>
            <Text style={S.label}>Auftrag</Text>
            <Text style={[S.td, S.mono]}>{data.order.orderNumber}</Text>
            {data.order.title && <Text style={S.small}>{data.order.title}</Text>}
          </View>
          <View style={S.infoCol}>
            <Text style={S.label}>Berichtsdatum</Text>
            <Text style={S.td}>{data.reportDate}</Text>
            <Text style={[S.label, { marginTop: 6 }]}>Erstellt von</Text>
            <Text style={S.td}>{data.preparedBy}</Text>
          </View>
        </View>

        {/* Title + description */}
        {data.title && <Text style={[S.h2, { marginBottom: 4 }]}>{data.title}</Text>}
        {data.description && <Text style={[S.body, { marginBottom: 12 }]}>{data.description}</Text>}

        <View style={S.divider} />

        {/* Table */}
        <View style={S.tableHdr}>
          <Text style={[S.cPos,  S.th]}>#</Text>
          <Text style={[S.cType, S.th]}>Typ</Text>
          <Text style={[S.cDesc, S.th]}>Beschreibung</Text>
          <Text style={[S.cQty,  S.th]}>Menge</Text>
          <Text style={[S.cUnit, S.th]}>Einh.</Text>
          <Text style={[S.cPrice,S.th]}>Einzelpr.</Text>
          <Text style={[S.cNet,  S.th]}>Netto</Text>
        </View>

        {data.items.map((item, idx) => (
          <View key={idx} style={[S.tableRow, idx % 2 === 1 ? S.tableAlt : {}]}>
            <Text style={[S.cPos,  S.mono, { color: '#9a9890' }]}>{item.position}</Text>
            <Text style={[S.cType, S.td,  { fontSize: 7.5 }]}>
              {SERVICE_ITEM_TYPE_LABELS[item.type] ?? item.type}
            </Text>
            <View style={S.cDesc}>
              <Text style={[S.td, S.bold]}>{item.description}</Text>
              {item.notes && <Text style={[S.small, { marginTop: 1 }]}>{item.notes}</Text>}
            </View>
            <Text style={[S.cQty,  S.mono]}>
              {item.quantity.toLocaleString('de-DE', { maximumFractionDigits: 3 })}
            </Text>
            <Text style={[S.cUnit, S.td]}>{item.unit}</Text>
            <Text style={[S.cPrice,S.mono]}>
              {item.unitPrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={[S.cNet,  S.mono, S.bold]}>
              {item.netAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        ))}

        {/* Totals */}
        <View style={S.totals}>
          <View style={S.totalsBox}>
            {(Object.entries(data.byType) as [ServiceItemType, number][])
              .filter(([, v]) => v > 0)
              .map(([type, amount]) => (
                <View key={type} style={S.totRow}>
                  <Text style={{ fontSize: 8, color: '#6b6b80' }}>{SERVICE_ITEM_TYPE_LABELS[type]}</Text>
                  <Text style={[S.mono, { fontSize: 8, color: '#6b6b80' }]}>{fmt(amount)}</Text>
                </View>
              ))}
            <View style={[S.totRow, { borderTop: '0.5 solid #c0bdb8', marginTop: 3, paddingTop: 4 }]}>
              <Text style={[S.td, S.bold]}>Gesamt netto</Text>
              <Text style={[S.mono, S.bold, { fontSize: 9.5 }]}>{fmt(data.totalNet)}</Text>
            </View>
          </View>
        </View>

        {/* Signature block */}
        <View style={S.sigBox}>
          <View>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Ort, Datum, Unterschrift Auftragnehmer</Text>
            <Text style={[S.sigLabel, { marginTop: 2 }]}>{data.preparedBy}</Text>
          </View>
          <View>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Ort, Datum, Unterschrift Auftraggeber</Text>
            <Text style={[S.sigLabel, { marginTop: 2 }]}>{data.customer.name}</Text>
          </View>
        </View>

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
