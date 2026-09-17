import type { AccountingPeriod } from '@/lib/accounting/period'

export function AccountingPeriodFilter({ period }: { period: AccountingPeriod }) {
  return (
    <form className="card-base flex flex-wrap items-end gap-3 p-4">
      <label className="grid gap-1 text-xs font-500 text-stone-700">
        Zeitraum
        <select name="period" defaultValue={period.preset} className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm">
          <option value="month">Aktueller Monat</option>
          <option value="quarter">Aktuelles Quartal</option>
          <option value="year">Aktuelles Jahr</option>
          <option value="custom">Benutzerdefiniert</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-500 text-stone-700">
        Von
        <input type="date" name="from" defaultValue={period.fromInput} className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm" />
      </label>
      <label className="grid gap-1 text-xs font-500 text-stone-700">
        Bis
        <input type="date" name="to" defaultValue={period.toInput} className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm" />
      </label>
      <button type="submit" className="btn-primary h-9">Anwenden</button>
      <span className="pb-2 text-xs text-muted-foreground">{period.label}</span>
    </form>
  )
}
