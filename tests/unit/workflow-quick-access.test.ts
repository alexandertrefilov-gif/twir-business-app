import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Schnellzugriffe im gemeinsamen Dokumentworkflow', () => {
  const workflow = source('components/workflow/BusinessProcessWorkflow.tsx')

  it('entfernt die separate Schnellzugriff-Karte', () => {
    expect(source('app/(dashboard)/intern/dashboard/page.tsx')).not.toContain('Schnellzugriff')
    for (const path of [
      'app/(dashboard)/offers/[id]/page.tsx',
      'app/(dashboard)/orders/[id]/page.tsx',
      'app/(dashboard)/services/[id]/page.tsx',
      'app/(dashboard)/invoices/[id]/page.tsx',
    ]) {
      expect(source(path)).not.toContain('Schnellzugriff')
    }
  })

  it('bietet Anzeigen für jeden vorhandenen Dokumenttyp über bestehende Detailrouten', () => {
    expect(workflow).toContain("key === 'offer' ? `/offers/${id}`")
    expect(workflow).toContain("key === 'order' ? `/orders/${id}`")
    expect(workflow).toContain("key === 'serviceReport' ? `/services/${id}`")
    expect(workflow).toContain(': `/invoices/${id}`')
    expect(workflow.match(/>Anzeigen<\/Link>/g)).toHaveLength(5)
  })

  it('verwendet nur tatsächlich vorhandene Vorschauwege', () => {
    expect(workflow).toContain('<OfferPdfDialog offerId={documentId} />')
    expect(workflow).toContain('<OrderPdfDialog orderId={documentId} />')
    expect(workflow).toContain('<ServiceReportPdfDialog reportId={documentId} />')
    expect(source('components/service-reports/ServiceReportPdfDialog.tsx')).toContain('`/api/services/${reportId}/pdf`')
    expect(workflow).toContain('<InvoicePdfDialog invoiceId={documentId} />')
    expect(source('components/invoices/InvoicePdfDialog.tsx')).toContain('`/api/invoices/${invoiceId}/pdf`')
  })

  it('zeigt bei allen Dokumenten zuerst die Nummer und darunter die Aktionen', () => {
    expect(workflow).toContain('<div key={document.id} className="space-y-2 text-xs">')
    const actions = workflow.slice(workflow.indexOf("if (stageKey === 'serviceReport')"), workflow.indexOf('return (\n    <div className="flex flex-wrap'))
    expect(actions).toContain('grid w-full grid-cols-2')
    expect(actions).toContain('>Anzeigen</Link>')
    expect(actions).toContain('<ServiceReportPdfDialog reportId={documentId} />')
  })

  it('ordnet bei Angebot und Auftrag Vorschau vor Anzeigen in voller Breite an', () => {
    const offerActions = workflow.slice(workflow.indexOf("if (stageKey === 'offer')"), workflow.indexOf("if (stageKey === 'order')"))
    const orderActions = workflow.slice(workflow.indexOf("if (stageKey === 'order')"), workflow.indexOf("if (stageKey === 'invoice')"))
    expect(offerActions).toContain('grid w-full')
    expect(offerActions.indexOf('<OfferPdfDialog')).toBeLessThan(offerActions.indexOf('>Anzeigen</Link>'))
    expect(orderActions).toContain('grid w-full grid-cols-2')
    expect(orderActions.indexOf('<OrderPdfDialog')).toBeLessThan(orderActions.indexOf('>Anzeigen</Link>'))
  })

  it('trennt das geöffnete Dokument vom fachlich aktuellen Prozessschritt', () => {
    expect(workflow).not.toContain('activeStage ?? currentDocument.type')
    expect(workflow).toContain("stage.key === activeStage")
    expect(workflow).toContain('stage.key === currentDocument.type')
    expect(workflow).toContain("? 'current'")
  })

  it('bewahrt Legacy-Mehrfachdaten sichtbar, bietet aber keine weitere Erstellung an', () => {
    const data = source('lib/services/business-process.service.ts')
    expect(data).toContain('serviceReports: order.serviceReports.map')
    expect(data).toContain('invoices: order.invoices.map')
    expect(workflow).toContain('stage.documents.map((document)')
    expect(workflow).toContain('process.serviceReports.length === 0')
    expect(workflow).not.toContain('Weiteren Leistungsnachweis erstellen')
  })

  it('räumt Leistungskopf und separate Dokumentaktionen auf', () => {
    const detail = source('app/(dashboard)/services/[id]/page.tsx')
    const header = detail.slice(detail.indexOf('<BusinessDocumentHeader'), detail.indexOf('<BusinessDocumentLayout>'))
    const main = detail.slice(detail.indexOf('<BusinessDocumentLayout>'), detail.indexOf('<BusinessDocumentSidebar>'))

    expect(header).toContain('title={report.reportNumber}')
    expect(header).toContain('description={report.title}')
    expect(header).not.toContain('PDF-Vorschau')
    expect(header).not.toContain('PDF herunterladen')
    expect(main).not.toContain('title="Grunddaten"')
    expect(detail).not.toContain('Dokumentaktionen')
    expect(detail).not.toContain('PDF herunterladen')
    expect(detail).not.toContain('<DeleteServiceReportButton')
  })
})
