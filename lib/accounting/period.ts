export type AccountingPeriodPreset = 'month' | 'quarter' | 'year' | 'custom'

export interface AccountingPeriod {
  preset: AccountingPeriodPreset
  from: Date
  toExclusive: Date
  fromInput: string
  toInput: string
  label: string
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function parseLocalDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? parsed
    : null
}

function inputDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function resolveAccountingPeriod(
  query: { period?: string; from?: string; to?: string },
  now = new Date(),
): AccountingPeriod {
  const requested = query.period
  const preset: AccountingPeriodPreset = requested === 'quarter' || requested === 'year' || requested === 'custom'
    ? requested
    : 'month'
  const today = startOfLocalDay(now)
  let from: Date
  let toInclusive: Date

  if (preset === 'custom') {
    from = parseLocalDate(query.from) ?? new Date(today.getFullYear(), today.getMonth(), 1)
    toInclusive = parseLocalDate(query.to) ?? today
    if (toInclusive < from) [from, toInclusive] = [toInclusive, from]
  } else if (preset === 'quarter') {
    const quarterMonth = Math.floor(today.getMonth() / 3) * 3
    from = new Date(today.getFullYear(), quarterMonth, 1)
    toInclusive = new Date(today.getFullYear(), quarterMonth + 3, 0)
  } else if (preset === 'year') {
    from = new Date(today.getFullYear(), 0, 1)
    toInclusive = new Date(today.getFullYear(), 11, 31)
  } else {
    from = new Date(today.getFullYear(), today.getMonth(), 1)
    toInclusive = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  }

  return {
    preset,
    from,
    toExclusive: addDays(toInclusive, 1),
    fromInput: inputDate(from),
    toInput: inputDate(toInclusive),
    label: `${from.toLocaleDateString('de-DE')} – ${toInclusive.toLocaleDateString('de-DE')}`,
  }
}
