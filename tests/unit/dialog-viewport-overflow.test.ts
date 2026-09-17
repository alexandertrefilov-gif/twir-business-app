import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression: zentrierte Dialoge (fixed top-1/2/left-1/2) ohne max-height und
// overflow-y-auto schneiden ihre Aktionsbuttons auf kleinen Viewports
// (z.B. Tablet) ab und machen sie unklickbar. CustomerAddressPicker.tsx war
// von Anfang an korrekt; diese Dateien mussten nachgezogen werden.
describe('Dialog-Overflow auf kleinen Viewports', () => {
  const files = [
    'components/offers/CustomerPurchaseOrderDialog.tsx',
  ]

  it.each(files)('%s begrenzt Dialog.Content auf max-h-[90vh] mit overflow-y-auto', (path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8')
    const dialogContentLines = source.split('\n').filter(line => line.includes('Dialog.Content') && line.includes('className'))
    expect(dialogContentLines.length).toBeGreaterThan(0)
    for (const line of dialogContentLines) {
      if (!line.includes("top-1/2")) continue
      expect(line).toMatch(/max-h-\[90vh\]/)
      expect(line).toMatch(/overflow-y-auto/)
    }
  })
})
