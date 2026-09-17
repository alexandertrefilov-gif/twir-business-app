import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Einheitlicher Rechnungskopf', () => {
  it('verwendet beim Erstellen und Bearbeiten den gemeinsamen Dokumentkopf und das Workflow-Layout', () => {
    for (const path of [
      'app/(dashboard)/invoices/new/page.tsx',
      'app/(dashboard)/invoices/[id]/edit/page.tsx',
      'app/(dashboard)/invoices/[id]/page.tsx',
    ]) {
      const page = source(path)
      expect(page).toMatch(/<(InvoiceDocumentHeader|BusinessDocumentHeader)/)
      expect(page).toContain('<BusinessDocumentLayout>')
      expect(page).toContain('<BusinessDocumentSidebar')
      expect(page).toContain('<BusinessProcessWorkflow')
      expect(page).not.toContain('<PageHeader')
    }
  })

  it('zeigt die Rechnungsparteien kompakt und erhält die gespeicherten Snapshots als Quelle', () => {
    const page = source('app/(dashboard)/invoices/[id]/page.tsx')
    expect(page).toContain('title="Rechnungsparteien"')
    expect(page).toContain('Rechnungsadresse')
    expect(page).toContain('Rechnungssteller')
    expect(page).toContain('invoice.customerSnapshot')
    expect(page).toContain('invoice.companySnapshot')
    expect(page).not.toContain('title="Rechnungskopf"')
  })

  it('belässt Positionen, Workflow, Statusaktionen und Mahnwesen auf der Detailseite', () => {
    const page = source('app/(dashboard)/invoices/[id]/page.tsx')
    expect(page).toContain('title={`Positionen (${items.length})`}')
    expect(page).toContain('<BusinessProcessWorkflow')
    expect(page).toContain('<InvoiceActions')
    expect(page).toContain('<DunningPanel')
  })

  it('zeigt die Dokumentkette und den gespeicherten Abrechnungstext vor den Positionen', () => {
    const page = source('app/(dashboard)/invoices/[id]/page.tsx')
    for (const label of ['Angebot', 'Auftrag', 'Leistungsnachweis', 'Rechnung']) {
      expect(page).toContain(`label="${label}"`)
    }
    expect(page).toContain("value ?? '—'")
    expect(page).toContain('canLink={processPermissions.readOffer}')
    expect(page).toContain('canLink={processPermissions.readOrder}')
    expect(page).toContain('canLink={processPermissions.readServiceReport}')
    expect(page).toContain('<OfferRichText value={invoice.introText} />')
    expect(page.indexOf('Leistungsbeschreibung / Abrechnungstext')).toBeLessThan(page.indexOf('title={`Positionen (${items.length})`}'))
  })

  it('zeigt nur vorhandene Verknüpfungen in der breiten Kopfkarte', () => {
    const header = source('components/invoices/InvoiceDocumentHeader.tsx')
    expect(header).toContain('<BusinessDocumentHeader')
    expect(header).toContain('{customer &&')
    expect(header).toContain('{order &&')
    expect(header).toContain('{offer &&')
    expect(header).toContain('{serviceReport &&')
    expect(header).toContain('Leistungsdatum')
  })
})
