import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dialog = readFileSync(resolve(process.cwd(), 'components/offers/OfferPdfDialog.tsx'), 'utf8')

describe('eingebettete Angebotsvorschau', () => {
  it('zeigt das geschützte PDF innerhalb eines modalen Dialogs', () => {
    expect(dialog).toContain("src={`/api/offers/${offerId}/preview`}")
    expect(dialog).toContain('<iframe')
    expect(dialog).toContain('<Dialog.Content')
    expect(dialog).not.toContain('target="_blank"')
  })

  it('bietet einen klar benannten Schließen-Button und bleibt auf der Seite', () => {
    expect(dialog).toContain('<Dialog.Close asChild>')
    expect(dialog).toContain('aria-label="Vorschau schließen"')
    expect(dialog).toContain('PDF-Vorschau des Angebots')
  })
})
