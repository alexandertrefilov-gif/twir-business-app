import {
  AlignmentType, BorderStyle, Document, HeightRule, ImageRun, LevelFormat, Packer, PageOrientation,
  Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun,
  UnderlineType, VerticalAlign, WidthType, type ParagraphChild,
} from 'docx'
import {
  decodeOfferText, getTableColumnPercentages, OFFER_RICH_TEXT_PREFIX, type RichTextNode,
} from '@/lib/offers/rich-text'
import { getCompanyLogoDimensions } from '@/lib/pdf-templates/company-logo'

type PdfLikeData = Record<string, unknown>
type DocxBlock = Paragraph | Table

const A4_WIDTH_DXA = 11_906
const A4_HEIGHT_DXA = 16_838
const PAGE_MARGIN_DXA = 1_134
const CONTENT_WIDTH_DXA = A4_WIDTH_DXA - PAGE_MARGIN_DXA * 2
const BODY_FONT = 'Arial'
const BODY_SIZE = 22
const BODY_COLOR = '1A1917'
const MUTED_COLOR = '666666'
const ACCENT_COLOR = '1E3A5F'
const POSITION_HEADER_FILL = 'F5F4F1'
const RICH_TABLE_HEADER_FILL = 'F0F3F6'
const TABLE_BORDER_COLOR = 'D8D6D0'
const RICH_TABLE_BORDER_COLOR = '68645D'
const BULLET_REFERENCE = 'twir-offer-bullets'
const ORDERED_REFERENCE = 'twir-offer-numbering'

const str = (value: unknown) => typeof value === 'string' ? value : ''
const htmlToText = (value: unknown) => str(value)
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
const money = (value: unknown) => typeof value === 'number'
  ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
  : ''
const amount = (value: unknown) => typeof value === 'number'
  ? new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  : ''
const quantity = (value: unknown) => typeof value === 'number'
  ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(value)
  : str(value)

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
} as const

const gridBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: TABLE_BORDER_COLOR },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR },
  left: { style: BorderStyle.NONE, size: 0, color: TABLE_BORDER_COLOR },
  right: { style: BorderStyle.NONE, size: 0, color: TABLE_BORDER_COLOR },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: TABLE_BORDER_COLOR },
} as const

const richGridBorders = {
  top: { style: BorderStyle.SINGLE, size: 8, color: RICH_TABLE_BORDER_COLOR },
  bottom: { style: BorderStyle.SINGLE, size: 8, color: RICH_TABLE_BORDER_COLOR },
  left: { style: BorderStyle.SINGLE, size: 8, color: RICH_TABLE_BORDER_COLOR },
  right: { style: BorderStyle.SINGLE, size: 8, color: RICH_TABLE_BORDER_COLOR },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: RICH_TABLE_BORDER_COLOR },
  insideVertical: { style: BorderStyle.SINGLE, size: 8, color: RICH_TABLE_BORDER_COLOR },
} as const

export async function renderBusinessDocumentDocx(
  data: PdfLikeData,
  documentLabel: string,
): Promise<Buffer> {
  const company = (data.company ?? {}) as PdfLikeData
  const customer = (data.customer ?? {}) as PdfLikeData
  const items = Array.isArray(data.items) ? data.items as PdfLikeData[] : []
  const documentNumber = str(data.offerNumber || data.orderNumber || data.reportNumber || data.invoiceNumber)
  const date = str(data.offerDate || data.orderDate || data.reportDate || data.invoiceDate)
  const children: DocxBlock[] = [
    ...businessHeader(data, company, customer, documentLabel, documentNumber, date),
  ]

  const title = str(data.title).trim()
  if (title) {
    children.push(new Paragraph({
      style: 'OfferSubject', keepNext: true,
      children: [new TextRun({ text: title, bold: true })],
    }))
  }
  children.push(...richTextValueToDocx(data.introText))
  const description = htmlToText(data.description)
  if (description) children.push(...description.split('\n').map((line) => bodyParagraph(line)))
  if (items.length > 0) children.push(positionTable(items))
  children.push(...totalsBlocks(data))
  children.push(...richTextValueToDocx(data.outroText))

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: BODY_SIZE, color: BODY_COLOR },
          paragraph: { spacing: { after: 120, line: 276 } },
        },
      },
      paragraphStyles: [
        {
          id: 'OfferSubject', name: 'Angebotsbetreff', basedOn: 'Normal',
          next: 'Normal', quickFormat: true,
          run: { font: BODY_FONT, size: 26, bold: true, color: BODY_COLOR },
          paragraph: { spacing: { before: 280, after: 180 }, keepNext: true },
        },
        {
          id: 'OfferHeading1', name: 'Angebot Überschrift 1', basedOn: 'Normal',
          next: 'Normal', quickFormat: true,
          run: { font: BODY_FONT, size: 28, bold: true, color: ACCENT_COLOR },
          paragraph: { spacing: { before: 260, after: 120 }, keepNext: true, keepLines: true },
        },
        {
          id: 'OfferHeading2', name: 'Angebot Überschrift 2', basedOn: 'Normal',
          next: 'Normal', quickFormat: true,
          run: { font: BODY_FONT, size: 24, bold: true, color: ACCENT_COLOR },
          paragraph: { spacing: { before: 220, after: 100 }, keepNext: true, keepLines: true },
        },
        {
          id: 'OfferHeading3', name: 'Angebot Überschrift 3', basedOn: 'Normal',
          next: 'Normal', quickFormat: true,
          run: { font: BODY_FONT, size: BODY_SIZE, bold: true, color: ACCENT_COLOR },
          paragraph: { spacing: { before: 180, after: 80 }, keepNext: true, keepLines: true },
        },
      ],
    },
    numbering: {
      config: [
        { reference: BULLET_REFERENCE, levels: numberingLevels(LevelFormat.BULLET, '•') },
        { reference: ORDERED_REFERENCE, levels: numberingLevels(LevelFormat.DECIMAL, '%1.') },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: A4_WIDTH_DXA, height: A4_HEIGHT_DXA, orientation: PageOrientation.PORTRAIT },
          margin: { top: PAGE_MARGIN_DXA, right: PAGE_MARGIN_DXA, bottom: PAGE_MARGIN_DXA, left: PAGE_MARGIN_DXA },
        },
      },
      children,
    }],
  })
  return Buffer.from(await Packer.toBuffer(document))
}

function numberingLevels(format: (typeof LevelFormat)[keyof typeof LevelFormat], marker: string) {
  return Array.from({ length: 6 }, (_, level) => ({
    level, format, text: format === LevelFormat.DECIMAL ? `%${level + 1}.` : marker,
    alignment: AlignmentType.LEFT,
    style: {
      run: { font: BODY_FONT, size: BODY_SIZE },
      paragraph: {
        indent: { left: 720 + level * 360, hanging: 360 },
        spacing: { after: 80, line: 276 },
      },
    },
  }))
}

function businessHeader(
  data: PdfLikeData, company: PdfLikeData, customer: PdfLikeData, documentLabel: string,
  documentNumber: string, date: string,
): DocxBlock[] {
  const companyName = [str(company.companyName), str(company.legalForm)].filter(Boolean).join(' ').trim()
  const companyAddress = [
    [company.street, company.houseNumber].filter(Boolean).join(' '),
    [company.postalCode, company.city].filter(Boolean).join(' '),
  ].map(str).filter(Boolean)
  const contactName = [
    customer.contactSalutation, customer.contactFirstName, customer.contactLastName,
  ].map(str).filter(Boolean).join(' ')
  const recipient = [
    contactName, str(customer.contactDepartment), str(customer.name),
    [customer.street, customer.houseNumber].filter(Boolean).join(' '),
    [customer.postalCode, customer.city].filter(Boolean).join(' '),
  ].map(str).filter(Boolean)
  const leftWidth = Math.round(CONTENT_WIDTH_DXA * 0.55)
  const rightWidth = CONTENT_WIDTH_DXA - leftWidth
  const logo = companyLogoRun(data, rightWidth)
  const companyLines = [...(!logo && companyName ? [companyName] : []), ...companyAddress]

  return [
    new Table({
      width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
      columnWidths: [leftWidth, rightWidth], layout: TableLayoutType.FIXED,
      borders: noBorders, margins: { top: 40, bottom: 40, left: 0, right: 0 },
      rows: [new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: leftWidth, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
            borders: noBorders, margins: { top: 40, bottom: 60, left: 0, right: 180 },
            children: recipient.length > 0
              ? recipient.map((line) => new Paragraph({
                  spacing: { after: 0, line: 276 },
                  children: [new TextRun({ text: line, font: BODY_FONT, size: BODY_SIZE })],
                }))
              : [new Paragraph('')],
          }),
          new TableCell({
            width: { size: rightWidth, type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP,
            borders: noBorders, margins: { top: 0, bottom: 60, left: 180, right: 0 },
            children: [
              ...(logo ? [new Paragraph({
                alignment: AlignmentType.RIGHT, spacing: { after: 60, line: 240 }, children: [logo],
              })] : []),
              ...companyLines.map((line, index) => new Paragraph({
                alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 230 },
                children: [new TextRun({
                  text: line, font: BODY_FONT, size: 18, color: MUTED_COLOR,
                  bold: !logo && index === 0,
                })],
              })),
              new Paragraph({
                alignment: AlignmentType.RIGHT, spacing: { before: 100, after: 40, line: 260 },
                children: [new TextRun({
                  text: `${documentLabel} ${documentNumber}`.trim(),
                  bold: true, size: 26, color: ACCENT_COLOR, font: BODY_FONT,
                })],
              }),
              ...(date ? [new Paragraph({
                alignment: AlignmentType.RIGHT, spacing: { after: 0 },
                children: [new TextRun({ text: `Datum: ${date}`, font: BODY_FONT, size: BODY_SIZE })],
              })] : []),
            ],
          }),
        ],
      })],
    }),
  ]
}

function companyLogoRun(data: PdfLikeData, columnWidthDxa: number): ImageRun | null {
  const match = /^data:image\/(png|jpe?g);base64,([a-z0-9+/=]+)$/i.exec(str(data.logoDataUri))
  if (!match) return null
  try {
    const dimensions = getCompanyLogoDimensions(
      typeof data.logoScale === 'number' ? data.logoScale : undefined,
      typeof data.logoSourceWidth === 'number' ? data.logoSourceWidth : undefined,
      typeof data.logoSourceHeight === 'number' ? data.logoSourceHeight : undefined,
    )
    const maximumWidthPixels = Math.max(1, Math.floor((columnWidthDxa - 360) / 15))
    const requestedWidthPixels = dimensions.width * 96 / 72
    const factor = Math.min(1, maximumWidthPixels / requestedWidthPixels)
    return new ImageRun({
      type: match[1].toLowerCase() === 'png' ? 'png' : 'jpg',
      data: Buffer.from(match[2], 'base64'),
      transformation: {
        width: Math.max(1, Math.round(requestedWidthPixels * factor)),
        height: Math.max(1, Math.round(dimensions.height * 96 / 72 * factor)),
      },
      altText: {
        title: 'Firmenlogo', description: str(((data.company ?? {}) as PdfLikeData).companyName) || 'Firmenlogo',
        name: 'Firmenlogo',
      },
    })
  } catch {
    return null
  }
}

function bodyParagraph(text = '', options?: {
  children?: ParagraphChild[]
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
  keepNext?: boolean
}): Paragraph {
  return new Paragraph({
    alignment: options?.alignment, keepNext: options?.keepNext,
    spacing: { after: 120, line: 276 },
    children: options?.children ?? [new TextRun(text)],
  })
}

function richTextValueToDocx(value: unknown): DocxBlock[] {
  if (typeof value !== 'string' || value.length === 0) return []
  const normalizedValue = value.startsWith(OFFER_RICH_TEXT_PREFIX) ? value : htmlToText(value)
  const document = decodeOfferText(normalizedValue)
  return document.sections.flatMap((section) => {
    const blocks: DocxBlock[] = []
    if (section.title.trim()) {
      blocks.push(new Paragraph({
        style: 'OfferHeading2', keepNext: true,
        children: [new TextRun({ text: section.title.trim(), bold: true })],
      }))
    }
    blocks.push(...richBlocks(section.content, 0))
    return blocks
  })
}

function richBlocks(node: RichTextNode, listLevel: number): DocxBlock[] {
  switch (node.type) {
    case 'doc': return (node.content ?? []).flatMap((child) => richBlocks(child, listLevel))
    case 'paragraph': return [richParagraph(node)]
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2)))
      return [new Paragraph({
        style: `OfferHeading${level}`, alignment: docxAlignment(node.attrs?.textAlign),
        keepNext: true, keepLines: true, children: inlineRuns(node.content ?? []),
      })]
    }
    case 'bulletList': return listBlocks(node, BULLET_REFERENCE, listLevel)
    case 'orderedList': return listBlocks(node, ORDERED_REFERENCE, listLevel)
    case 'table': return [richTable(node)]
    case 'blockquote':
      return [new Paragraph({
        indent: { left: 360 }, spacing: { after: 120, line: 276 },
        children: inlineRuns(node.content ?? []),
      })]
    case 'codeBlock':
      return [new Paragraph({
        spacing: { after: 120, line: 240 },
        shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
        children: inlineRuns(node.content ?? [], { font: 'Courier New' }),
      })]
    case 'horizontalRule':
      return [new Paragraph({
        spacing: { before: 80, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR } },
      })]
    default:
      // Kontrollierter Fallback: Kindinhalte bleiben lesbar; Typname, Attribute
      // und serialisierte JSON-Daten werden niemals ausgegeben.
      return (node.content ?? []).flatMap((child) => richBlocks(child, listLevel))
  }
}

function richParagraph(node: RichTextNode): Paragraph {
  return new Paragraph({
    alignment: docxAlignment(node.attrs?.textAlign),
    spacing: { after: 120, line: 276 }, children: inlineRuns(node.content ?? []),
  })
}

function listBlocks(node: RichTextNode, reference: string, listLevel: number): DocxBlock[] {
  const level = Math.min(5, listLevel)
  return (node.content ?? []).flatMap((item) => {
    if (item.type !== 'listItem') return richBlocks(item, listLevel + 1)
    return (item.content ?? []).flatMap((child): DocxBlock[] => {
      if (child.type === 'paragraph') {
        return [new Paragraph({
          numbering: { reference, level }, spacing: { after: 80, line: 276 },
          children: inlineRuns(child.content ?? []),
        })]
      }
      if (child.type === 'bulletList') return listBlocks(child, BULLET_REFERENCE, listLevel + 1)
      if (child.type === 'orderedList') return listBlocks(child, ORDERED_REFERENCE, listLevel + 1)
      return richBlocks(child, listLevel + 1)
    })
  })
}

function inlineRuns(nodes: RichTextNode[], overrides: { font?: string } = {}): ParagraphChild[] {
  return nodes.flatMap((node): ParagraphChild[] => {
    if (node.type === 'text') return [textRun(node, overrides)]
    if (node.type === 'hardBreak') return [new TextRun({ break: 1 })]
    if (node.content) return inlineRuns(node.content, overrides)
    return []
  })
}

function textRun(node: RichTextNode, overrides: { font?: string }): TextRun {
  const marks = node.marks ?? []
  const types = new Set(marks.map((mark) => mark.type))
  const attrs = marks.find((mark) => mark.type === 'textStyle')?.attrs ?? {}
  const background = safeHex(attrs.backgroundColor)
  return new TextRun({
    text: node.text ?? '', bold: types.has('bold'), italics: types.has('italic'),
    strike: types.has('strike'),
    underline: types.has('underline') ? { type: UnderlineType.SINGLE } : undefined,
    font: overrides.font ?? safeFont(attrs.fontFamily), size: docxFontSize(attrs.fontSize),
    color: safeHex(attrs.color),
    shading: background ? { type: ShadingType.CLEAR, fill: background } : undefined,
  })
}

function safeFont(value: unknown): string {
  return typeof value === 'string' &&
    ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New'].includes(value)
    ? value : BODY_FONT
}

function safeHex(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.slice(1).toUpperCase() : undefined
}

function docxFontSize(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(value)
  if (!match) return undefined
  const numeric = Number(match[1])
  const points = match[2] === 'px' ? numeric * 0.75 : numeric
  return Math.round(Math.min(18, Math.max(8, points)) * 2)
}

function docxAlignment(value: unknown) {
  if (value === 'center') return AlignmentType.CENTER
  if (value === 'right') return AlignmentType.RIGHT
  if (value === 'justify') return AlignmentType.JUSTIFIED
  return AlignmentType.LEFT
}

function richTable(node: RichTextNode): Table {
  const percentages = getTableColumnPercentages(node)
  const columnWidths = percentages.map((percentage) => Math.round(CONTENT_WIDTH_DXA * percentage / 100))
  const widthDifference = CONTENT_WIDTH_DXA - columnWidths.reduce((sum, width) => sum + width, 0)
  if (columnWidths.length > 0) columnWidths[columnWidths.length - 1] += widthDifference
  const rows = (node.content ?? []).map((row) => {
    let columnOffset = 0
    const isHeader = (row.content?.length ?? 0) > 0 &&
      (row.content ?? []).every((cell) => cell.type === 'tableHeader')
    const cells = (row.content ?? []).map((cell) => {
      const colspan = positiveInteger(cell.attrs?.colspan)
      const rowspan = positiveInteger(cell.attrs?.rowspan)
      const cellWidth = columnWidths.slice(columnOffset, columnOffset + colspan)
        .reduce((sum, width) => sum + width, 0)
      columnOffset += colspan
      const blocks = (cell.content ?? []).flatMap((child) => {
        if (child.type !== 'paragraph') return richBlocks(child, 0)
        return [new Paragraph({
          alignment: docxAlignment(child.attrs?.textAlign ?? cell.attrs?.align),
          spacing: { after: 80, line: 276 },
          children: inlineRuns(child.content ?? []),
        })]
      })
      const background = safeHex(cell.attrs?.backgroundColor)
      return new TableCell({
        width: {
          size: cellWidth || Math.floor(CONTENT_WIDTH_DXA / Math.max(1, percentages.length)),
          type: WidthType.DXA,
        },
        columnSpan: colspan > 1 ? colspan : undefined,
        rowSpan: rowspan > 1 ? rowspan : undefined,
        verticalAlign: VerticalAlign.CENTER,
        shading: background || isHeader
          ? { type: ShadingType.CLEAR, fill: background ?? RICH_TABLE_HEADER_FILL } : undefined,
        margins: { top: 90, bottom: 90, left: 110, right: 110 },
        children: blocks.length > 0 ? blocks : [new Paragraph('')],
      })
    })
    const rowHeight = Math.max(
      0,
      ...(row.content ?? []).map((cell) => Number(cell.attrs?.rowHeight ?? 0)),
    )
    return new TableRow({
      children: cells, tableHeader: isHeader, cantSplit: true,
      height: rowHeight > 0
        ? { value: Math.round(Math.min(160, Math.max(24, rowHeight)) * 15), rule: HeightRule.ATLEAST }
        : undefined,
    })
  })
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA }, columnWidths,
    layout: TableLayoutType.FIXED, borders: richGridBorders,
    margins: { top: 90, bottom: 90, left: 110, right: 110 }, rows,
  })
}

function positiveInteger(value: unknown): number {
  const parsed = Number(value ?? 1)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function positionTable(items: PdfLikeData[]): Table {
  const widths = proportionalWidths([5, 29, 9, 8, 14, 9, 13, 13])
  const header = ['#', 'BESCHREIBUNG', 'MENGE', 'EINH.', 'EINZELPREIS', 'MWST.', 'NETTO', 'BRUTTO']
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA }, columnWidths: widths,
    layout: TableLayoutType.FIXED, borders: gridBorders,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: header.map((label, index) => tableCell(label, widths[index], {
          bold: true, fill: POSITION_HEADER_FILL, header: true,
          alignment: index === 0 || index === 3
            ? AlignmentType.CENTER
            : index >= 2 ? AlignmentType.RIGHT : AlignmentType.LEFT,
        })),
      }),
      ...items.map((item) => new TableRow({
        cantSplit: true,
        children: [
          tableCell(quantity(item.position), widths[0], { alignment: AlignmentType.CENTER }),
          tableCell(htmlToText(item.description), widths[1], { bold: true, notes: htmlToText(item.notes) }),
          tableCell(quantity(item.quantity), widths[2], { alignment: AlignmentType.RIGHT }),
          tableCell(str(item.unit), widths[3], { alignment: AlignmentType.CENTER }),
          tableCell(amount(item.unitPrice), widths[4], { alignment: AlignmentType.RIGHT }),
          tableCell(`${quantity(item.taxRate)} %`, widths[5], { alignment: AlignmentType.RIGHT }),
          tableCell(amount(item.netAmount), widths[6], { alignment: AlignmentType.RIGHT }),
          tableCell(amount(item.grossAmount), widths[7], { alignment: AlignmentType.RIGHT, bold: true }),
        ],
      })),
    ],
  })
}

function proportionalWidths(percentages: number[]): number[] {
  const widths = percentages.map((percentage) => Math.round(CONTENT_WIDTH_DXA * percentage / 100))
  if (widths.length > 0) {
    widths[widths.length - 1] += CONTENT_WIDTH_DXA - widths.reduce((sum, width) => sum + width, 0)
  }
  return widths
}

function tableCell(text: string, width: number, options: {
  bold?: boolean
  fill?: string
  header?: boolean
  notes?: string
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
} = {}): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
    margins: { top: 80, bottom: 80, left: 90, right: 90 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: options.alignment, keepLines: true, keepNext: options.header,
        spacing: { after: options.notes ? 30 : 0, line: 220 },
        children: [new TextRun({
          text, bold: options.bold, size: options.header ? 16 : 18,
          font: BODY_FONT, color: options.header ? MUTED_COLOR : BODY_COLOR,
        })],
      }),
      ...(options.notes ? [new Paragraph({
        spacing: { after: 0, line: 200 },
        children: [new TextRun({ text: options.notes, font: BODY_FONT, size: 16, color: MUTED_COLOR })],
      })] : []),
    ],
  })
}

function totalsBlocks(data: PdfLikeData): DocxBlock[] {
  const totals: Array<{ label: string; value: number; emphasized?: boolean; muted?: boolean }> = []
  if (typeof data.totalNet === 'number') totals.push({ label: 'Nettobetrag', value: data.totalNet })
  const taxGroups = data.taxGroups && typeof data.taxGroups === 'object'
    ? Object.entries(data.taxGroups as Record<string, unknown>)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
        .sort(([left], [right]) => Number(right) - Number(left))
    : []
  if (taxGroups.length > 0) {
    totals.push(...taxGroups.map(([rate, value]) => ({
      label: `zzgl. ${rate}% MwSt.`, value, muted: true,
    })))
  } else if (typeof data.totalTax === 'number') {
    totals.push({ label: 'MwSt.', value: data.totalTax, muted: true })
  }
  if (typeof data.totalGross === 'number') {
    totals.push({ label: 'Gesamtbetrag brutto', value: data.totalGross, emphasized: true })
  }
  if (totals.length === 0) return []
  const labelWidth = 2_800
  const valueWidth = 1_900
  const spacerWidth = CONTENT_WIDTH_DXA - labelWidth - valueWidth
  return [new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [spacerWidth, labelWidth, valueWidth], layout: TableLayoutType.FIXED,
    borders: noBorders, margins: { top: 40, bottom: 40, left: 80, right: 0 },
    rows: totals.map(({ label, value, emphasized, muted }, index) => new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          borders: noBorders, width: { size: spacerWidth, type: WidthType.DXA },
          children: [new Paragraph({ spacing: { after: 0 }, children: [] })],
        }),
        new TableCell({
          borders: totalCellBorders(emphasized), width: { size: labelWidth, type: WidthType.DXA },
          margins: { top: 40, bottom: 40, left: 0, right: 120 },
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: index === 0 ? 180 : emphasized ? 70 : 0, after: 0, line: 260 },
            children: [new TextRun({
              text: label, bold: emphasized, font: BODY_FONT, size: BODY_SIZE,
              color: muted ? MUTED_COLOR : BODY_COLOR,
            })],
          })],
        }),
        new TableCell({
          borders: totalCellBorders(emphasized), width: { size: valueWidth, type: WidthType.DXA },
          margins: { top: 40, bottom: 40, left: 120, right: 0 },
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: index === 0 ? 180 : emphasized ? 70 : 0, after: 0, line: 260 },
            children: [new TextRun({ text: money(value), bold: emphasized, font: BODY_FONT, size: BODY_SIZE })],
          })],
        }),
      ],
    })),
  })]
}

function totalCellBorders(emphasized?: boolean) {
  return emphasized
    ? { ...noBorders, top: { style: BorderStyle.SINGLE, size: 4, color: 'C0BDB8' } }
    : noBorders
}
