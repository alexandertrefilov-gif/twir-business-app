// Digitale GGA-Schrankakte — wiederverwendet die bestehende PDF-Infrastruktur
// (@react-pdf/renderer, Firmenlogo-Loader) statt einer neuen PDF-Engine.
import React from 'react'
import { Document, Image as PdfImage, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { getCompanyLogoDimensions } from '@/lib/pdf-templates/company-logo'
import { PDF_DOCUMENT_FONT_FAMILY, PDF_DOCUMENT_FONT_BOLD, PDF_BODY_TEXT_SIZE, PDF_BODY_LINE_HEIGHT } from '@/lib/pdf-templates/document-header'

export interface SchrankakteSection {
  key: string
  title: string
  rows: Array<{ label: string; value: string }>
}

export interface GgaCabinetSchrankaktePdfData {
  cabinetLabel: string
  projectName: string
  generatedAt: string
  company: { companyName: string }
  logoDataUri?: string
  logoScale?: number | null
  logoSourceWidth?: number | null
  logoSourceHeight?: number | null
  sections: SchrankakteSection[]
  historyRows: Array<{ at: string; bereich: string; aktion: string; von: string }>
}

const S = StyleSheet.create({
  page: { padding: 36, fontFamily: PDF_DOCUMENT_FONT_FAMILY, fontSize: PDF_BODY_TEXT_SIZE, lineHeight: PDF_BODY_LINE_HEIGHT, color: '#1c1c1c' },
  logoRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  companyLogo: { objectFit: 'contain' },
  titleRow: { marginBottom: 4 },
  title: { fontFamily: PDF_DOCUMENT_FONT_BOLD, fontSize: 18 },
  subtitle: { fontSize: 10, color: '#6b6b80', marginTop: 2 },
  meta: { fontSize: 9, color: '#6b6b80', marginTop: 2, marginBottom: 14 },
  section: { marginTop: 14, break: false },
  sectionTitle: { fontFamily: PDF_DOCUMENT_FONT_BOLD, fontSize: 11, backgroundColor: '#f1efe9', padding: 4, marginBottom: 4 },
  row: { flexDirection: 'row', borderBottom: '0.5 solid #e5e2da', paddingVertical: 2 },
  rowLabel: { width: '38%', color: '#54524a' },
  rowValue: { width: '62%' },
  historyHeader: { flexDirection: 'row', backgroundColor: '#f1efe9', padding: 4 },
  historyRow: { flexDirection: 'row', borderBottom: '0.5 solid #e5e2da', paddingVertical: 2 },
  historyAt: { width: '22%', fontSize: 8 },
  historyBereich: { width: '18%', fontSize: 8 },
  historyAktion: { width: '30%', fontSize: 8 },
  historyVon: { width: '30%', fontSize: 8 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 7.5, color: '#8a8a8a', textAlign: 'center' },
})

function Section({ section }: { section: SchrankakteSection }) {
  return <View style={S.section} wrap={false}>
    <Text style={S.sectionTitle}>{section.title}</Text>
    {section.rows.map((row) => <View key={row.label} style={S.row}><Text style={S.rowLabel}>{row.label}</Text><Text style={S.rowValue}>{row.value || '–'}</Text></View>)}
    {section.rows.length === 0 && <Text style={{ fontSize: 9, color: '#8a8a8a', paddingVertical: 2 }}>Keine Angaben.</Text>}
  </View>
}

export function GgaCabinetSchrankakteDocument({ data }: { data: GgaCabinetSchrankaktePdfData }) {
  return <Document title={`GGA-Schrankakte ${data.cabinetLabel}`} author={data.company.companyName}>
    <Page size="A4" style={S.page} wrap>
      {data.logoDataUri && <View style={S.logoRow}>
        <PdfImage src={data.logoDataUri} style={[S.companyLogo, getCompanyLogoDimensions(data.logoScale ?? undefined, data.logoSourceWidth ?? undefined, data.logoSourceHeight ?? undefined)]} />
      </View>}
      <View style={S.titleRow}>
        <Text style={S.title}>GGA-Schrankakte</Text>
        <Text style={S.subtitle}>{data.cabinetLabel} · {data.projectName}</Text>
      </View>
      <Text style={S.meta}>Erzeugt am {data.generatedAt}</Text>

      {data.sections.map((section) => <Section key={section.key} section={section} />)}

      <View style={S.section} wrap={false}>
        <Text style={S.sectionTitle}>N. Historie</Text>
        <View style={S.historyHeader}>
          <Text style={S.historyAt}>Zeitpunkt</Text><Text style={S.historyBereich}>Bereich</Text><Text style={S.historyAktion}>Aktion</Text><Text style={S.historyVon}>Von</Text>
        </View>
        {data.historyRows.slice(0, 60).map((row, index) => <View key={index} style={S.historyRow}>
          <Text style={S.historyAt}>{row.at}</Text><Text style={S.historyBereich}>{row.bereich}</Text><Text style={S.historyAktion}>{row.aktion}</Text><Text style={S.historyVon}>{row.von}</Text>
        </View>)}
        {data.historyRows.length === 0 && <Text style={{ fontSize: 9, color: '#8a8a8a', paddingVertical: 2 }}>Keine Historieneinträge.</Text>}
      </View>

      <Text style={S.footer} fixed render={({ pageNumber, totalPages }) => `${data.company.companyName} · GGA-Schrankakte ${data.cabinetLabel} · Seite ${pageNumber} / ${totalPages}`} />
    </Page>
  </Document>
}

export async function renderGgaCabinetSchrankaktePdf(data: GgaCabinetSchrankaktePdfData): Promise<Buffer> {
  return renderToBuffer(<GgaCabinetSchrankakteDocument data={data} />)
}
