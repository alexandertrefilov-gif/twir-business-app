import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'components/service-reports/ServiceReportPdfDialog.tsx'),
  'utf8',
)

describe('Leistungsnachweisvorschau im Workflow', () => {
  it('öffnet die PDF-Vorschau im selben Dialog wie Angebot und Auftrag', () => {
    expect(source).toContain('<Dialog.Root>')
    expect(source).toContain('src={`/api/services/${reportId}/pdf`}')
    expect(source).toContain('title="PDF-Vorschau des Leistungsnachweises"')
    expect(source).not.toContain('target="_blank"')
  })

  it('verwendet den kompakten Workflow-Button', () => {
    expect(source).toContain('min-h-8 w-full')
    expect(source).toContain('text-xs font-500 text-blue-700')
    expect(source).toContain('Vorschau')
  })
})
