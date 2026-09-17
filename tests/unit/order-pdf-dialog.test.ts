import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'components/orders/OrderPdfDialog.tsx'),
  'utf8',
)

describe('Auftragsvorschau im Workflow', () => {
  it('zeigt die Vorschau im selben Dialog statt in einem neuen Browserfenster', () => {
    expect(source).toContain('<Dialog.Root>')
    expect(source).toContain('<iframe')
    expect(source).toContain('title="PDF-Vorschau des Auftrags"')
    expect(source).not.toContain('target="_blank"')
  })

  it('entspricht der einfachen Angebotsvorschau ohne zweite Inhaltskonfiguration', () => {
    expect(source).toContain('src={`/api/orders/${orderId}/pdf`}')
    expect(source).not.toContain('PDF-Inhalte')
    expect(source).not.toContain('Mitarbeiter (ohne Preise)')
    expect(source).not.toContain('Vollständig')
    expect(source).not.toContain('type="checkbox"')
    expect(source).not.toContain('Herunterladen')
  })

  it('verwendet denselben kompakten Vorschau-Button wie das Angebot', () => {
    expect(source).toContain('min-h-8 w-full')
    expect(source).toContain('text-xs font-500 text-blue-700')
    expect(source).toContain('Vorschau')
  })
})
