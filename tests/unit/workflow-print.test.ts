import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
const printButton = readFileSync(resolve(process.cwd(), 'components/documents/DocumentPrintButton.tsx'), 'utf8')

describe('Drucken im gemeinsamen Dokumentworkflow', () => {
  it('offers the central print action for every existing document type', () => {
    expect(workflow.match(/<DocumentPrintButton/g)).toHaveLength(4)
    expect(workflow).toContain("key === 'offer' ? `/api/offers/${id}/preview`")
    expect(workflow).toContain("key === 'order' ? `/api/orders/${id}/pdf`")
    expect(workflow).toContain("key === 'serviceReport' ? `/api/services/${id}/pdf`")
    expect(workflow).toContain(': `/api/invoices/${id}/pdf`')
  })

  it('loads the protected PDF and opens the browser print dialog without changing data', () => {
    expect(printButton).toContain("fetch(pdfUrl, { cache: 'no-store', credentials: 'same-origin' })")
    expect(printButton).toContain("document.createElement('iframe')")
    expect(printButton).toContain('frame.contentWindow?.print()')
    expect(printButton).toContain('URL.revokeObjectURL(blobUrl)')
    expect(printButton).not.toContain('method:')
  })

  it('reports PDF loading errors inside the workflow', () => {
    expect(printButton).toContain('response.ok')
    expect(printButton).toContain('role="alert"')
    expect(printButton).toContain("printing ? 'Laden …' : 'Drucken'")
  })
})
