// lib/billing/document-preview.ts
//
// REQ-029 F2-B: Anzeige-Vorschau für Angebots-/Auftragsformulare auf Basis derselben zentralen Rechenquelle
// (`calculateDocumentAmounts`). Reines Modul, Beträge als Cent-Strings. Während der Eingabe ungültige Zeilen
// (leer, unvollständig, zu viele Nachkommastellen) werden für die Vorschau mit 0,00 angesetzt; der Server prüft
// beim Speichern streng und rundet Eingaben nie stillschweigend.

import { calculateDocumentAmounts } from './document-amounts'
import type { DocumentLineAmounts, DocumentLineInput, DocumentTaxGroup } from './document-amounts'

export type PreviewRowInput = { quantity: string; unitPrice: string; taxRate: string; discountRate?: string }

export type DocumentPreview = {
  lines:      DocumentLineAmounts[]
  taxGroups:  DocumentTaxGroup[]
  totalNet:   string
  totalTax:   string
  totalGross: string
}

const ZERO_LINE: DocumentLineAmounts = { netAmount: '0.00', taxAmount: '0.00', grossAmount: '0.00' }

function clean(value: string, fallback: string): string {
  const text = value.trim().replace(',', '.')
  return text === '' ? fallback : text
}

function normalize(row: PreviewRowInput): DocumentLineInput {
  return {
    quantity:     clean(row.quantity, '0'),
    unitPrice:    clean(row.unitPrice, '0'),
    taxRate:      clean(row.taxRate, '0'),
    discountRate: clean(row.discountRate ?? '0', '0'),
  }
}

function isCalculable(line: DocumentLineInput): boolean {
  try {
    calculateDocumentAmounts([line])
    return true
  } catch {
    return false
  }
}

export function previewDocument(rows: readonly PreviewRowInput[]): DocumentPreview {
  const normalized = rows.map(normalize)
  const valid = normalized.map(isCalculable)
  const used = normalized.filter((_, index) => valid[index])
  const result = calculateDocumentAmounts(used)
  let cursor = 0
  return {
    lines:      valid.map((ok) => (ok ? result.lines[cursor++] : ZERO_LINE)),
    taxGroups:  result.taxGroups,
    totalNet:   result.totalNet,
    totalTax:   result.totalTax,
    totalGross: result.totalGross,
  }
}
