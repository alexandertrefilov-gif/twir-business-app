// components/shared/PageHeader.tsx
import React from 'react'
import Link from 'next/link'
import { StickyDocumentPageHeader } from '@/components/documents/StickyDocumentPageHeader'

interface Breadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title:        string
  description?: string
  breadcrumbs?: Breadcrumb[]
  actions?:     React.ReactNode
  badges?:      React.ReactNode
  aside?:       React.ReactNode
  supplierNumber?: string | null
  documentType?: string
  sticky?: boolean
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  badges,
  aside,
  supplierNumber,
  documentType,
  sticky = false,
}: PageHeaderProps) {
  const content = (
    <div className={`gap-4 border-b border-stone-200 bg-white px-4 py-4 sm:px-6 ${aside
      ? 'grid grid-cols-1 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)] lg:items-start'
      : 'flex flex-col lg:flex-row lg:items-start lg:justify-between'
    }`}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground">
            {breadcrumbs.map((bc, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-stone-300">/</span>}
                {bc.href ? (
                  <Link href={bc.href} className="hover:text-foreground transition-colors">
                    {bc.label}
                  </Link>
                ) : (
                  <span className="text-foreground">{bc.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-lg font-600 text-foreground leading-tight">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
        {documentType && (
          <p className="mt-2 text-sm font-400 text-foreground">{documentType}</p>
        )}
        {badges && <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div>}
      </div>
      {(aside || actions || supplierNumber) && (
        <div className={`flex w-full min-w-0 flex-col gap-1.5 ${aside ? '' : 'lg:w-auto lg:max-w-[520px] lg:items-end'}`}>
          {aside}
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
          {supplierNumber && (
            <p className="text-xs text-muted-foreground">
              LN-Nr.: {supplierNumber}
            </p>
          )}
        </div>
      )}
    </div>
  )

  return sticky ? <StickyDocumentPageHeader>{content}</StickyDocumentPageHeader> : content
}
