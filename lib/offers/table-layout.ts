export interface TableLayoutCell {
  colspan?: number
  widths?: number[]
  text?: string
}

export type TableLayoutRow = TableLayoutCell[]

/**
 * Gemeinsames Spaltenraster fuer Word-Paste, Editor-Ausgabe, Vorschau und PDF.
 * Absolute Quellbreiten bleiben ein Signal, duerfen aber Textspalten nicht
 * unbrauchbar schmal machen.
 */
export function calculateTableColumnPercentages(rows: TableLayoutRow[]): number[] {
  const columnCount = Math.max(
    1,
    ...rows.map((row) => row.reduce((sum, cell) => sum + safeColspan(cell.colspan), 0)),
  )
  const explicitWidths = rows
    .map((row) => row.flatMap((cell) => validWidths(cell.widths, safeColspan(cell.colspan))))
    .find((widths) => widths.length === columnCount)
  const contentWeights = Array.from({ length: columnCount }, () => 1)

  for (const row of rows) {
    let offset = 0
    for (const cell of row) {
      const colspan = safeColspan(cell.colspan)
      const text = cell.text?.trim() ?? ''
      const longestWord = Math.max(1, ...text.split(/\s+/u).map((word) => word.length))
      const textWeight = Math.max(1, longestWord, Math.sqrt(text.length + 1) * 2)
      for (let column = offset; column < offset + colspan; column += 1) {
        contentWeights[column] = Math.max(contentWeights[column] ?? 1, textWeight / colspan)
      }
      offset += colspan
    }
  }

  if (!explicitWidths) return normalizeColumnWeights(contentWeights)

  const explicitTotal = explicitWidths.reduce((sum, width) => sum + width, 0)
  const contentTotal = contentWeights.reduce((sum, width) => sum + width, 0)
  const blendedWeights = explicitWidths.map((width, index) =>
    (width / explicitTotal) * 0.4 + ((contentWeights[index] ?? 1) / contentTotal) * 0.6)
  return normalizeColumnWeights(blendedWeights)
}

function validWidths(widths: number[] | undefined, colspan: number): number[] {
  return Array.isArray(widths) &&
    widths.length === colspan &&
    widths.every((width) => Number.isFinite(width) && width > 0)
    ? widths
    : []
}

function safeColspan(value?: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1
}

function normalizeColumnWeights(weights: number[]): number[] {
  const safeWeights = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 1)
  const minimum = Math.min(15, 60 / safeWeights.length)
  const percentages = Array.from({ length: safeWeights.length }, () => 0)
  const open = new Set(safeWeights.map((_, index) => index))
  let remaining = 100

  while (open.size > 0) {
    const openWeight = [...open].reduce((sum, index) => sum + safeWeights[index], 0)
    const tooSmall = [...open].filter((index) =>
      (safeWeights[index] / openWeight) * remaining < minimum)
    if (tooSmall.length === 0) {
      for (const index of open) {
        percentages[index] = (safeWeights[index] / openWeight) * remaining
      }
      break
    }
    for (const index of tooSmall) {
      percentages[index] = minimum
      remaining -= minimum
      open.delete(index)
    }
  }

  const rounded = percentages.map((percentage) => Math.round(percentage * 100) / 100)
  rounded[rounded.length - 1] += Math.round(
    (100 - rounded.reduce((sum, percentage) => sum + percentage, 0)) * 100,
  ) / 100
  return rounded
}
