import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Leistungsnachweis-Aktionen im Workflow', () => {
  it.each([
    'app/(dashboard)/services/new/page.tsx',
    'app/(dashboard)/services/[id]/edit/page.tsx',
  ])('stellt auf %s die Aktionen direkt im sticky Workflow bereit', (path) => {
    const page = source(path)
    const sidebar = page.indexOf('<BusinessDocumentSidebar sticky>')
    const workflow = page.indexOf('<BusinessProcessWorkflow', sidebar)
    const actions = page.indexOf(path.includes('/new/') ? 'serviceReportAction=' : 'editingAction=', workflow)

    expect(sidebar).toBeGreaterThan(0)
    expect(workflow).toBeGreaterThan(sidebar)
    expect(actions).toBeGreaterThan(workflow)
    expect(page).not.toContain('service-report-actions-title')
  })

  it('rendert Abbrechen, PDF-Vorschau und Speichern im Aktionsbereich', () => {
    const form = source('components/service-reports/ServiceReportForm.tsx')
    expect(form).toContain('<DocumentFormWorkflowActions')
    expect(form).toContain('id={FORM_ID}')
    expect(form).toContain('ref={formRef}')
    expect(form).toContain('<ServiceReportPdfPreview')
    expect(form).toContain("mode === 'create' ? 'Leistungsnachweis erstellen' : 'Änderungen speichern'")
    const sharedActions = source('components/documents/DocumentFormWorkflowActions.tsx')
    expect(sharedActions).toContain('createPortal(')
    expect(sharedActions).toContain('form.requestSubmit()')
    expect(sharedActions).toContain('disabled={isPending || submissionRequested}')
    expect(sharedActions).toContain('Abbrechen')
    expect(sharedActions).toContain('role="alert"')
  })

  it('wendet sticky nur optional ab Desktop an', () => {
    const layout = source('components/documents/BusinessDocumentLayout.tsx')

    expect(layout).toContain('sticky = true')
    expect(layout).toContain("sticky ? 'lg:sticky lg:top-[calc(var(--document-sticky-header-height,0px)+1rem)]")
    expect(layout).toContain('lg:max-h-[calc(100vh-var(--document-sticky-header-height,0px)-2rem)]')
    expect(layout).toContain('lg:overflow-y-auto')
  })

  it('montiert die Aktionen ausschließlich im Schritt Leistungsnachweise', () => {
    const workflow = source('components/workflow/BusinessProcessWorkflow.tsx')

    expect(workflow).toContain("stage.key === 'serviceReport' && serviceReportAction")
    expect(workflow).toContain('{serviceReportAction}</div>')
    expect(workflow).toContain('suppressServiceReportCreate={Boolean(serviceReportAction)}')
  })

  it('rendert den PDF-Dialog außerhalb der sticky Sidebar über der Editorleiste', () => {
    const preview = source('components/service-reports/ServiceReportPdfPreview.tsx')

    expect(preview).toContain("import { createPortal } from 'react-dom'")
    expect(preview).toContain('open && createPortal(')
    expect(preview).toContain('document.body')
    expect(preview).toContain('z-[100]')
  })
})
