import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('aufgeräumte Angebotsdetailseite', () => {
  const detail = source('app/(dashboard)/offers/[id]/page.tsx')
  const header = detail.slice(detail.indexOf('<BusinessDocumentHeader'), detail.indexOf('<BusinessDocumentLayout>'))
  const sharedHeader = source('components/documents/BusinessDocumentHeader.tsx')
  const workflow = source('components/workflow/BusinessProcessWorkflow.tsx')
  const table = source('components/offers/OfferTable.tsx')
  const overview = source('app/(dashboard)/offers/page.tsx')

  it('zeigt in der linken Titelkarte ausschließlich Angebotsnummer und Bezeichnung', () => {
    expect(header).toContain('title={offerNumberForDisplay(offer.offerNumber)}')
    expect(header).toContain('description={offer.title}')
    expect(table).toContain('offerNumberForDisplay(o.offerNumber)')
    expect(header).not.toContain('Aktuell geöffnet')
    expect(header).not.toContain('PDF-Vorschau')
    expect(header).not.toContain('Kopieren')
    expect(header).not.toContain('Angebote')
  })

  it('zeigt Kunden- und vorhandene Auftragsdaten in der rechten Karte', () => {
    expect(header).toContain('detailsLabel="Kunden- und Auftragsdaten"')
    expect(header).toContain('offer.customer.name')
    expect(header).toContain('Angebotsdatum')
    expect(header).toContain('offer.order &&')
    expect(header).toContain('Auftragsdatum')
    expect(header).toContain('offer.order?.completedAt')
    expect(header).toContain('sm:grid-cols-2 xl:grid-cols-4')
    expect(header).toContain('<dl className=')
  })

  it('stellt beide Karten auf Desktop nebeneinander und kompakt dar', () => {
    expect(sharedHeader).toContain('grid grid-cols-1 gap-4 lg:grid-cols-12')
    expect(sharedHeader).toContain('lg:col-span-3')
    expect(sharedHeader).toContain('lg:col-span-9')
    expect(sharedHeader).toContain('lg:items-stretch')
    expect(sharedHeader).not.toContain('min-h-')
  })

  it('ordnet Versand und Annahme sowie Auftragsdaten wie vorgegeben an', () => {
    expect(header).toContain('xl:col-start-2 xl:row-start-2')
    expect(header).toContain('xl:col-start-3 xl:row-start-2')
    expect(header).toContain('xl:col-start-4 xl:row-start-2')
  })

  it('verwendet die vorhandenen Vorschauwege innerhalb des Workflows', () => {
    expect(workflow).toContain('<OfferPdfDialog offerId={documentId} />')
    expect(workflow).toContain('<ServiceReportPdfDialog reportId={documentId} />')
    expect(workflow).toContain('<OrderPdfDialog orderId={documentId} />')
    expect(workflow).toContain('<Link href={documentHref(stageKey, documentId)}')
  })

  it('zeigt im Auftragsschritt Vorschau und Anzeigen-Link', () => {
    const orderActions = workflow.slice(workflow.indexOf("if (stageKey === 'order')"), workflow.indexOf("if (stageKey === 'invoice')"))
    expect(orderActions).toContain('<OrderPdfDialog orderId={documentId} />')
    expect(orderActions).toContain('Anzeigen')
  })

  it('zeigt im Angebotsschritt Vorschau, Anzeigen und berechtigungsgesteuertes Kopieren', () => {
    const offerActions = workflow.slice(workflow.indexOf("if (stageKey === 'offer')"), workflow.indexOf("if (stageKey === 'order')"))
    expect(offerActions).toContain('<OfferPdfDialog offerId={documentId} />')
    expect(offerActions).toContain('offerCopyHref')
    expect(offerActions).toContain('Kopieren')
    expect(offerActions).toContain('Anzeigen')
    expect(detail).toContain('hasPermission(Resource.OFFER, Action.CREATE)')
    expect(detail).toContain('offerCopyHref={canCopy ? `/offers/new?copy=${offer.id}` : undefined}')
  })

  it('platziert die bestehende Angebotskonvertierung ausschließlich im nächsten Auftragsschritt', () => {
    expect(detail).toContain('orderAction={offer.status === \'ACCEPTED\' && canConvert')
    expect(detail).toContain('<OfferConvertAction')
    expect(detail).toContain('showConversion={false}')
    expect(workflow).toContain("stage.key === 'order' && orderAction")
    expect(workflow).toContain('suppressOrderCreate={Boolean(orderAction)}')
  })

  it('integriert Versand und Entscheidung in die Workflow-Zeitleiste', () => {
    expect(detail).toContain('offerLifecycle={{')
    expect(detail).toContain("sentDate: offer.sentAt ? format(new Date(offer.sentAt), 'dd.MM.yyyy'")
    expect(detail).toContain('<OfferStatusActions')
    expect(detail).toContain('compactDecision')
    expect(detail).not.toContain('id="document-status-actions"')
    expect(workflow).toContain('Angebot versendet')
    expect(workflow).toContain('Kundenentscheidung')
    expect(workflow).toContain('Weiter nach Annahme')
  })

  it('bietet Kopieren berechtigungsgesteuert in Übersicht und Angebotsschritt an', () => {
    expect(overview).toContain('canCopy={canCreate}')
    expect(table).toContain('canCopy: boolean')
    expect(table).toContain('href={`/offers/new?copy=${o.id}`}')
    expect(table).toContain('Kopieren')
    expect(detail).toContain('offerCopyHref={canCopy ? `/offers/new?copy=${offer.id}` : undefined}')
  })

  it('bündelt administrative Angaben rechts unter dem Workflow', () => {
    const sidebar = detail.slice(detail.indexOf('<BusinessDocumentSidebar'), detail.indexOf('</BusinessDocumentSidebar>'))
    expect(sidebar.indexOf('<BusinessProcessWorkflow')).toBeLessThan(sidebar.indexOf('Details'))
    for (const label of ['Angebotsnummer', 'Angelegt von', 'Angelegt am', 'Letzte Änderung', 'Lieferantennummer']) {
      expect(sidebar).toContain(label)
    }
  })

  it('lässt Thema/Beschreibung und die Leistungspakete fachlich unverändert', () => {
    expect(detail).toContain('<DocumentSectionCard title="Thema und Beschreibung">')
    expect(detail).toContain('<OfferRichText value={offer.introText} />')
    expect(detail).toContain('<DocumentSectionCard title={`Positionen (${items.length})`} flush>')
    expect(detail).toContain('<table className="data-table">')
    expect(detail).toContain('{items.map((item, idx) => (')
  })
})
