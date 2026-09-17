import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('einheitliche Auftragsdetailseite', () => {
  const order = source('app/(dashboard)/orders/[id]/page.tsx')
  const header = order.slice(order.indexOf('<BusinessDocumentHeader'), order.indexOf('<BusinessDocumentLayout>'))
  const main = order.slice(order.indexOf('<BusinessDocumentLayout>'), order.indexOf('<BusinessDocumentSidebar'))
  const sidebar = order.slice(order.indexOf('<BusinessDocumentSidebar'), order.indexOf('</BusinessDocumentSidebar>'))
  const sharedHeader = source('components/documents/BusinessDocumentHeader.tsx')

  it('verwendet denselben kompakten 3/9-Kopf wie die Angebotsseite', () => {
    const offer = source('app/(dashboard)/offers/[id]/page.tsx')
    expect(order).toContain('<BusinessDocumentHeader')
    expect(offer).toContain('<BusinessDocumentHeader')
    expect(sharedHeader).toContain('lg:grid-cols-12')
    expect(sharedHeader).toContain('lg:col-span-3')
    expect(sharedHeader).toContain('lg:col-span-9')
    expect(sharedHeader).toContain('card-base p-5')
  })

  it('zeigt links ausschließlich Auftragsnummer und Bezeichnung', () => {
    expect(header).toContain('title={order.orderNumber}')
    expect(header).toContain('description={order.title}')
    for (const redundant of ['PageHeader', 'OrderStatusBadge', 'supplierNumber=', 'breadcrumbs=', 'actions=']) {
      expect(header).not.toContain(redundant)
    }
  })

  it('zeigt vorhandene Kunden- und Auftragsdaten responsiv im Kopf', () => {
    for (const value of ['order.customer.name', 'Auftragsdatum', 'Angebotsbezug', 'Geplanter Start', 'Geplantes Ende', 'Abgeschlossen am']) {
      expect(header).toContain(value)
    }
    expect(header).toContain('sm:grid-cols-2 xl:grid-cols-4')
    expect(header).toContain('order.startDate &&')
    expect(header).toContain('order.endDate &&')
    expect(header).toContain('order.completedAt &&')
  })

  it('entfernt die doppelte Metadatenkarte aus dem Dokumentbereich', () => {
    expect(main).not.toContain('title="Kunden- und Auftragsdaten"')
    expect(main).toContain('title="Thema und Beschreibung"')
    expect(main).toContain('title={`Positionen (${items.length})`}')
  })

  it('belässt Workflow und Details rechts und markiert den Auftrag als aktiven Schritt', () => {
    expect(sidebar).toContain('<BusinessProcessWorkflow')
    expect(sidebar).toContain('activeStage="order"')
    expect(sidebar.indexOf('<BusinessProcessWorkflow')).toBeLessThan(sidebar.indexOf('Details'))
    expect(sidebar).not.toContain('label="Auftragsnummer"')
    expect(sidebar).toContain('Angelegt von')
  })
})
