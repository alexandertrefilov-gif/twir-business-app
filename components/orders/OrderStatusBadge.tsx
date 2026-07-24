// components/orders/OrderStatusBadge.tsx
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/types/enums'

interface OrderStatusBadgeProps {
  status: string
  size?:  'sm' | 'md'
}

const STYLES: Record<OrderStatus, string> = {
  OPEN:        'bg-sky-50 text-sky-700 border-sky-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  INVOICED:    'bg-violet-50 text-violet-700 border-violet-200',
  CANCELLED:   'bg-stone-100 text-stone-500 border-stone-200',
}

const DOTS: Record<OrderStatus, string> = {
  OPEN:        'bg-sky-500',
  IN_PROGRESS: 'bg-amber-500',
  COMPLETED:   'bg-emerald-500',
  INVOICED:    'bg-violet-500',
  CANCELLED:   'bg-stone-400',
}

export function OrderStatusBadge({ status, size = 'md' }: OrderStatusBadgeProps) {
  const s     = status as OrderStatus
  const style = STYLES[s] ?? 'bg-stone-100 text-stone-500 border-stone-200'
  const dot   = DOTS[s]  ?? 'bg-stone-400'
  const label = ORDER_STATUS_LABELS[s] ?? status

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 border rounded font-mono font-500
        ${size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'}
        ${style}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  )
}
