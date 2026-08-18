import { Fragment, type CSSProperties, type ReactNode } from 'react'
import {
  decodeOfferText,
  getTableColumnPercentages,
  type RichTextMark,
  type RichTextNode,
} from '@/lib/offers/rich-text'

export function OfferRichText({ value }: { value?: string | null }) {
  const document = decodeOfferText(value)
  const hasContent = document.sections.some((section) =>
    section.title || nodeHasText(section.content) || nodeHasTable(section.content))
  if (!hasContent) return null

  return (
    <div className="offer-rich-output space-y-5">
      {document.sections.map((section) => (
        <section key={section.id}>
          {section.title && <h2>{section.title}</h2>}
          <RichNodes nodes={section.content.content ?? []} />
        </section>
      ))}
    </div>
  )
}

function RichNodes({ nodes }: { nodes: RichTextNode[] }) {
  return <>{nodes.map((node, index) => <RichNodeView key={index} node={node} />)}</>
}

function RichNodeView({ node }: { node: RichTextNode }): ReactNode {
  const children = node.type === 'text'
    ? applyMarks(node.text ?? '', node.marks ?? [])
    : <RichNodes nodes={node.content ?? []} />
  const align = alignmentStyle(node)

  switch (node.type) {
    case 'text': return children
    case 'paragraph': return <p style={align}>{children || <br />}</p>
    case 'heading': {
      const level = Number(node.attrs?.level ?? 2)
      return level === 1
        ? <h1 style={align}>{children}</h1>
        : level === 3
          ? <h3 style={align}>{children}</h3>
          : <h2 style={align}>{children}</h2>
    }
    case 'hardBreak': return <br />
    case 'horizontalRule': return <hr />
    case 'bulletList': return <ul>{children}</ul>
    case 'orderedList': return <ol>{children}</ol>
    case 'listItem': return <li>{children}</li>
    case 'blockquote': return <blockquote>{children}</blockquote>
    case 'codeBlock': return <pre><code>{children}</code></pre>
    case 'table': return <RichTable node={node} />
    case 'tableRow': return <tr>{children}</tr>
    case 'tableHeader': return <th {...cellSpan(node)} style={cellStyle(node)}>{children}</th>
    case 'tableCell': return <td {...cellSpan(node)} style={cellStyle(node)}>{children}</td>
    case 'doc': return children
    default: return null
  }
}

function RichTable({ node }: { node: RichTextNode }) {
  const columnPercentages = getTableColumnPercentages(node)
  return (
    <div className="w-full max-w-full overflow-x-auto">
      <table>
        <colgroup>
          {columnPercentages.map((percentage, index) => (
            <col key={index} style={{ width: `${percentage}%` }} />
          ))}
        </colgroup>
        <tbody><RichNodes nodes={node.content ?? []} /></tbody>
      </table>
    </div>
  )
}

function applyMarks(text: string, marks: RichTextMark[]): ReactNode {
  return marks.reduce<ReactNode>((content, mark, index) => {
    switch (mark.type) {
      case 'bold': return <strong key={index}>{content}</strong>
      case 'italic': return <em key={index}>{content}</em>
      case 'underline': return <u key={index}>{content}</u>
      case 'strike': return <s key={index}>{content}</s>
      case 'code': return <code key={index}>{content}</code>
      case 'textStyle': return <span key={index} style={textStyle(mark)}>{content}</span>
      default: return <Fragment key={index}>{content}</Fragment>
    }
  }, text)
}

function textStyle(mark: RichTextMark): CSSProperties {
  return {
    color: typeof mark.attrs?.color === 'string' ? mark.attrs.color : undefined,
    backgroundColor: typeof mark.attrs?.backgroundColor === 'string' ? mark.attrs.backgroundColor : undefined,
    fontFamily: typeof mark.attrs?.fontFamily === 'string' ? mark.attrs.fontFamily : undefined,
    fontSize: typeof mark.attrs?.fontSize === 'string' ? mark.attrs.fontSize : undefined,
  }
}

function alignmentStyle(node: RichTextNode): CSSProperties {
  const textAlign = node.attrs?.textAlign
  return {
    textAlign: textAlign === 'center' || textAlign === 'right' || textAlign === 'justify'
      ? textAlign
      : undefined,
  }
}

function cellSpan(node: RichTextNode) {
  return {
    colSpan: typeof node.attrs?.colspan === 'number' ? node.attrs.colspan : undefined,
    rowSpan: typeof node.attrs?.rowspan === 'number' ? node.attrs.rowspan : undefined,
  }
}

function cellStyle(node: RichTextNode): CSSProperties {
  const backgroundColor = typeof node.attrs?.backgroundColor === 'string'
    ? node.attrs.backgroundColor
    : undefined
  return {
    backgroundColor,
    color: isDarkCellColor(backgroundColor) ? '#ffffff' : undefined,
    height: typeof node.attrs?.rowHeight === 'number'
      ? `${node.attrs.rowHeight}px`
      : undefined,
  }
}

function isDarkCellColor(color?: string): boolean {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return false
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 < 128
}

function nodeHasText(node: RichTextNode): boolean {
  return Boolean(node.text) || (node.content ?? []).some(nodeHasText)
}

function nodeHasTable(node: RichTextNode): boolean {
  return node.type === 'table' || (node.content ?? []).some(nodeHasTable)
}
