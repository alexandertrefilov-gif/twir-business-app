// components/offers/OfferStatusBadge.tsx
// Nutzt OFFER_STATUS_LABELS aus Phase 2 (types/enums.ts)

import { OFFER_STATUS_LABELS, type OfferStatus } from '@/types/enums'

interface OfferStatusBadgeProps {
  status: string
  size?:  'sm' | 'md'
}

const STYLES: Record<OfferStatus, string> = {
  DRAFT:              'bg-stone-100 text-stone-600 border-stone-200',
  SENT:               'bg-blue-50 text-blue-700 border-blue-200',
  ACCEPTED:           'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED:           'bg-red-50 text-red-600 border-red-200',
  EXPIRED:            'bg-amber-50 text-amber-700 border-amber-200',
  CONVERTED_TO_ORDER: 'bg-violet-50 text-violet-700 border-violet-200',
}

const DOTS: Record<OfferStatus, string> = {
  DRAFT:              'bg-stone-400',
  SENT:               'bg-blue-500',
  ACCEPTED:           'bg-emerald-500',
  REJECTED:           'bg-red-500',
  EXPIRED:            'bg-amber-500',
  CONVERTED_TO_ORDER: 'bg-violet-500',
}

export function OfferStatusBadge({ status, size = 'md' }: OfferStatusBadgeProps) {
  const s     = status as OfferStatus
  const style = STYLES[s] ?? 'bg-stone-100 text-stone-500 border-stone-200'
  const dot   = DOTS[s]  ?? 'bg-stone-400'
  const label = OFFER_STATUS_LABELS[s] ?? status

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
