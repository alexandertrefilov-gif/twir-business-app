// lib/export/datev.export.ts
// DATEV-Export-Vorbereitung
//
// ANNAHME: Dies ist eine strukturelle Vorbereitung, keine vollständige
// DATEV-Zertifizierung. Vor Produktionseinsatz muss ein Steuerberater
// und/oder DATEV-Partner die Buchungsstapel-Konfiguration prüfen.
//
// DATEV CSV-Buchungsstapel (Buchungsstapelformat 1.0):
// https://developer.datev.de/datev/platform/de/dtvf/buchungsstapel

import type { InvoiceType } from '@/types/enums'

// ── Kontennummern (Annahme: SKR03) ──────────────────────────

const DATEV_ACCOUNTS = {
  REVENUE_19:   '8400',   // Erlöse 19% MwSt. (SKR03)
  REVENUE_7:    '8300',   // Erlöse 7% MwSt.
  REVENUE_0:    '8100',   // Erlöse steuerfrei
  DEBTORS:      '10000',  // Sammelkonto Debitoren (individuell)
  VAT_19:       '1776',   // Umsatzsteuer 19%
  VAT_7:        '1771',   // Umsatzsteuer 7%
} as const

// ── Types ─────────────────────────────────────────────────────

export interface DatevInvoiceRow {
  // Buchungsdatum
  date:            Date
  // Belegdatum
  invoiceDate:     Date
  // Belegnummer = Rechnungsnummer
  documentNumber:  string
  // Buchungstext
  text:            string
  // Betrag (Netto oder Brutto je nach Buchungsmethode)
  amount:          number
  // Kontonummer
  accountNumber:   string
  // Gegenkonto (Debitor)
  contraAccount:   string
  // Steuerschlüssel
  taxKey:          string
  // Kostenstelle (optional)
  costCenter?:     string
}

export interface DatevExportResult {
  header:   string
  rows:     DatevInvoiceRow[]
  csv:      string
  filename: string
}

// ── Export function ───────────────────────────────────────────

/**
 * Erzeugt einen DATEV-Buchungsstapel-CSV-Export.
 *
 * HINWEIS: Die Kontonummern und Steuerschlüssel müssen an das
 * konkrete Mandanten-Konto im DATEV-System angepasst werden.
 * Dies ist eine Grundstruktur, keine fertige DATEV-Anbindung.
 */
export function generateDatevExport(params: {
  invoices: Array<{
    invoiceNumber: string
    invoiceDate:   Date
    customerName:  string
    customerNumber?: string
    totalNet:      number
    totalTax:      number
    totalGross:    number
    taxGroups:     Record<string, number>  // { "19": amount, "7": amount }
    type:          string
  }>
  periodStart: Date
  periodEnd:   Date
  consultant:  string   // DATEV-Beraternummer (Annahme: aus Einstellungen)
  client:      string   // DATEV-Mandantennummer
  fiscalYear:  number
}): DatevExportResult {
  const { invoices, periodStart, periodEnd, consultant, client, fiscalYear } = params

  // DATEV CSV-Header (Format: DTVF)
  const header = [
    '"EXTF"',                         // Kennzeichen
    '700',                            // Versionsnummer
    '21',                             // Datenkategorie (21 = Buchungsstapel)
    '"Buchungsstapel"',
    '4',                              // Formatversion
    formatDatevDate(new Date()),      // Exportdatum
    '',                               // Exportzeit
    '"Business App"',                 // Erzeugt durch
    '',
    '',
    `"${consultant}"`,                // Beraternummer
    `"${client}"`,                    // Mandantennummer
    fiscalYear.toString(),            // Wirtschaftsjahr
    '4',                              // Sachkontenrahmen (4 = SKR04, 3 = SKR03)
    formatDatevDate(periodStart),     // Datumvon
    formatDatevDate(periodEnd),       // Datumbis
    '"RE-Export"',                    // Bezeichnung
    '',
    '"EUR"',
  ].join(';')

  const columnHeader =
    'Umsatz;Soll/Haben;WKZ;Kurs;BasisUmsatz;WKZBasisUmsatz;Konto;GegenKonto;BU-Schlüssel;' +
    'Belegdatum;Belegfeld1;Belegfeld2;Skonto;Buchungstext;Postensperre;Diverse Adressnummer;' +
    'Geschäftspartnerbank;Sachverhalt;Zinssperre;Beleglink;Beleginfo Typ1;Beleginfo Inhalt1'

  const rows: DatevInvoiceRow[] = []
  const csvLines: string[] = []

  for (const inv of invoices) {
    // Skip non-standard types for now
    if (inv.type === 'CANCELLATION') {
      // Stornorechnung: negativer Betrag
    }

    const debtorAccount = inv.customerNumber
      ? `${10000 + parseInt(inv.customerNumber.replace(/\D/g, '').slice(-4), 10)}`
      : '10000'

    // One row per tax group
    for (const [taxRate, taxAmount] of Object.entries(inv.taxGroups)) {
      const rate         = parseFloat(taxRate)
      const netForGroup  = taxAmount / (rate / 100 || 1) // approximation
      const revenueAcct  = rate === 19 ? DATEV_ACCOUNTS.REVENUE_19
                         : rate === 7  ? DATEV_ACCOUNTS.REVENUE_7
                         : DATEV_ACCOUNTS.REVENUE_0
      const buKey        = rate === 19 ? '3' : rate === 7 ? '2' : '40'

      const row = [
        formatAmount(netForGroup),
        'S',                    // Soll
        'EUR',
        '',
        '',
        '',
        revenueAcct,
        debtorAccount,
        buKey,
        formatDatevDate(inv.invoiceDate),
        inv.invoiceNumber.replace(/[^A-Za-z0-9\-]/g, ''),
        '',
        '',
        `"${inv.customerName.replace(/"/g, '').slice(0, 60)}"`,
        '0',
        '',
        '',
        '',
        '0',
        '',
        '',
        '',
      ].join(';')

      csvLines.push(row)
      rows.push({
        date:           inv.invoiceDate,
        invoiceDate:    inv.invoiceDate,
        documentNumber: inv.invoiceNumber,
        text:           inv.customerName,
        amount:         netForGroup,
        accountNumber:  revenueAcct,
        contraAccount:  debtorAccount,
        taxKey:         buKey,
      })
    }
  }

  const csv = [header, columnHeader, ...csvLines].join('\n')

  const filename = `DATEV_${fiscalYear}_${
    formatDatevDate(periodStart)
  }_${formatDatevDate(periodEnd)}.csv`

  return { header, rows, csv, filename }
}

function formatDatevDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear())
  return `${dd}${mm}${yy}`
}

function formatAmount(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
