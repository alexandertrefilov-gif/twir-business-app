// REQ-029 P5-4 Schritt 3: Mahn-Template rechnet nicht; es zeigt die gelieferte, eingefrorene Forderung
// (Snapshot dunning-basis-v1). Es gibt weiterhin KEINEN produktiven Erzeuger von DunningPdfData.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildDunningAmountView, renderDunningPdf, type DunningPdfData } from '@/lib/pdf-templates/dunning.template'

const base = (over: Partial<DunningPdfData> = {}): DunningPdfData => ({
  noticeNumber: 'MAHN-2026-0001', noticeDate: '12.10.2026', dueDate: '26.10.2026', level: 2, levelLabel: 'Erste Mahnung',
  company: { companyName: 'TWIR GmbH' }, customer: { name: 'Testkunde GmbH' },
  invoice: { invoiceNumber: 'RE-2026-0001', invoiceDate: '01.09.2026', totalGross: '119.00', paidAmount: '40.01', dueDate: '15.09.2026' },
  outstandingAmount: '78.99', fee: '5.00', feeTotal: '83.99',
  ...over,
})

describe('buildDunningAmountView', () => {
  it('Teilzahlung mit Gebühr: Werte kommen 1:1 aus dem Snapshot, deutsch formatiert', () => {
    expect(buildDunningAmountView(base())).toEqual({
      totalGross: '119,00 €', paid: '40,01 €', outstanding: '78,99 €', fee: '5,00 €', total: '83,99 €',
    })
  })

  it('keine eigene Restberechnung: ein abweichender Snapshot-Betrag wird unverändert angezeigt', () => {
    // Brutto − bezahlt wäre 79,00 €; maßgeblich ist der eingefrorene Forderungsbetrag.
    const view = buildDunningAmountView(base({
      invoice: { invoiceNumber: 'R', invoiceDate: 'x', totalGross: '119.00', paidAmount: '40.00', dueDate: 'y' },
      outstandingAmount: '78.99', feeTotal: '78.99', fee: null,
    }))
    expect(view.outstanding).toBe('78,99 €')
    expect(view.total).toBe('78,99 €')
  })

  it('keine eigene Summenbildung: Gesamtforderung ist der gelieferte Wert, auch wenn er nicht zu offen + Gebühr passt', () => {
    expect(buildDunningAmountView(base({ feeTotal: '1.00' })).total).toBe('1,00 €')
  })

  it('Nachdruck nach späterer Zahlung: dieselben Snapshot-Daten ergeben exakt dasselbe Dokument', () => {
    const snapshot = base()
    const first = buildDunningAmountView(snapshot)
    // Eine spätere Zahlung ändert die Rechnung, nicht den Snapshot; das Template kennt nur den Snapshot.
    const reprint = buildDunningAmountView({ ...snapshot })
    expect(reprint).toEqual(first)
  })

  it('ohne Zahlung und ohne Gebühr: keine Bezahlt-/Gebührenzeile', () => {
    const view = buildDunningAmountView(base({
      invoice: { invoiceNumber: 'R', invoiceDate: 'x', totalGross: '119.00', paidAmount: '0.00', dueDate: 'y' },
      outstandingAmount: '119.00', fee: null, feeTotal: '119.00',
    }))
    expect(view).toMatchObject({ paid: null, fee: null, total: '119,00 €' })
    expect(buildDunningAmountView(base({ fee: '0.00' })).fee).toBeNull()
  })

  it('rendert das Dokument mit Teilzahlung und Gebühr als PDF-Buffer', async () => {
    const buffer = await renderDunningPdf(base())
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('Template-Quelltext enthält keine Betragsrechnung', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/dunning.template.tsx'), 'utf8')
    expect(src).not.toMatch(/Math\./)
    expect(src).not.toMatch(/\.totalGross\s*-/)
    expect(src).not.toMatch(/outstandingAmount\s*\+|feeTotal\s*=\s*/)
  })
})
