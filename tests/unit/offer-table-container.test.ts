import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import { applyResponsiveTableLayout } from '@/components/offers/ResponsiveTableView'
import type { RichTextNode } from '@/lib/offers/rich-text'

function table(widths: number[]): RichTextNode {
  return {
    type: 'table',
    content: [{
      type: 'tableRow',
      content: widths.map((width, index) => ({
        type: 'tableCell',
        attrs: { colspan: 1, colwidth: [width] },
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: index === 0 ? 'Produktionsreifeprüfungsanforderungen' : `Spalte ${index + 1}` }],
        }],
      })),
    }],
  }
}

function applyLayout(widths: number[]) {
  const columns = widths.map(() => ({ style: { width: '', minWidth: '' } }))
  const tableStyle = { width: '1000px', maxWidth: '', minWidth: '', boxSizing: '' }
  const node = { toJSON: () => table(widths) } as unknown as ProseMirrorNode

  applyResponsiveTableLayout(
    node,
    { children: columns } as unknown as HTMLTableColElement,
    { style: tableStyle } as unknown as HTMLTableElement,
  )

  return { columns, tableStyle }
}

describe('responsive Tabellen im Dokumentcontainer', () => {
  it('ersetzt eine feste Word-/TipTap-Gesamtbreite durch die Containerbreite', () => {
    const { tableStyle } = applyLayout([240, 180, 320, 140])

    expect(tableStyle).toEqual({
      width: '100%',
      maxWidth: '100%',
      minWidth: '100%',
      boxSizing: 'border-box',
    })
  })

  it('setzt absolute colwidth-Werte als relative Spaltengewichte um', () => {
    const { columns } = applyLayout([900, 80, 60, 40])
    const percentages = columns.map((column) => Number.parseFloat(column.style.width))

    expect(percentages.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100)
    expect(percentages.every((width) => width > 0)).toBe(true)
    expect(columns.every((column) => column.style.minWidth === '0')).toBe(true)
  })

  it('verwendet die responsive NodeView auch nach Tabellen-Resize und Strukturänderungen', () => {
    const editor = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')
    const view = readFileSync(resolve(process.cwd(), 'components/offers/ResponsiveTableView.ts'), 'utf8')

    expect(editor).toContain('Table.configure({ resizable: true, View: ResponsiveTableView })')
    expect(editor).not.toContain('style: `width: ${widths[0]}px;`')
    expect(view).toContain('applyResponsiveTableLayout(node, this.colgroup, this.table)')
    expect(view.match(/applyResponsiveTableLayout\(node, this\.colgroup, this\.table\)/g)).toHaveLength(2)
  })

  it('begrenzt Editor, Ansicht, Wrapper und Dokumentkarte zentral', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    const output = readFileSync(resolve(process.cwd(), 'components/offers/OfferRichText.tsx'), 'utf8')
    const card = readFileSync(resolve(process.cwd(), 'components/documents/DocumentSectionCard.tsx'), 'utf8')
    const layout = readFileSync(resolve(process.cwd(), 'components/documents/BusinessDocumentLayout.tsx'), 'utf8')

    expect(css).toContain('.offer-rich-editor .tableWrapper')
    expect(css).toContain('@apply my-3 w-full max-w-full overflow-x-auto;')
    expect(output).toContain('w-full min-w-0 max-w-full overflow-x-auto')
    expect(card).toContain('min-w-0 max-w-full overflow-hidden')
    expect(layout).toContain('lg:grid-cols-[minmax(0,1fr)_20px_var(--document-sidebar-width)]')
  })
})
