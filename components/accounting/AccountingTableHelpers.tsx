import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@/types/enums'
import { formatCalendarDateCompact } from '@/lib/utils/berlin-date'

export const formatCurrency = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
export const formatDate = (value: Date | null) => value ? formatCalendarDateCompact(value) : '–'
export const invoiceStatusLabel = (status: string) => INVOICE_STATUS_LABELS[status as InvoiceStatus] ?? status

export function ReconciliationWarning() {
  return <span className="ml-1 text-amber-700" title="Gespeicherter Zahlungsstand weicht von den Zahlungsdatensätzen ab">⚠</span>
}
