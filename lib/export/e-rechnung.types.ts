// lib/export/e-rechnung.types.ts
// Vorbereitung für elektronische Rechnungsformate
//
// WICHTIG: Dies ist eine Feld-Vorbereitung, keine vollständige Implementierung.
// XRechnung (EN 16931) und ZUGFeRD erfordern XML-Erzeugung und Validierung
// durch spezialisierte Bibliotheken. Vor B2B-Pflicht-Einsatz (ab 2025 in DE)
// muss dies durch eine zertifizierte Lösung ersetzt werden.
//
// Gesetzlicher Hintergrund:
//   - § 14 UStG: E-Rechnung ab 1.1.2025 für inländische B2B verpflichtend
//   - Übergangsfrist bis 31.12.2026 für Empfänger
//   - XRechnung = XML nach EN 16931
//   - ZUGFeRD = PDF mit eingebettetem XML (EN 16931 konform)

// ── XRechnung Pflichtfelder (EN 16931 Core) ───────────────────

export interface XRechnungInvoiceData {
  // BT-1: Rechnungsnummer
  invoiceNumber:    string
  // BT-2: Rechnungsdatum
  invoiceDate:      string   // ISO 8601: YYYY-MM-DD
  // BT-3: Rechnungsart (380 = Rechnung, 381 = Gutschrift, 384 = Korrektur)
  invoiceTypeCode:  '380' | '381' | '384'
  // BT-5: Währung
  currency:         'EUR'
  // BT-9: Zahlungsfälligkeitsdatum
  dueDate?:         string

  // BT-10: Käufer-Referenz (Pflicht für Bundesbehörden)
  buyerReference?:  string

  // BT-19: Käuferkostenstelle
  buyerCostCenter?: string

  // Verkäufer (BT-27 bis BT-40)
  seller: {
    name:          string
    vatId?:        string
    taxNumber?:    string
    street?:       string
    postalCode?:   string
    city?:         string
    country:       string   // ISO 3166-1 alpha-2, z.B. "DE"
    email?:        string
    // BT-34: IBAN (für Zahlungsanweisung)
    iban?:         string
    bic?:          string
    bankName?:     string
    // BT-30: Leitweg-ID (für öffentliche Auftraggeber)
    routingId?:    string
  }

  // Käufer (BT-44 bis BT-57)
  buyer: {
    name:          string
    vatId?:        string
    street?:       string
    postalCode?:   string
    city?:         string
    country:       string
  }

  // Leistungszeitraum
  deliveryPeriodStart?: string
  deliveryPeriodEnd?:   string

  // Positionen (BG-25)
  lines: XRechnungLineItem[]

  // Steuern (BG-23)
  taxGroups: XRechnungTaxGroup[]

  // Gesamtbeträge (BG-22)
  totals: {
    lineExtensionAmount:   number  // Summe Netto
    taxExclusiveAmount:    number  // = lineExtensionAmount - Rabatte
    taxInclusiveAmount:    number  // Brutto
    taxAmount:             number
    payableAmount:         number  // Zu zahlender Betrag
  }
}

export interface XRechnungLineItem {
  // BT-126: Positionsnummer
  lineId:         string
  // BT-153: Artikelname / Beschreibung
  name:           string
  description?:   string
  // BT-129: Menge
  quantity:       number
  // BT-130: Mengeneinheit (UN/ECE-Codes: C62=Stk, HUR=Std, KGM=kg)
  unitCode:       string
  // BT-131: Nettobetrag Zeile
  lineAmount:     number
  // BT-146: Einzelpreis netto
  unitPrice:      number
  // BT-152: Steuersatz (%)
  taxRate:        number
}

export interface XRechnungTaxGroup {
  // BT-118: Steuerrate (%)
  taxRate:      number
  // BT-116: Bemessungsgrundlage
  taxableAmount: number
  // BT-117: Steuerbetrag
  taxAmount:    number
  // BT-119: Steuerkategoriecode (S=Standard, Z=Zero, AE=Reverse Charge, E=Exempt)
  categoryCode: 'S' | 'Z' | 'AE' | 'E'
}

// ── Konvertierungs-Helfer ─────────────────────────────────────

/** Konvertiert Mengeneinheit → UN/ECE Code */
export function unitToUNECE(unit: string): string {
  const map: Record<string, string> = {
    'Stk.': 'C62',  // piece
    'Std.': 'HUR',  // hour
    'Psch.':'LS',   // lump sum
    'h':    'HUR',
    'kg':   'KGM',
    't':    'TNE',
    'm':    'MTR',
    'm²':   'MTK',
    'm³':   'MTQ',
    'l':    'LTR',
    'km':   'KMT',
  }
  return map[unit] ?? 'C62'
}

/** Bestimmt Steuerkategoriecode */
export function taxRateToCategory(rate: number): XRechnungTaxGroup['categoryCode'] {
  if (rate === 0)  return 'Z'
  if (rate > 0)    return 'S'
  return 'E'
}

// ── ZUGFeRD Profile ───────────────────────────────────────────

export type ZUGFeRDProfile =
  | 'MINIMUM'          // Nur Metadaten
  | 'BASIC_WL'         // Ohne Positionsdetails
  | 'BASIC'            // Mit Positionen
  | 'EN16931'          // Vollständig (= XRechnung-kompatibel)
  | 'EXTENDED'         // Erweiterter Datensatz

/**
 * Empfehlung: EN16931 für volle Compliance.
 * MINIMUM für Lieferantenrechnungen ohne Positionspflicht.
 */
export const RECOMMENDED_PROFILE: ZUGFeRDProfile = 'EN16931'

// ── Hinweis ───────────────────────────────────────────────────
//
// Für vollständige Implementierung empfohlene Bibliotheken:
//
// Option A — mustangproject (Java, OpenSource):
//   https://github.com/ZUGFeRD/mustangproject
//
// Option B — Factur-X Python:
//   https://github.com/akretion/factur-x
//
// Option C — node-zugferd / peppol-js (npm):
//   Derzeit noch experimentell — Produktionsreife prüfen
//
// Option D — Dienstleister: Billentis, Pagero, ZUGFeRD-Compliance-Suite
//
// Die Felder in XRechnungInvoiceData sind direkt auf EN 16931 gemappt
// und können in jede der oben genannten Bibliotheken eingespeist werden.
