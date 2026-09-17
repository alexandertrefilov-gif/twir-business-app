import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderInvoicePdf, type InvoicePdfData } from '@/lib/pdf-templates/invoice.template'
import { encodeOfferText } from '@/lib/offers/rich-text'

const data: InvoicePdfData = {
  invoiceNumber: 'RE2026-0001', invoiceDate: '27.08.2026', dueDate: '10.09.2026', deliveryDate: '26.08.2026', orderNumber: 'AU2026-0004',
  company: { companyName: 'TWIR', legalForm: 'GmbH', street: 'Wächtergasse', houseNumber: '10', postalCode: '71706', city: 'Markgröningen', vatId: 'DE123456789', iban: 'DE001234' },
  customer: { name: 'Mercedes-Benz AG', street: 'Emil-Kessler-Str.', houseNumber: '4', postalCode: '73733', city: 'Esslingen' },
  items: [{ position: 1, description: 'Fachbauleitung und Koordination', quantity: 10, unit: 'Std.', unitPrice: 100, taxRate: 19, netAmount: 1000, grossAmount: 1190 }],
  totalNet: 1000, totalTax: 190, totalGross: 1190,
}

describe('Rechnungs-PDF und Workflow-Vorschau', () => {
  it('rendert eine echte PDF-Datei mit Rechnungsdaten', async () => {
    const buffer = await renderInvoicePdf(data)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('rendert gespeicherte Rechnungs-Textmodule statt Live-Leistungsdaten', async () => {
    const introText = encodeOfferText({
      version: 1,
      sections: [{ id: 'invoice-text', title: 'Abrechnungstext', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gespeicherter Rechnungsstand' }] }] } }],
    })
    const buffer = await renderInvoicePdf({ ...data, introText })
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
    const template = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/invoice.template.tsx'), 'utf8')
    expect(template).toContain('<OfferRichTextPdf value={data.introText} />')
    const service = readFileSync(resolve(process.cwd(), 'lib/services/invoice-pdf.service.ts'), 'utf8')
    expect(service).toContain('introText: invoice.introText')
  })

  it('schützt die PDF-Route mit Rechnungs-Leseberechtigung', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/invoices/[id]/pdf/route.ts'), 'utf8')
    expect(route).toContain('requirePermission(Resource.INVOICE, Action.READ)')
    expect(route).toContain("'Cache-Control': 'private, no-store'")
    expect(route).toContain("'X-Content-Type-Options': 'nosniff'")
  })

  it('verwendet bei finalisierten Rechnungen gespeicherte Snapshots', () => {
    const service = readFileSync(resolve(process.cwd(), 'lib/services/invoice-pdf.service.ts'), 'utf8')
    expect(service).toContain('invoice.companySnapshot')
    expect(service).toContain('invoice.customerSnapshot')
    expect(service).toContain('storedCompany ?')
    expect(service).toContain('storedCustomer ?')
  })

  it('zeigt Vorschau und Anzeigen nebeneinander im Rechnungsworkflow', () => {
    const workflow = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    expect(workflow).toContain("if (stageKey === 'invoice')")
    expect(workflow).toContain('<InvoicePdfDialog invoiceId={documentId} />')
    expect(workflow).toContain('grid w-full grid-cols-2')
    const dialog = readFileSync(resolve(process.cwd(), 'components/invoices/InvoicePdfDialog.tsx'), 'utf8')
    expect(dialog).toContain('await fetch(`/api/invoices/${invoiceId}/pdf`')
    expect(dialog).toContain('URL.createObjectURL(await response.blob())')
    expect(dialog).toContain('src={previewUrl}')
    expect(dialog).not.toContain('src={`/api/invoices/${invoiceId}/pdf`}')
  })

  it('zeigt die PDF-Vorschau auch vor dem Speichern im Rechnungsformular', () => {
    const form = readFileSync(resolve(process.cwd(), 'components/invoices/InvoiceForm.tsx'), 'utf8')
    expect(form).toContain('<InvoiceDraftPdfPreview invoiceId={invoiceId} />')
    const preview = readFileSync(resolve(process.cwd(), 'components/invoices/InvoiceDraftPdfPreview.tsx'), 'utf8')
    expect(preview).toContain("fetch('/api/invoices/preview'")
  })
})
