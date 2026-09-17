'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export const DOCUMENT_STICKY_HEADER_HEIGHT = '--document-sticky-header-height'

export function StickyDocumentPageHeader({ children }: { children: ReactNode }) {
  const headerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const root = document.documentElement
    const updateHeight = () => {
      root.style.setProperty(DOCUMENT_STICKY_HEADER_HEIGHT, `${Math.ceil(header.getBoundingClientRect().height)}px`)
    }
    updateHeight()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateHeight)
    observer?.observe(header)
    window.addEventListener('resize', updateHeight)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateHeight)
      root.style.removeProperty(DOCUMENT_STICKY_HEADER_HEIGHT)
    }
  }, [])

  return (
    <div
      ref={headerRef}
      data-business-document-header
      className="bg-white lg:sticky lg:top-0 lg:z-30 lg:shadow-sm"
    >
      {children}
    </div>
  )
}
