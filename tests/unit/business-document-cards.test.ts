import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const detailPages = [
  'app/(dashboard)/offers/[id]/page.tsx',
  'app/(dashboard)/orders/[id]/page.tsx',
  'app/(dashboard)/services/[id]/page.tsx',
  'app/(dashboard)/invoices/[id]/page.tsx',
]

const editPages = [
  'app/(dashboard)/offers/[id]/edit/page.tsx',
  'app/(dashboard)/orders/[id]/edit/page.tsx',
  'app/(dashboard)/services/[id]/edit/page.tsx',
  'app/(dashboard)/invoices/[id]/edit/page.tsx',
]

describe('einheitliche Geschäftsdokument-Karten', () => {
  it('stellt eine zentrale Karten- und Sidebar-Struktur bereit', () => {
    const card = source('components/documents/DocumentSectionCard.tsx')
    const layout = source('components/documents/BusinessDocumentLayout.tsx')

    expect(card).toContain('data-document-section-card')
    expect(card).toContain('card-base min-w-0 max-w-full overflow-hidden')
    expect(card).toContain('border-b border-stone-100')
    expect(layout).toContain('grid-cols-1')
    expect(layout).toContain('lg:grid-cols-[minmax(0,1fr)_20px_var(--document-sidebar-width)]')
    expect(layout).toContain('data-business-document-sidebar')
  })

  it.each(detailPages)('%s verwendet Inhaltskarten links und den Workflow rechts', (path) => {
    const page = source(path)
    const layout = page.indexOf('<BusinessDocumentLayout>')
    const card = page.indexOf('<DocumentSectionCard', layout)
    const sidebar = page.indexOf('<BusinessDocumentSidebar', card)
    const workflow = page.indexOf('<BusinessProcessWorkflow', sidebar)

    expect(layout).toBeGreaterThan(0)
    expect(card).toBeGreaterThan(layout)
    expect(sidebar).toBeGreaterThan(card)
    expect(workflow).toBeGreaterThan(sidebar)
    expect(page.slice(card, sidebar)).not.toContain('<BusinessProcessWorkflow')
  })

  it.each(editPages)('%s behält das Formular links und verwendet den echten Workflow rechts', (path) => {
    const page = source(path)
    const layout = page.indexOf('<BusinessDocumentLayout>')
    const sidebar = page.indexOf('<BusinessDocumentSidebar', layout)
    const workflow = page.indexOf('<BusinessProcessWorkflow', sidebar)

    expect(layout).toBeGreaterThan(0)
    expect(sidebar).toBeGreaterThan(layout)
    expect(workflow).toBeGreaterThan(sidebar)
  })

  it('verwendet in allen Dokumentformularen die vorhandene Form-Section-Karte', () => {
    for (const path of [
      'components/offers/OfferForm.tsx',
      'components/orders/OrderForm.tsx',
      'components/invoices/InvoiceForm.tsx',
      'components/service-reports/ServiceReportForm.tsx',
    ]) {
      expect(source(path)).toContain('form-section')
    }
    const richTextEditor = source('components/offers/RichTextSectionsEditor.tsx')
    const positionsEditor = source('components/service-reports/ServiceReportPositionsEditor.tsx')
    expect(richTextEditor).toContain('data-service-report-positions-block')
    expect(richTextEditor).toContain('className="form-section min-w-0 overflow-hidden p-0"')
    expect(positionsEditor).not.toContain('<section className="form-section')
  })

  it('verwendet bei Neuanlagen die gemeinsame responsive Dokumentstruktur', () => {
    for (const path of [
      'app/(dashboard)/offers/new/page.tsx',
      'app/(dashboard)/services/new/page.tsx',
      'app/(dashboard)/invoices/new/page.tsx',
    ]) {
      expect(source(path)).toContain('<BusinessDocumentLayout>')
      expect(source(path)).toContain('<BusinessDocumentSidebar')
    }
  })

  it('hält A4/PDF-Vorschauen von der normalen Auftragsansicht getrennt', () => {
    const order = source('app/(dashboard)/orders/[id]/page.tsx')
    const offer = source('app/(dashboard)/offers/[id]/page.tsx')
    const serviceDialog = source('components/service-reports/ServiceReportPdfDialog.tsx')

    expect(order).not.toContain('<DocumentPreviewWorkspace>')
    const workflow = source('components/workflow/BusinessProcessWorkflow.tsx')
    expect(workflow).toContain('<OfferPdfDialog offerId={documentId} />')
    expect(serviceDialog).toContain('/api/services/${reportId}/pdf')
  })
})
