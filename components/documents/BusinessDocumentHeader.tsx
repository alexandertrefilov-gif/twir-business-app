import type { ReactNode } from 'react'
import { StickyDocumentPageHeader } from '@/components/documents/StickyDocumentPageHeader'

interface BusinessDocumentHeaderProps {
  title: string
  description?: string | null
  titleId: string
  detailsLabel: string
  children: ReactNode
}

export function BusinessDocumentHeader({
  title,
  description,
  titleId,
  detailsLabel,
  children,
}: BusinessDocumentHeaderProps) {
  return (
    <StickyDocumentPageHeader>
      <header className="border-b border-stone-200 bg-white px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
        <section className="card-base p-5 lg:col-span-3" aria-labelledby={titleId}>
          <h1 id={titleId} className="text-lg font-600 leading-tight text-foreground">{title}</h1>
          {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        </section>

        <section className="card-base p-5 lg:col-span-9" aria-label={detailsLabel}>
          {children}
        </section>
        </div>
      </header>
    </StickyDocumentPageHeader>
  )
}
