// REQ-029 F2-B: Angebot, Auftrag und Rechnung rechnen über dieselbe zentrale Decimal-Quelle (lib/billing, twir-calc-1).
// Regressionstests der Entscheidungsvorlage (Grenzfälle) + Parität Angebot ↔ Rechnung + Schutz der Bestandsdokumente.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calculateDocumentForPersistence } from '@/lib/services/document-calculation.service'
import { calculateInvoiceForPersistence } from '@/lib/services/invoice-calculation.service'
import { allocateLineTax, calculateDocumentAmounts } from '@/lib/billing/document-amounts'
import { previewDocument } from '@/lib/billing/document-preview'
import { calcItemAmounts, calcOfferTotals } from '@/lib/validators/offer.schema'
import { BusinessRuleError } from '@/lib/auth/permissions'

type Item = { quantity: string; unitPrice: string; taxRate: string; discountRate?: string }
const item = (quantity: string, unitPrice: string, taxRate = '19', discountRate = '0'): Item => ({ quantity, unitPrice, taxRate, discountRate })
const many = (n: number, quantity: string, unitPrice: string, taxRate = '19'): Item[] => Array.from({ length: n }, () => item(quantity, unitPrice, taxRate))

type Expected = { net: string; tax: string; gross: string; lines: string[]; groups: Record<string, string> }
const CASES: Array<[string, Item[], Expected]> = [
  ['5 × 0,50 € (Entscheidungsvorlage: alt USt 0,50 / Brutto 3,00)', many(5, '1', '0.50'), { net: '2.50', tax: '0.48', gross: '2.98', lines: ['0.50', '0.50', '0.50', '0.50', '0.50'], groups: { '19.00': '0.48' } }],
  ['10 × 0,03 € (alt USt 0,10 / Brutto 0,40)', many(10, '1', '0.03'), { net: '0.30', tax: '0.06', gross: '0.36', lines: Array(10).fill('0.03'), groups: { '19.00': '0.06' } }],
  ['2 × 0,07 € (alt Brutto 0,16)', many(2, '1', '0.07'), { net: '0.14', tax: '0.03', gross: '0.17', lines: ['0.07', '0.07'], groups: { '19.00': '0.03' } }],
  ['19 % + 7 % gemischt (alt USt 0,22 / Brutto 1,52)', [item('1', '0.50'), item('1', '0.50'), item('1', '0.30', '7')], { net: '1.30', tax: '0.21', gross: '1.51', lines: ['0.50', '0.50', '0.30'], groups: { '7.00': '0.02', '19.00': '0.19' } }],
  ['Menge 1,005 × 1,00 (alt Float 1,00)', [item('1.005', '1.00')], { net: '1.01', tax: '0.19', gross: '1.20', lines: ['1.01'], groups: { '19.00': '0.19' } }],
  ['Menge 1,015 × 1,00 (alt 1,01)', [item('1.015', '1.00')], { net: '1.02', tax: '0.19', gross: '1.21', lines: ['1.02'], groups: { '19.00': '0.19' } }],
  ['0,15 € mit 50 % Rabatt (alt 0,07)', [item('1', '0.15', '19', '50')], { net: '0.08', tax: '0.02', gross: '0.10', lines: ['0.08'], groups: { '19.00': '0.02' } }],
  ['Menge 0,005 × 1,00 (0,005 rundet auf 0,01)', [item('0.005', '1.00')], { net: '0.01', tax: '0.00', gross: '0.01', lines: ['0.01'], groups: { '19.00': '0.00' } }],
]

describe('F2-B: bekannte Grenzfälle der Entscheidungsvorlage', () => {
  it.each(CASES)('%s', (_name, items, expected) => {
    const doc = calculateDocumentForPersistence(items)
    expect(doc.totalNet).toBe(expected.net)
    expect(doc.totalTax).toBe(expected.tax)
    expect(doc.totalGross).toBe(expected.gross)
    expect(doc.lines.map((line) => line.netAmount)).toEqual(expected.lines)
    expect(Object.fromEntries(doc.taxGroups.map((group) => [group.rate, group.taxAmount]))).toEqual(expected.groups)
  })

  it('Einzelpreis 1,005 ist nicht speicherbar (Skala 2): verständlicher Fehler statt stiller Rundung, wie bei der Rechnung', () => {
    expect(() => calculateDocumentForPersistence([item('1', '1.005')])).toThrow(BusinessRuleError)
    expect(() => calculateDocumentForPersistence([item('1', '1.005')])).toThrow(/Nachkommastellen/)
    expect(() => calculateInvoiceForPersistence([{ quantity: '1', unitPrice: '1.005', taxRate: '19' }])).toThrow(/Nachkommastellen/)
  })
})

describe('F2-B: Parität Angebot = Auftrag = Rechnung bei gleicher Grundlage', () => {
  const PROBLEM_ITEMS = CASES.map(([name, items]) => [name, items] as const)

  it.each(PROBLEM_ITEMS)('%s', (_name, items) => {
    const offer = calculateDocumentForPersistence(items)
    const invoice = calculateInvoiceForPersistence(items.map((entry) => ({ ...entry })))
    expect(offer.totalNet).toBe(invoice.totalNet)
    expect(offer.totalTax).toBe(invoice.totalTax)
    expect(offer.totalGross).toBe(invoice.totalGross)
    expect(offer.lines.map((line) => line.netAmount)).toEqual(invoice.lines.map((line) => line.netAmount))
  })

  it('1000 deterministische Zufallsdokumente: Summen und Positionsnetto identisch zur Rechnung, Σ Positionssteuer je Satz = Satzsteuer', () => {
    let seed = 20261014
    const next = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    const rates = ['19', '7', '0', '19', '7']
    for (let round = 0; round < 1000; round += 1) {
      const count = 1 + Math.floor(next() * 12)
      const items: Item[] = Array.from({ length: count }, () => ({
        quantity: (Math.floor(next() * 99999) / 1000 + 0.001).toFixed(3),
        unitPrice: (Math.floor(next() * 50000) / 100).toFixed(2),
        taxRate: rates[Math.floor(next() * rates.length)],
        discountRate: next() < 0.3 ? (Math.floor(next() * 10000) / 100).toFixed(2) : '0',
      }))
      const offer = calculateDocumentForPersistence(items)
      const invoice = calculateInvoiceForPersistence(items)
      expect([offer.totalNet, offer.totalTax, offer.totalGross]).toEqual([invoice.totalNet, invoice.totalTax, invoice.totalGross])
      expect(offer.lines.map((line) => line.netAmount)).toEqual(invoice.lines.map((line) => line.netAmount))
      for (const group of offer.taxGroups) {
        const cents = items
          .map((entry, index) => ({ entry, line: offer.lines[index] }))
          .filter(({ entry }) => Number(entry.taxRate).toFixed(2) === group.rate)
          .reduce((sum, { line }) => sum + Math.round(Number(line.taxAmount) * 100), 0)
        expect(cents, `Satz ${group.rate} in Runde ${round}`).toBe(Math.round(Number(group.taxAmount) * 100))
      }
      const lineGross = offer.lines.reduce((sum, line) => sum + Math.round(Number(line.grossAmount) * 100), 0)
      expect(lineGross).toBe(Math.round(Number(offer.totalGross) * 100))
    }
  })

  it('calcOfferTotals/calcItemAmounts (Zahlen-API) liefern dieselben Werte wie die Persistenz-Berechnung', () => {
    const numeric = [{ quantity: 1, unitPrice: 0.5, taxRate: 19 }, { quantity: 1, unitPrice: 0.5, taxRate: 19 }, { quantity: 1, unitPrice: 0.3, taxRate: 7 }]
    const totals = calcOfferTotals(numeric)
    expect(totals).toEqual({ totalNet: 1.3, totalTax: 0.21, totalGross: 1.51, taxGroups: { '19': 0.19, '7': 0.02 } })
    expect(calcItemAmounts({ quantity: 1, unitPrice: 0.15, taxRate: 19, discountRate: 50 }).netAmount).toBe(0.08)
    expect(calcItemAmounts({ quantity: 1.005, unitPrice: 1, taxRate: 19 }).netAmount).toBe(1.01)
  })
})

describe('F2-B: Verteilung der Positionssteuer (größter Rest)', () => {
  it('verteilt den Rest auf die Positionen mit dem größten Bruchteil, bei Gleichstand die kleinere Position', () => {
    const taxes = allocateLineTax(['0.50', '0.50', '0.50', '0.50', '0.50'], Array(5).fill('19'), new Map([['19.00', '0.48']]))
    expect(taxes).toEqual(['0.10', '0.10', '0.10', '0.09', '0.09'])
    expect(taxes.reduce((sum, value) => sum + Math.round(Number(value) * 100), 0)).toBe(48)
  })

  it('Satz 0 % bleibt 0,00; leeres Dokument ergibt Nullsummen', () => {
    expect(allocateLineTax(['10.00'], ['0'], new Map([['0.00', '0.00']]))).toEqual(['0.00'])
    const empty = calculateDocumentAmounts([])
    expect([empty.totalNet, empty.totalTax, empty.totalGross, empty.lines.length]).toEqual(['0.00', '0.00', '0.00', 0])
  })
})

describe('F2-B: Formular-Vorschau nutzt dieselbe Quelle', () => {
  it('Vorschau = Persistenzberechnung; ungültige Zwischeneingaben zählen als 0,00 ohne Fehler', () => {
    const preview = previewDocument([
      { quantity: '1', unitPrice: '0.50', taxRate: '19' }, { quantity: '1', unitPrice: '0.50', taxRate: '19' },
      { quantity: '1', unitPrice: '0.30', taxRate: '7' }, { quantity: '', unitPrice: '', taxRate: '19' }, { quantity: '1', unitPrice: '0.123456', taxRate: '19' },
    ])
    expect([preview.totalNet, preview.totalTax, preview.totalGross]).toEqual(['1.30', '0.21', '1.51'])
    expect(preview.lines.map((line) => line.netAmount)).toEqual(['0.50', '0.50', '0.30', '0.00', '0.00'])
  })
})

describe('F2-B: Float-Pfad entfernt, Bestandsdokumente werden nicht neu gerechnet', () => {
  const root = path.resolve(__dirname, '../..')
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

  it.each([
    'lib/validators/offer.schema.ts', 'lib/services/offer.service.ts', 'lib/services/order.service.ts',
    'components/offers/OfferForm.tsx', 'components/orders/OrderForm.tsx', 'lib/services/document-calculation.service.ts',
  ])('%s enthält kein Math.round', (file) => {
    expect(read(file)).not.toMatch(/Math\.round/)
  })

  it.each([
    'lib/services/offer-pdf.service.ts', 'lib/services/order-pdf.service.ts',
    'app/(dashboard)/offers/[id]/page.tsx', 'app/(dashboard)/orders/[id]/page.tsx',
  ])('%s liest nur gespeicherte Beträge (keine Berechnung beim Anzeigen/PDF)', (file) => {
    const source = read(file)
    expect(source).not.toMatch(/calculateDocument|calculateInvoice|calcItemAmounts|calcOfferTotals|calcOrderTotals|@\/lib\/billing/)
  })

  it('Angebot → Auftrag kopiert die gespeicherten Beträge, ohne Neuberechnung', () => {
    const source = read('lib/services/offer.service.ts')
    const start = source.indexOf('export async function convertOfferToOrder')
    const convert = source.slice(start, start + 4000)
    expect(convert).toMatch(/totalNet:\s+offer\.totalNet/)
    expect(convert).toMatch(/netAmount:\s+item\.netAmount/)
    expect(convert).not.toMatch(/calculateDocument|calcItemAmounts|calcOfferTotals/)
  })

  it('Bearbeiten ist nur für Entwürfe (Angebot DRAFT) bzw. offene Aufträge möglich – eingefrorene Dokumente werden nicht neu gerechnet', () => {
    expect(read('lib/services/offer.service.ts')).toMatch(/existing\.status !== OfferStatus\.DRAFT/)
    expect(read('lib/services/order.service.ts')).toMatch(/können nicht mehr bearbeitet werden/)
  })
})
