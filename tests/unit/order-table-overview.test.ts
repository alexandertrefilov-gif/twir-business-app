import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const tableSource = readFileSync(
  resolve(process.cwd(), 'components/orders/OrderTable.tsx'),
  'utf8',
)
const pageSource = readFileSync(
  resolve(process.cwd(), 'app/(dashboard)/orders/page.tsx'),
  'utf8',
)

describe('Auftragsübersicht', () => {
  it('verwendet dasselbe interaktive Tabellenmuster wie die Angebotsübersicht', () => {
    expect(pageSource).toContain('<OrderTable')
    expect(tableSource).toContain('useSearchParams')
    expect(tableSource).toContain('overflow-x-auto')
    expect(tableSource).toContain('Seite {page} von {totalPages}')
    expect(tableSource).not.toContain('Filtern')
  })

  it('ordnet Überschriften und Inhalte für Brutto und Löschen identisch an', () => {
    const grossHeader = tableSource.indexOf('label="Brutto"')
    const deleteHeader = tableSource.indexOf('>Löschen</th>')
    const grossValue = tableSource.indexOf('order.totalGross.toLocaleString')
    const deleteButton = tableSource.indexOf('<RecordDeleteButton id={order.id} type="order"')

    expect(grossHeader).toBeGreaterThan(-1)
    expect(deleteHeader).toBeGreaterThan(grossHeader)
    expect(grossValue).toBeGreaterThan(deleteHeader)
    expect(deleteButton).toBeGreaterThan(grossValue)
  })

  it('behält Kundenlink und Auftragsdetail-Navigation getrennt bedienbar', () => {
    expect(tableSource).toContain('router.push(`/orders/${order.id}`)')
    expect(tableSource).toContain('href={`/customers/${order.customerId}`}')
    expect(tableSource).toContain('onClick={(event) => event.stopPropagation()}')
  })
})
