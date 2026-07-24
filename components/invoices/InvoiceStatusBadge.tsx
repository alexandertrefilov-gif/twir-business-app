// components/invoices/InvoiceStatusBadge.tsx
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@/types/enums'

interface InvoiceStatusBadgeProps {
  status: string
  size?:  'sm' | 'md'
}

const STYLES: Record<InvoiceStatus, string> = {
  DRAFT:          'bg-stone-100 text-stone-600 border-stone-200',
  FINALIZED:      'bg-blue-50 text-blue-700 border-blue-200',
  SENT:           'bg-sky-50 text-sky-700 border-sky-200',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID:           'bg-emerald-50 text-emerald-700 border-emerald-200',
  OVERDUE:        'bg-red-50 text-red-700 border-red-200',
  CANCELLED:      'bg-stone-100 text-stone-500 border-stone-200',
  CORRECTED:      'bg-stone-100 text-stone-500 border-stone-200',
}

const DOTS: Record<InvoiceStatus, string> = {
  DRAFT:          'bg-stone-400',
  FINALIZED:      'bg-blue-500',
  SENT:           'bg-sky-500',
  PARTIALLY_PAID: 'bg-amber-500',
  PAID:           'bg-emerald-500',
  OVERDUE:        'bg-red-500',
  CANCELLED:      'bg-stone-400',
  CORRECTED:      'bg-stone-400',
}

export function InvoiceStatusBadge({ status, size = 'md' }: InvoiceStatusBadgeProps) {
  const s     = status as InvoiceStatus
  const style = STYLES[s] ?? 'bg-stone-100 text-stone-500 border-stone-200'
  const dot   = DOTS[s]  ?? 'bg-stone-400'
  const label = INVOICE_STATUS_LABELS[s] ?? status

  return (
    <span className={`inline-flex items-center gap-1.5 border rounded font-mono font-500 ${
      size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
    } ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  )
}
