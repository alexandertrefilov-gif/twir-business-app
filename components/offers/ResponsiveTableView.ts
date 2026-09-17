import { TableView } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView, NodeView } from '@tiptap/pm/view'
import { getTableColumnPercentages, type RichTextNode } from '@/lib/offers/rich-text'

/**
 * TipTap interpretiert colwidth als Pixel. TWIR speichert darin dagegen
 * normalisierte Spaltengewichte, damit Word-Breiten zwischen Editor, Ansicht
 * und PDF konsistent bleiben. Diese NodeView setzt die Gewichte relativ zur
 * tatsächlich verfügbaren Editorbreite um.
 */
export class ResponsiveTableView extends TableView implements NodeView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view: EditorView,
    HTMLAttributes?: Record<string, unknown>,
  ) {
    super(node, cellMinWidth, view, HTMLAttributes)
    applyResponsiveTableLayout(node, this.colgroup, this.table)
  }

  update(node: ProseMirrorNode) {
    if (!super.update(node)) return false
    applyResponsiveTableLayout(node, this.colgroup, this.table)
    return true
  }
}

export function applyResponsiveTableLayout(
  node: ProseMirrorNode,
  colgroup: HTMLTableColElement,
  table: HTMLTableElement,
) {
  const percentages = getTableColumnPercentages(node.toJSON() as RichTextNode)

  table.style.width = '100%'
  table.style.maxWidth = '100%'
  table.style.minWidth = '100%'
  table.style.boxSizing = 'border-box'

  Array.from(colgroup.children).forEach((column, index) => {
    const width = percentages[index]
    if (typeof width === 'number') {
      const columnStyle = (column as HTMLElement).style
      columnStyle.width = `${width}%`
      columnStyle.minWidth = '0'
    }
  })
}
