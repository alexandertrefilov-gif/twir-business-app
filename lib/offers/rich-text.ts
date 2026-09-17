import {
  normalizeWordColor,
  normalizeWordFontFamily,
  normalizeWordFontSize,
} from '@/lib/offers/word-paste'
import { calculateTableColumnPercentages } from '@/lib/offers/table-layout'

export const OFFER_RICH_TEXT_PREFIX = 'TWIR_OFFER_RICH_TEXT_V1:'

export interface RichTextMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface RichTextNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: RichTextMark[]
  content?: RichTextNode[]
}

export interface OfferTextSection {
  id: string
  title: string
  content: RichTextNode
}

export interface OfferTextDocument {
  version: 1
  sections: OfferTextSection[]
  positionsAfterSectionId?: string | null
  positionsEnabled?: boolean
}

const NODE_TYPES = new Set([
  'doc', 'paragraph', 'heading', 'text', 'hardBreak', 'horizontalRule',
  'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock',
  'table', 'tableRow', 'tableHeader', 'tableCell',
])
const MARK_TYPES = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'textStyle'])
const FONT_FAMILIES = new Set(['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New'])
const FONT_SIZES = new Set([
  '10pt', '11pt', '12pt', '14pt', '16pt', '18pt',
  // Bereits gespeicherte Editorwerte bleiben lesbar und bearbeitbar.
  '10px', '12px', '14px', '16px', '18px', '24px',
])
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export function emptyRichTextDocument(text = ''): OfferTextDocument {
  return {
    version: 1,
    sections: [{
      id: crypto.randomUUID(),
      title: '',
      content: plainTextDocument(text),
    }],
  }
}

function plainTextDocument(text: string): RichTextNode {
  const paragraphs = text ? text.split(/(?:\r?\n){2,}/) : ['']
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: paragraph
        ? paragraph.split(/\r?\n/).flatMap((line, index) => [
            ...(index > 0 ? [{ type: 'hardBreak' } as RichTextNode] : []),
            ...(line ? [{ type: 'text', text: line } as RichTextNode] : []),
          ])
        : undefined,
    })),
  }
}

export function decodeOfferText(value?: string | null): OfferTextDocument {
  if (!value) return emptyRichTextDocument()
  if (!value.startsWith(OFFER_RICH_TEXT_PREFIX)) return emptyRichTextDocument(value)

  try {
    const parsed: unknown = JSON.parse(value.slice(OFFER_RICH_TEXT_PREFIX.length))
    if (isOfferTextDocument(parsed)) {
      return {
        ...parsed,
        sections: parsed.sections.map((section) => ({
          ...section,
          content: normalizeTableNodes(section.content),
        })),
      }
    }
  } catch {
    // Ungültige strukturierte Inhalte werden niemals als HTML interpretiert.
  }
  return emptyRichTextDocument()
}

export function encodeOfferText(document: OfferTextDocument): string {
  return `${OFFER_RICH_TEXT_PREFIX}${JSON.stringify({
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      content: canonicalizeEditorNode(section.content),
    })),
  })}`
}

export function canonicalizeOfferTextValue(value: string): string {
  if (!value.startsWith(OFFER_RICH_TEXT_PREFIX)) return value
  try {
    const parsed: unknown = JSON.parse(value.slice(OFFER_RICH_TEXT_PREFIX.length))
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.sections)) {
      return value
    }
    const sections = parsed.sections.map((section) => {
      if (
        !isRecord(section) ||
        typeof section.id !== 'string' ||
        typeof section.title !== 'string' ||
        !isEditorNodeShape(section.content)
      ) return section
      return {
        ...section,
        content: canonicalizeEditorNode(section.content),
      }
    })
    return `${OFFER_RICH_TEXT_PREFIX}${JSON.stringify({ ...parsed, sections })}`
  } catch {
    return value
  }
}

export function isOfferTextDocumentEmpty(document: OfferTextDocument): boolean {
  // Für Leistungsnachweise ist auch eine reine Positionskarte oder deren
  // explizite Abwesenheit persistente Dokumentstruktur.
  if (document.positionsEnabled !== undefined) return false
  return !document.sections.some((section) =>
    section.title.trim() || hasText(section.content) || hasNodeType(section.content, 'table'))
}

export function isValidOfferTextValue(value: string | null | undefined): boolean {
  if (!value) return true
  if (!value.startsWith(OFFER_RICH_TEXT_PREFIX)) return value.length <= 10_000
  if (value.length > 500_000) return false

  try {
    return isOfferTextDocument(JSON.parse(value.slice(OFFER_RICH_TEXT_PREFIX.length)))
  } catch {
    return false
  }
}

export function richTextToPlainText(value?: string | null): string {
  const document = decodeOfferText(value)
  return document.sections
    .map((section) => [section.title, nodeText(section.content)].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Reads the semantic value displayed after the "Projekt:" label in an offer's
 * stored intro rich text. The label and value may share a paragraph (including
 * a hard break) or occupy two consecutive blocks.
 */
export function offerProjectDesignation(value?: string | null): string | null {
  const document = decodeOfferText(value)
  const blocks = document.sections.flatMap((section) => [
    ...(section.title.trim() ? [section.title.trim()] : []),
    ...(section.content.content ?? []).map((node) => nodeText(node).trim()).filter(Boolean),
  ])

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const lines = blocks[blockIndex].split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const match = /^Projekt\s*:\s*(.*)$/i.exec(lines[lineIndex])
      if (!match) continue
      const inlineValue = match[1].trim()
      if (inlineValue) return inlineValue
      const nextLine = lines[lineIndex + 1]?.trim()
      if (nextLine) return nextLine
      const nextBlock = blocks.slice(blockIndex + 1).find((block) => block.trim())
      return nextBlock?.trim() || null
    }
  }

  return null
}

export function offerIntroToOrderDescription(value?: string | null): string | null {
  const firstSection = decodeOfferText(value).sections[0]
  const description = firstSection
    ? [firstSection.title, nodeText(firstSection.content)].filter(Boolean).join('\n').trim()
    : ''
  if (!description) return null
  return description.slice(0, 3_000)
}

export function offerToOrderDescription(
  introText?: string | null,
  outroText?: string | null,
  hasPositions = false,
): string | null {
  const introSections = introText ? decodeOfferText(introText).sections : []
  const outroSections = outroText ? decodeOfferText(outroText).sections : []
  const sections = [...introSections, ...outroSections]
  if (sections.length === 0 && !hasPositions) return null
  return encodeOfferText({
    version: 1,
    sections,
    positionsAfterSectionId: introSections.at(-1)?.id ?? null,
    positionsEnabled: hasPositions,
  })
}

export function orderDescriptionWithOfferFallback(
  description: string | null | undefined,
  offer: { introText?: string | null; outroText?: string | null } | null | undefined,
  hasPositions: boolean,
): string | null {
  if (description?.startsWith(OFFER_RICH_TEXT_PREFIX)) return description
  if (offer?.introText || offer?.outroText) {
    return offerToOrderDescription(offer.introText, offer.outroText, hasPositions)
  }
  return description ?? null
}

export function splitOfferTextAtPositions(value?: string | null): {
  before: string | null
  after: string | null
  positionsEnabled: boolean
} {
  if (!value) return { before: null, after: null, positionsEnabled: true }
  const document = decodeOfferText(value)
  if (document.positionsAfterSectionId === undefined) {
    return { before: value, after: null, positionsEnabled: true }
  }
  const splitIndex = document.positionsAfterSectionId === null
    ? 0
    : Math.max(0, document.sections.findIndex((section) => section.id === document.positionsAfterSectionId) + 1)
  const encodeSections = (sections: OfferTextSection[]) => sections.length > 0
    ? encodeOfferText({ version: 1, sections })
    : null
  return {
    before: encodeSections(document.sections.slice(0, splitIndex)),
    after: encodeSections(document.sections.slice(splitIndex)),
    positionsEnabled: document.positionsEnabled !== false,
  }
}

export type OrderContentCard = 'descriptionBefore' | 'positions' | 'descriptionAfter'

export function removeOrderContentCard(
  value: string | null | undefined,
  card: OrderContentCard,
): string | null {
  if (!value) return null
  const document = decodeOfferText(value)
  if (document.positionsAfterSectionId === undefined) {
    if (card === 'descriptionBefore') return null
    if (card === 'positions') return encodeOfferText({
      ...document,
      positionsEnabled: false,
      positionsAfterSectionId: document.sections[0]?.id ?? null,
    })
    return value
  }
  const splitIndex = document.positionsAfterSectionId === null
    ? 0
    : Math.max(0, document.sections.findIndex((section) => section.id === document.positionsAfterSectionId) + 1)
  if (card === 'positions') {
    return encodeOfferText({ ...document, positionsEnabled: false })
  }
  const sections = card === 'descriptionBefore'
    ? document.sections.slice(splitIndex)
    : document.sections.slice(0, splitIndex)
  return encodeOfferText({
    ...document,
    sections,
    positionsAfterSectionId: card === 'descriptionBefore'
      ? null
      : sections.at(-1)?.id ?? null,
  })
}

export function getTableColumnPercentages(table: RichTextNode): number[] {
  return calculateTableColumnPercentages((table.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => ({
      colspan: tableCellColspan(cell),
      widths: Array.isArray(cell.attrs?.colwidth)
        ? cell.attrs.colwidth.filter((width): width is number => typeof width === 'number')
        : undefined,
      text: nodeText(cell),
    }))))
}

function normalizeTableNodes(node: RichTextNode): RichTextNode {
  const content = node.content?.map(normalizeTableNodes)
  const current = { ...node, ...(content ? { content } : {}) }
  if (current.type !== 'table') return current

  const percentages = getTableColumnPercentages(current)
  if (percentages.length === 1) return current
  return {
    ...current,
    content: (current.content ?? []).map((row) => {
      let offset = 0
      return {
        ...row,
        content: (row.content ?? []).map((cell) => {
          const colspan = tableCellColspan(cell)
          const colwidth = percentages
            .slice(offset, offset + colspan)
            .map((percentage) => Math.round(percentage * 10))
          offset += colspan
          return { ...cell, attrs: { ...cell.attrs, colwidth } }
        }),
      }
    }),
  }
}

function tableCellColspan(cell: RichTextNode): number {
  const colspan = Number(cell.attrs?.colspan ?? 1)
  return Number.isInteger(colspan) && colspan > 0 ? colspan : 1
}

function nodeText(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'tableRow') return (node.content ?? []).map(nodeText).join('\t')
  if (['doc', 'bulletList', 'orderedList', 'table'].includes(node.type)) {
    return (node.content ?? []).map(nodeText).filter(Boolean).join('\n')
  }
  return (node.content ?? []).map(nodeText).join('')
}

function hasText(node: RichTextNode): boolean {
  return Boolean(node.text?.trim()) || (node.content ?? []).some(hasText)
}

function hasNodeType(node: RichTextNode, type: string): boolean {
  return node.type === type || (node.content ?? []).some((child) => hasNodeType(child, type))
}

function canonicalizeEditorNode(node: RichTextNode): RichTextNode {
  const attrs = canonicalizeNodeAttrs(node.type, node.attrs)
  const marks = node.marks
    ?.filter((mark) => MARK_TYPES.has(mark.type))
    .map((mark) => mark.type === 'textStyle'
      ? {
          type: mark.type,
          attrs: canonicalizeTextStyleAttrs(mark.attrs),
        }
      : { type: mark.type })
    .filter((mark) => mark.type !== 'textStyle' ||
      (mark.attrs && Object.keys(mark.attrs).length > 0))

  return {
    type: node.type,
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(attrs && Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(marks && marks.length > 0 ? { marks } : {}),
    ...(node.content
      ? { content: node.content.map(canonicalizeEditorNode) }
      : {}),
  }
}

function canonicalizeNodeAttrs(
  type: string,
  attrs?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!attrs) return undefined

  if (type === 'heading') {
    const level = Number(attrs.level)
    const textAlign = canonicalTextAlign(attrs.textAlign)
    return {
      ...([1, 2, 3].includes(level) ? { level } : {}),
      ...(textAlign ? { textAlign } : {}),
    }
  }
  if (type === 'paragraph') {
    const textAlign = canonicalTextAlign(attrs.textAlign)
    return textAlign ? { textAlign } : undefined
  }
  if (type !== 'tableCell' && type !== 'tableHeader') return undefined

  const colspan = Number(attrs.colspan)
  const rowspan = Number(attrs.rowspan)
  const colwidth = Array.isArray(attrs.colwidth)
    ? attrs.colwidth
        .map(Number)
        .filter((width) => Number.isFinite(width) && width >= 25 && width <= 2_000)
        .map(Math.round)
    : typeof attrs.colwidth === 'string'
      ? attrs.colwidth
          .split(',')
          .map(Number)
          .filter((width) => Number.isFinite(width) && width >= 25 && width <= 2_000)
          .map(Math.round)
      : []
  const align = canonicalTextAlign(attrs.align)
  const backgroundColor = typeof attrs.backgroundColor === 'string'
    ? normalizeWordColor(attrs.backgroundColor)
    : null
  const rowHeightValue = Number(attrs.rowHeight)
  const rowHeight = Number.isFinite(rowHeightValue)
    ? Math.min(160, Math.max(24, Math.round(rowHeightValue)))
    : null

  return {
    ...(Number.isInteger(colspan) && colspan >= 1 && colspan <= 50 ? { colspan } : {}),
    ...(Number.isInteger(rowspan) && rowspan >= 1 && rowspan <= 50 ? { rowspan } : {}),
    ...(colwidth.length > 0 ? { colwidth } : {}),
    ...(align ? { align } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(rowHeight ? { rowHeight } : {}),
  }
}

function canonicalizeTextStyleAttrs(
  attrs?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!attrs) return undefined
  const color = typeof attrs.color === 'string'
    ? normalizeWordColor(attrs.color)
    : null
  const backgroundColor = typeof attrs.backgroundColor === 'string'
    ? normalizeWordColor(attrs.backgroundColor)
    : null
  const fontFamily = typeof attrs.fontFamily === 'string'
    ? normalizeWordFontFamily(attrs.fontFamily)
    : null
  const fontSize = typeof attrs.fontSize === 'string'
    ? normalizeWordFontSize(attrs.fontSize)
    : null
  const result = {
    ...(color ? { color } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontSize ? { fontSize } : {}),
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function canonicalTextAlign(value: unknown): 'left' | 'center' | 'right' | 'justify' | null {
  return value === 'left' || value === 'center' || value === 'right' || value === 'justify'
    ? value
    : null
}

function isEditorNodeShape(value: unknown): value is RichTextNode {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (value.text !== undefined && typeof value.text !== 'string') return false
  if (value.attrs !== undefined && !isRecord(value.attrs)) return false
  if (
    value.marks !== undefined &&
    (
      !Array.isArray(value.marks) ||
      !value.marks.every((mark) =>
        isRecord(mark) &&
        typeof mark.type === 'string' &&
        (mark.attrs === undefined || isRecord(mark.attrs)))
    )
  ) return false
  return value.content === undefined ||
    (Array.isArray(value.content) && value.content.every(isEditorNodeShape))
}

function isOfferTextDocument(value: unknown): value is OfferTextDocument {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.sections)) return false
  if (value.sections.length > 20) return false
  if (value.positionsEnabled !== undefined && typeof value.positionsEnabled !== 'boolean') return false
  if (
    value.positionsAfterSectionId !== undefined &&
    value.positionsAfterSectionId !== null &&
    (typeof value.positionsAfterSectionId !== 'string' || value.positionsAfterSectionId.length > 100)
  ) return false

  return value.sections.every((section) => {
    if (!isRecord(section)) return false
    if (typeof section.id !== 'string' || section.id.length < 1 || section.id.length > 100) return false
    if (typeof section.title !== 'string' || section.title.length > 200) return false
    return validateNode(section.content, 0, { count: 0 })
  })
}

function validateNode(value: unknown, depth: number, state: { count: number }): value is RichTextNode {
  if (!isRecord(value) || depth > 20 || ++state.count > 10_000) return false
  if (typeof value.type !== 'string' || !NODE_TYPES.has(value.type)) return false
  if (value.text !== undefined && (typeof value.text !== 'string' || value.text.length > 100_000)) return false
  if (value.type === 'text' && typeof value.text !== 'string') return false
  if (value.attrs !== undefined && !validateAttrs(value.type, value.attrs)) return false
  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks) || value.marks.length > 10) return false
    if (!value.marks.every(validateMark)) return false
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content) || value.content.length > 5_000) return false
    if (!value.content.every((node) => validateNode(node, depth + 1, state))) return false
  }
  return true
}

function validateAttrs(type: string, value: unknown): boolean {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  const allowed = type === 'heading'
    ? new Set(['level', 'textAlign'])
    : type === 'paragraph'
      ? new Set(['textAlign'])
      : type === 'tableCell' || type === 'tableHeader'
          ? new Set([
              'colspan',
              'rowspan',
              'colwidth',
              'align',
              'backgroundColor',
              'rowHeight',
            ])
          : new Set<string>()
  if (!keys.every((key) => allowed.has(key))) return false
  if ('level' in value && ![1, 2, 3].includes(Number(value.level))) return false
  if ('textAlign' in value && !['left', 'center', 'right', 'justify', null].includes(value.textAlign as string | null)) return false
  if ('colspan' in value && (!Number.isInteger(value.colspan) || Number(value.colspan) < 1 || Number(value.colspan) > 50)) return false
  if ('rowspan' in value && (!Number.isInteger(value.rowspan) || Number(value.rowspan) < 1 || Number(value.rowspan) > 50)) return false
  if ('colwidth' in value && value.colwidth !== null && (!Array.isArray(value.colwidth) || !value.colwidth.every(Number.isFinite))) return false
  if ('align' in value && !['left', 'center', 'right', 'justify', null].includes(value.align as string | null)) return false
  if ('backgroundColor' in value && value.backgroundColor !== null && (typeof value.backgroundColor !== 'string' || !HEX_COLOR.test(value.backgroundColor))) return false
  if ('rowHeight' in value && value.rowHeight !== null && (!Number.isInteger(value.rowHeight) || Number(value.rowHeight) < 24 || Number(value.rowHeight) > 160)) return false
  return true
}

function validateMark(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string' || !MARK_TYPES.has(value.type)) return false
  if (value.attrs === undefined) return true
  if (!isRecord(value.attrs) || value.type !== 'textStyle') return false
  const allowed = new Set(['color', 'backgroundColor', 'fontFamily', 'fontSize'])
  if (!Object.keys(value.attrs).every((key) => allowed.has(key))) return false
  if ('color' in value.attrs && value.attrs.color !== null && (typeof value.attrs.color !== 'string' || !HEX_COLOR.test(value.attrs.color))) return false
  if ('backgroundColor' in value.attrs && value.attrs.backgroundColor !== null && (typeof value.attrs.backgroundColor !== 'string' || !HEX_COLOR.test(value.attrs.backgroundColor))) return false
  if ('fontFamily' in value.attrs && value.attrs.fontFamily !== null && (typeof value.attrs.fontFamily !== 'string' || !FONT_FAMILIES.has(value.attrs.fontFamily))) return false
  if ('fontSize' in value.attrs && value.attrs.fontSize !== null && (typeof value.attrs.fontSize !== 'string' || !FONT_SIZES.has(value.attrs.fontSize))) return false
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
