import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Dokumentbearbeitung im Workflow', () => {
  const editors = [
    ['offer', 'app/(dashboard)/offers/[id]/edit/page.tsx', 'components/offers/OfferForm.tsx'],
    ['order', 'app/(dashboard)/orders/[id]/edit/page.tsx', 'components/orders/OrderForm.tsx'],
    ['serviceReport', 'app/(dashboard)/services/[id]/edit/page.tsx', 'components/service-reports/ServiceReportForm.tsx'],
    ['invoice', 'app/(dashboard)/invoices/[id]/edit/page.tsx', 'components/invoices/InvoiceForm.tsx'],
  ] as const

  it.each(editors)('%s nutzt die sticky Sidebar und den gemeinsamen Bearbeitungsbereich', (_type, pagePath, formPath) => {
    const page = source(pagePath)
    const form = source(formPath)

    expect(page).toContain('<BusinessDocumentSidebar sticky>')
    expect(page).toContain('editingAction={<div id="document-edit-workflow-actions" />}')
    expect(form).toContain('<DocumentFormWorkflowActions')
  })

  it('verwendet requestSubmit und damit unverändert die bestehende Form-Action und Browser-Validierung', () => {
    const actions = source('components/documents/DocumentFormWorkflowActions.tsx')

    expect(actions).toContain('form.checkValidity()')
    expect(actions).toContain('form.requestSubmit()')
    expect(actions).toContain('submissionRequestedRef.current')
    expect(actions).toContain('disabled={isPending || submissionRequested}')
    expect(actions).toContain("role=\"alert\"")
    expect(actions).toContain('Abbrechen')
  })

  it('zeigt den Bearbeitungsbereich getrennt unterhalb des Workflows', () => {
    const workflow = source('components/workflow/BusinessProcessWorkflow.tsx')

    expect(workflow).toContain('aria-labelledby="workflow-editing-title"')
    expect(workflow).toContain('Bearbeitung')
    expect(workflow.indexOf('{editingAction}')).toBeGreaterThan(workflow.indexOf('</ol>'))
  })

  it.each([
    ['components/offers/OfferForm.tsx', 'Angebot anlegen'],
    ['components/orders/OrderForm.tsx', 'Auftrag anlegen'],
    ['components/invoices/InvoiceForm.tsx', 'Entwurf anlegen'],
  ])('verwendet auch beim Erstellen den gemeinsamen Workflow-Submit in %s', (path, label) => {
    const form = source(path)
    expect(form).toContain('DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID')
    expect(form).toContain("targetId={mode === 'create'")
    expect(form).toContain(label)
    expect(form).not.toContain('<FormSubmitButton')
  })

  it.each([
    'app/(dashboard)/offers/new/page.tsx',
    'app/(dashboard)/orders/new/page.tsx',
    'app/(dashboard)/invoices/new/page.tsx',
    'app/(dashboard)/services/new/page.tsx',
  ])('%s stellt die Create-Aktion in einer sticky Workflow-Spalte bereit', (path) => {
    const page = source(path)
    expect(page).toContain('<BusinessDocumentSidebar sticky>')
    expect(page).toMatch(/DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID|service-report-workflow-actions/)
  })

  it('unterscheidet Angebots-Neuanlage und Kopie ohne zweite Create-Action', () => {
    const page = source('app/(dashboard)/offers/new/page.tsx')
    expect(page).toContain("sourceOffer ? 'Angebot als Entwurf anlegen' : 'Angebot anlegen'")
    expect(page.match(/action=\{createOfferAction\}/g)).toHaveLength(1)
  })
})
