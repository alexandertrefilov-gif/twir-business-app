import React, { type ReactNode } from 'react'

interface DocumentSectionCardProps {
  children: ReactNode
  title?: ReactNode
  className?: string
  contentClassName?: string
  flush?: boolean
  actions?: ReactNode
}

export function DocumentSectionCard({
  children,
  title,
  className = '',
  contentClassName = 'p-5',
  flush = false,
  actions,
}: DocumentSectionCardProps) {
  return (
    <section data-document-section-card className={`card-base min-w-0 max-w-full overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-3">
          {title && <h2 className="text-sm font-600">{title}</h2>}
          {actions}
        </div>
      )}
      {flush ? children : <div className={contentClassName}>{children}</div>}
    </section>
  )
}
