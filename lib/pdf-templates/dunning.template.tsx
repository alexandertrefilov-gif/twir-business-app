// lib/pdf-templates/dunning.template.tsx
// React-PDF Template für Mahnungen
// renderDunningPdf(data) → Buffer

import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import {
  PDF_BODY_TEXT_SIZE,
  PDF_HEADER_HEADING_STYLE,
  PDF_HEADER_TEXT_STYLE,
} from '@/lib/pdf-templates/document-header'
import { formatDecimalDe } from '@/lib/billing/format'
import { isPositiveMoney } from '@/lib/billing/open-amount'

// ── Types ─────────────────────────────────────────────────────

export interface DunningPdfData {
  noticeNumber:  string           // z.B. "MAHN-2024-001"
  noticeDate:    string           // 'dd.MM.yyyy'
  dueDate:       string
  level:         1 | 2 | 3
  levelLabel:    string
  /** Mahngebühr als Cent-String (Snapshot `feeAmount`), sonst null. */
  fee?:          string | null

  company: {
    companyName:  string
    legalForm?:   string | null
    street?:      string | null
    houseNumber?: string | null
    postalCode?:  string | null
    city?:        string | null
    vatId?:       string | null
    email?:       string | null
    phone?:       string | null
    bankName?:    string | null
    iban?:        string | null
    bic?:         string | null
  }

  customer: {
    name:         string
    legalName?:   string | null
    street?:      string | null
    houseNumber?: string | null
    postalCode?:  string | null
    city?:        string | null
  }

  invoice: {
    invoiceNumber: string
    invoiceDate:   string
    /** Cent-Strings aus dem eingefrorenen Snapshot `dunning-basis-v1` (grossAmount / activePaymentsSum). */
    totalGross:    string
    paidAmount:    string
    dueDate:       string
  }

  /** Offener Betrag zum Erstellungszeitpunkt (Snapshot `outstandingAmount`) – wird NICHT neu berechnet. */
  outstandingAmount: string
  /** Gesamtforderung = offener Betrag + Gebühr, fertig geliefert (Cent-String). */
  feeTotal:    string
}

/**
 * Anzeigewerte des Dokuments. Reine Formatierung: Das Template rechnet nie (kein Brutto − bezahlt, keine Summe aus
 * offenem Betrag und Gebühr). Die Beträge sind die eingefrorene Grundlage der Mahnung (REQ-029 P5-4, Entscheidung 1/2);
 * ein späterer Nachdruck zeigt deshalb auch nach zwischenzeitlichen Zahlungen denselben Forderungsbetrag.
 * Produktiv ist noch kein Erzeuger von DunningPdfData angebunden (Backlog Mahn-PDF/Nummer/Archivierung).
 */
export function buildDunningAmountView(data: DunningPdfData) {
  const eur = (value: string) => `${formatDecimalDe(value)} €`
  const hasPaid = isPositiveMoney(data.invoice.paidAmount)
  const hasFee  = data.fee != null && isPositiveMoney(data.fee)
  return {
    totalGross:  eur(data.invoice.totalGross),
    paid:        hasPaid ? eur(data.invoice.paidAmount) : null,
    outstanding: eur(data.outstandingAmount),
    fee:         hasFee ? eur(data.fee as string) : null,
    total:       eur(data.feeTotal),
  }
}

// ── Styles ────────────────────────────────────────────────────

const LEVEL_COLORS = {
  1: '#1d4ed8',  // blue — Zahlungserinnerung
  2: '#d97706',  // amber — Erste Mahnung
  3: '#dc2626',  // red — Zweite Mahnung
}

const S = StyleSheet.create({
  page:      { fontFamily: 'Helvetica', fontSize: PDF_BODY_TEXT_SIZE, color: '#1a1917', paddingTop: 40, paddingBottom: 50, paddingLeft: 50, paddingRight: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  compName:  { ...PDF_HEADER_HEADING_STYLE, marginBottom: 2 },
  small:     { ...PDF_HEADER_TEXT_STYLE, color: '#6b6b80', lineHeight: 1.5 },
  label:     { fontSize: 7, color: '#6b6b80', marginBottom: 2 },
  body:      { fontSize: 9, lineHeight: 1.6, color: '#3a3a50' },
  bold:      { fontFamily: 'Helvetica-Bold' },
  mono:      { fontFamily: 'Courier' },

  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      3,
    alignSelf:         'flex-start',
    marginBottom:      10,
  },
  levelText: { ...PDF_HEADER_HEADING_STYLE, color: '#fff' },

  senderSmall:  { ...PDF_HEADER_TEXT_STYLE, color: '#6b6b80', borderBottom: '0.5 solid #c0bdb8', paddingBottom: 2, marginBottom: 4 },
  addressLine:  { ...PDF_HEADER_TEXT_STYLE, lineHeight: 1.5 },

  subjectLine:  { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 20, marginBottom: 12 },

  boxed: {
    borderLeft:     '3 solid #e5e7eb',
    paddingLeft:    10,
    paddingVertical: 6,
    marginBottom:   14,
    backgroundColor: '#fafaf9',
  },
  boxRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  boxLabel:{ fontSize: 8.5, color: '#6b6b80' },
  boxValue:{ fontSize: 8.5, fontFamily: 'Courier' },
  boxBold: { fontSize: 9, fontFamily: 'Helvetica-Bold' },

  totalBox: {
    backgroundColor: '#fef9c3',
    border:          '0.5 solid #fde047',
    padding:         8,
    marginVertical:  12,
    borderRadius:    3,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },

  footer:    { position: 'absolute', bottom: 25, left: 50, right: 40, borderTop: '0.5 solid #d8d6d0', paddingTop: 5, flexDirection: 'row', justifyContent: 'space-between' },
  footerTxt: { fontSize: 7, color: '#9a9890', lineHeight: 1.5 },
  pageNum:   { fontSize: 7, color: '#9a9890' },
})

const LEVEL_BODY: Record<1 | 2 | 3, string> = {
  1: 'wir möchten Sie freundlich darauf hinweisen, dass der Zahlungseingang zur oben genannten Rechnung bislang nicht auf unserem Konto verbucht werden konnte. Möglicherweise haben sich unsere Schreiben gekreuzt. Falls die Zahlung bereits erfolgt ist, bitten wir Sie, diese Mitteilung als gegenstandslos zu betrachten.',
  2: 'trotz unserer Zahlungserinnerung haben wir bis heute noch keinen Zahlungseingang feststellen können. Wir fordern Sie daher zur umgehenden Begleichung des offenen Betrags auf. Bitte überweisen Sie den Gesamtbetrag inklusive der Mahngebühr bis zum angegebenen Datum.',
  3: 'wir haben Ihnen bereits eine Zahlungserinnerung und eine Mahnung übersandt, ohne dass eine Zahlung eingegangen ist. Dies ist unsere letzte außergerichtliche Aufforderung zur Begleichung Ihrer Verbindlichkeit. Sollte der ausstehende Betrag nicht bis zum angegebenen Termin auf unserem Konto eingehen, sind wir leider gezwungen, rechtliche Schritte einzuleiten.',
}

// ── Document ──────────────────────────────────────────────────

export function DunningDocument({ data }: { data: DunningPdfData }) {
  const c        = data.company
  const inv      = data.invoice
  const levelColor = LEVEL_COLORS[data.level]
  const amounts    = buildDunningAmountView(data)

  return (
    <Document title={`${data.levelLabel} ${inv.invoiceNumber}`} author={c.companyName}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.headerRow}>
          <View>
            <Text style={S.compName}>{c.companyName}{c.legalForm ? ` ${c.legalForm}` : ''}</Text>
            <Text style={S.small}>
              {[c.street, c.houseNumber].filter(Boolean).join(' ')}  ·  {[c.postalCode, c.city].filter(Boolean).join(' ')}
              {'\n'}{c.phone ? `Tel.: ${c.phone}` : ''}{c.email ? `  ·  ${c.email}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[S.levelBadge, { backgroundColor: levelColor }]}>
              <Text style={S.levelText}>{data.levelLabel.toUpperCase()}</Text>
            </View>
            <Text style={S.small}>Datum: {data.noticeDate}</Text>
          </View>
        </View>

        {/* Recipient */}
        <Text style={S.senderSmall}>
          {c.companyName} · {[c.street, c.houseNumber].filter(Boolean).join(' ')} · {[c.postalCode, c.city].filter(Boolean).join(' ')}
        </Text>
        <Text style={S.addressLine}>{data.customer.legalName ?? data.customer.name}</Text>
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

        {/* Subject */}
        <Text style={S.subjectLine}>
          {data.levelLabel} zu Rechnung {inv.invoiceNumber}
        </Text>

        {/* Invoice detail box */}
        <View style={S.boxed}>
          <View style={S.boxRow}>
            <Text style={S.boxLabel}>Rechnungsnummer</Text>
            <Text style={[S.boxValue, S.bold]}>{inv.invoiceNumber}</Text>
          </View>
          <View style={S.boxRow}>
            <Text style={S.boxLabel}>Rechnungsdatum</Text>
            <Text style={S.boxValue}>{inv.invoiceDate}</Text>
          </View>
          <View style={S.boxRow}>
            <Text style={S.boxLabel}>Ursprüngliches Zahlungsziel</Text>
            <Text style={S.boxValue}>{inv.dueDate}</Text>
          </View>
          <View style={S.boxRow}>
            <Text style={S.boxLabel}>Rechnungsbetrag</Text>
            <Text style={S.boxValue}>{amounts.totalGross}</Text>
          </View>
          {amounts.paid && (
            <View style={S.boxRow}>
              <Text style={S.boxLabel}>Bereits bezahlt</Text>
              <Text style={[S.boxValue, { color: '#059669' }]}>– {amounts.paid}</Text>
            </View>
          )}
          <View style={[S.boxRow, { borderTop: '0.5 solid #d8d6d0', marginTop: 4, paddingTop: 4 }]}>
            <Text style={S.boxBold}>Offener Betrag</Text>
            <Text style={[S.boxBold, S.mono]}>{amounts.outstanding}</Text>
          </View>
        </View>

        {/* Body text */}
        <Text style={[S.body, { marginBottom: 12 }]}>
          Sehr geehrte Damen und Herren,{'\n\n'}
          {LEVEL_BODY[data.level]}
        </Text>

        {/* Total with fee */}
        <View style={S.totalBox}>
          {amounts.fee && (
            <View style={S.totalRow}>
              <Text style={{ fontSize: 9, color: '#854d0e' }}>Offener Betrag</Text>
              <Text style={[S.mono, { fontSize: 9, color: '#854d0e' }]}>{amounts.outstanding}</Text>
            </View>
          )}
          {amounts.fee && (
            <View style={S.totalRow}>
              <Text style={{ fontSize: 9, color: '#854d0e' }}>Mahngebühr</Text>
              <Text style={[S.mono, { fontSize: 9, color: '#854d0e' }]}>{amounts.fee}</Text>
            </View>
          )}
          <View style={[S.totalRow, { marginTop: amounts.fee ? 4 : 0 }]}>
            <Text style={[S.bold, { fontSize: 10 }]}>Gesamtbetrag</Text>
            <Text style={[S.bold, S.mono, { fontSize: 10 }]}>{amounts.total}</Text>
          </View>
          <View style={[S.totalRow, { marginTop: 4 }]}>
            <Text style={{ fontSize: 8.5, color: '#854d0e' }}>Zahlbar bis</Text>
            <Text style={[S.bold, { fontSize: 8.5, color: '#854d0e' }]}>{data.dueDate}</Text>
          </View>
        </View>

        {/* Bank details */}
        {c.iban && (
          <Text style={S.body}>
            Bitte überweisen Sie den Betrag bis zum {data.dueDate} unter Angabe der
            Rechnungsnummer {inv.invoiceNumber} auf folgendes Konto:{'\n'}
            {c.bankName ? `${c.bankName}  ·  ` : ''}IBAN: {c.iban}{c.bic ? `  ·  BIC: ${c.bic}` : ''}
          </Text>
        )}

        <Text style={[S.body, { marginTop: 16 }]}>
          Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.{'\n\n'}
          Mit freundlichen Grüßen{'\n'}
          {c.companyName}
        </Text>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerTxt}>
            {c.companyName}{c.legalForm ? ` ${c.legalForm}` : ''}
            {c.vatId ? `  ·  USt-IdNr.: ${c.vatId}` : ''}
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

export async function renderDunningPdf(data: DunningPdfData): Promise<Buffer> {
  return renderToBuffer(<DunningDocument data={data} />)
}
