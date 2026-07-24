// components/shared/EmptyState.tsx
import Link from 'next/link'

interface EmptyStateProps {
  title:       string
  description: string
  actionLabel?: string
  actionHref?:  string
  icon?:        React.ReactNode
}

export function EmptyState({ title, description, actionLabel, actionHref, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center mb-4 text-stone-400">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-600 text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-700 text-white text-xs font-500 hover:bg-blue-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
