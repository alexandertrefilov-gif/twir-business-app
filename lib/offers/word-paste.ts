const FONT_SIZES = [10, 11, 12, 14, 16, 18] as const

export function normalizeWordFontFamily(value: string): string | null {
  const first = value.split(',')[0]?.replace(/["']/g, '').trim().toLowerCase()
  if (!first) return null
  if (first.includes('times') || first.includes('georgia')) return 'Times New Roman'
  if (first.includes('courier') || first.includes('consolas')) return 'Courier New'
  if (first.includes('helvetica')) return 'Helvetica'
  return 'Arial'
}

export function normalizeWordFontSize(value: string): string | null {
  const numeric = Number.parseFloat(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  const points = value.toLowerCase().includes('px') ? numeric * 0.75 : numeric
  const nearest = FONT_SIZES.reduce((best, size) =>
    Math.abs(size - points) <= Math.abs(best - points) ? size : best)
  return `${nearest}pt`
}

export function normalizeWordColor(value: string): string | null {
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed.slice(1).split('').map((part) => part + part).join('')}`.toLowerCase()
  }
  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!rgb) return null
  const channels = rgb.slice(1, 4).map((channel) =>
    Math.min(255, Number(channel)).toString(16).padStart(2, '0'))
  return `#${channels.join('')}`
}

export function normalizeWordHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const document = new DOMParser().parseFromString(html, 'text/html')

  document.querySelectorAll(
    'script, style, meta, link, iframe, object, embed, form, input, button',
  ).forEach((element) => element.remove())

  document.querySelectorAll<HTMLTableElement>('table').forEach(normalizeWordTable)

  document.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const sourceStyle = element.style
    const styles: string[] = []

    const fontFamily = normalizeWordFontFamily(sourceStyle.fontFamily)
    if (fontFamily) styles.push(`font-family: ${fontFamily}`)

    const fontSize = normalizeWordFontSize(sourceStyle.fontSize)
    if (fontSize) styles.push(`font-size: ${fontSize}`)

    const color = normalizeWordColor(sourceStyle.color)
    if (color) styles.push(`color: ${color}`)

    const backgroundColor = normalizeWordColor(sourceStyle.backgroundColor)
    if (backgroundColor) styles.push(`background-color: ${backgroundColor}`)

    if (['left', 'center', 'right', 'justify'].includes(sourceStyle.textAlign)) {
      styles.push(`text-align: ${sourceStyle.textAlign}`)
    }
    if (sourceStyle.fontWeight === 'bold' || Number(sourceStyle.fontWeight) >= 600) {
      styles.push('font-weight: bold')
    }
    if (sourceStyle.fontStyle === 'italic') styles.push('font-style: italic')
    if (sourceStyle.textDecorationLine.includes('underline')) {
      styles.push('text-decoration: underline')
    }
    if (sourceStyle.textDecorationLine.includes('line-through')) {
      styles.push('text-decoration: line-through')
    }

    if (element instanceof HTMLTableCellElement) {
      const width = sourceStyle.width || element.getAttribute('width')
      if (width && !width.includes('%')) styles.push(`width: ${width}`)
    }
    if (element instanceof HTMLTableElement) {
      styles.push('width: 100%', 'max-width: 100%', 'table-layout: fixed')
    }
    if (element instanceof HTMLTableColElement) {
      const width = sourceStyle.width || element.getAttribute('width')
      if (width && !width.includes('%')) styles.push(`width: ${width}`)
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (
        name === 'colspan' ||
        name === 'rowspan' ||
        name === 'colwidth' ||
        name === 'width'
      ) continue
      element.removeAttribute(attribute.name)
    }
    if (styles.length > 0) element.setAttribute('style', styles.join('; '))
  })

  return document.body.innerHTML
}

function normalizeWordTable(table: HTMLTableElement) {
  const rows = Array.from(table.rows).map((row) => Array.from(row.cells).map((cell, index) => {
    const colspan = Math.max(1, cell.colSpan || 1)
    const column = table.querySelectorAll<HTMLElement>('colgroup > col')[index]
    const rawWidth = cell.style.width || cell.getAttribute('width') ||
      column?.style.width || column?.getAttribute('width')
    const parsed = parseWordAbsoluteWidth(rawWidth)
    return {
      colspan,
      widths: parsed ? Array.from({ length: colspan }, () => parsed / colspan) : undefined,
      text: cell.textContent ?? '',
    }
  }))
  const percentages = calculateTableColumnPercentages(rows)

  for (const row of Array.from(table.rows)) {
    let offset = 0
    for (const cell of Array.from(row.cells)) {
      const colspan = Math.max(1, cell.colSpan || 1)
      const widths = percentages
        .slice(offset, offset + colspan)
        .map((percentage) => Math.round(percentage * 10))
      cell.setAttribute('colwidth', widths.join(','))
      cell.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`
      cell.removeAttribute('width')
      offset += colspan
    }
  }
  table.querySelectorAll('colgroup').forEach((colgroup) => colgroup.remove())
}

function parseWordAbsoluteWidth(rawWidth?: string | null): number | null {
  if (!rawWidth || rawWidth.includes('%')) return null
  const value = Number.parseFloat(rawWidth)
  if (!Number.isFinite(value) || value <= 0) return null
  return rawWidth.toLowerCase().includes('pt') ? value * 4 / 3 : value
}
import { calculateTableColumnPercentages } from '@/lib/offers/table-layout'
