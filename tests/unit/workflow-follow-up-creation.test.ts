import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Folgedokumente im Workflow', () => {
  const workflow = source('components/workflow/BusinessProcessWorkflow.tsx')

  it('zeigt die bestehenden Create-Wege ausschließlich beim passenden nächsten Schritt', () => {
    expect(workflow).toContain("stageKey === 'order' && stageState === 'current'")
    expect(workflow).toContain("stage.key === 'order' && orderAction")
    expect(workflow).toContain('`/services/new?order=${process.order.id}`')
    expect(workflow).toContain('process.serviceReports.length === 0')
    expect(workflow).toContain('`/invoices/new?order=${process.order.id}`')
    expect(workflow).toContain('process.invoices.length === 0')
  })

  it('bindet jede Create-Aktion an die bestehende Berechtigungsmatrix', () => {
    expect(workflow).toContain('permissions.createOrder')
    expect(workflow).toContain('permissions.createServiceReport')
    expect(workflow).toContain('permissions.createInvoice')
  })

  it('serialisiert alle drei Folgedokument-Erstellungen serverseitig', () => {
    const offer = source('lib/services/offer.service.ts')
    const serviceReport = source('lib/services/service-report.service.ts')
    const invoice = source('lib/services/invoice.service.ts')
    const schema = source('prisma/schema.prisma')

    expect(schema).toContain('offerId     String?     @unique')
    expect(serviceReport).toContain('FOR UPDATE')
    expect(schema).toContain('@@unique([orderId])')
    expect(invoice).toContain('FOR UPDATE')
    expect(invoice).toContain('Für diesen Auftrag existiert bereits eine Rechnung.')
    expect(invoice).toContain('type: InvoiceType.STANDARD')
    expect(offer).toContain('offerId:          offer.id')
  })
})
