'use client'

import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

export const DOCUMENT_SIDEBAR_STORAGE_KEY = 'twir.layout.documentSidebarWidth'
export const DOCUMENT_SIDEBAR_DEFAULT_WIDTH = 380
export const DOCUMENT_SIDEBAR_MIN_WIDTH = 300
export const DOCUMENT_SIDEBAR_MAX_WIDTH = 520
const MAIN_CONTENT_MIN_RATIO = 0.55
const SPLIT_HANDLE_WIDTH = 20

export function clampDocumentSidebarWidth(width: number, layoutWidth: number) {
  const usableWidth = Math.max(0, layoutWidth - SPLIT_HANDLE_WIDTH)
  const responsiveMaximum = Math.floor(usableWidth * (1 - MAIN_CONTENT_MIN_RATIO))
  const maximum = Math.max(
    DOCUMENT_SIDEBAR_MIN_WIDTH,
    Math.min(DOCUMENT_SIDEBAR_MAX_WIDTH, responsiveMaximum),
  )
  return {
    width: Math.min(maximum, Math.max(DOCUMENT_SIDEBAR_MIN_WIDTH, Math.round(width))),
    maximum,
  }
}

export function BusinessDocumentLayout({ children, className = '' }: { children: ReactNode; className?: string }) {
  const layoutRef = useRef<HTMLDivElement>(null)
  const sidebarWidthRef = useRef(DOCUMENT_SIDEBAR_DEFAULT_WIDTH)
  const [sidebarWidth, setSidebarWidth] = useState(DOCUMENT_SIDEBAR_DEFAULT_WIDTH)
  const [maximumWidth, setMaximumWidth] = useState(DOCUMENT_SIDEBAR_MAX_WIDTH)
  const [dragging, setDragging] = useState(false)
  const columns = Children.toArray(children)

  const resizeTo = useCallback((requestedWidth: number) => {
    const layoutWidth = layoutRef.current?.getBoundingClientRect().width ?? 0
    if (!layoutWidth) return requestedWidth
    const next = clampDocumentSidebarWidth(requestedWidth, layoutWidth)
    setMaximumWidth(next.maximum)
    setSidebarWidth(next.width)
    sidebarWidthRef.current = next.width
    return next.width
  }, [])

  useEffect(() => {
    const stored = Number.parseFloat(localStorage.getItem(DOCUMENT_SIDEBAR_STORAGE_KEY) ?? '')
    resizeTo(Number.isFinite(stored) ? stored : DOCUMENT_SIDEBAR_DEFAULT_WIDTH)
  }, [resizeTo])

  useEffect(() => {
    const handleResize = () => resizeTo(sidebarWidthRef.current)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [resizeTo])

  function persist(width: number) {
    localStorage.setItem(DOCUMENT_SIDEBAR_STORAGE_KEY, String(width))
  }

  function widthFromPointer(clientX: number) {
    const rect = layoutRef.current?.getBoundingClientRect()
    return rect ? rect.right - clientX : sidebarWidth
  }

  function startDragging(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    if (dragging) resizeTo(widthFromPointer(event.clientX))
  }

  function stopDragging(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    persist(resizeTo(widthFromPointer(event.clientX)))
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function resetLayout() {
    resizeTo(DOCUMENT_SIDEBAR_DEFAULT_WIDTH)
    localStorage.removeItem(DOCUMENT_SIDEBAR_STORAGE_KEY)
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 16
    let requestedWidth: number | null = null
    if (event.key === 'ArrowLeft') requestedWidth = sidebarWidth + step
    if (event.key === 'ArrowRight') requestedWidth = sidebarWidth - step
    if (event.key === 'Home') requestedWidth = DOCUMENT_SIDEBAR_MIN_WIDTH
    if (event.key === 'End') requestedWidth = maximumWidth
    if (requestedWidth === null) return
    event.preventDefault()
    persist(resizeTo(requestedWidth))
  }

  const style = {
    '--document-sidebar-width': `${sidebarWidth}px`,
  } as CSSProperties

  return (
    <div
      ref={layoutRef}
      data-business-document-layout
      data-resizable-split-layout
      className={`grid min-w-0 grid-cols-1 items-start lg:grid-cols-[minmax(0,1fr)_20px_var(--document-sidebar-width)] ${className}`}
      style={style}
    >
      {columns[0]}
      <div
        role="separator"
        aria-label="Breite zwischen Hauptinhalt und Seitenleiste ändern"
        aria-orientation="vertical"
        aria-valuemin={DOCUMENT_SIDEBAR_MIN_WIDTH}
        aria-valuemax={maximumWidth}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        className="group relative hidden touch-none cursor-col-resize items-stretch justify-center outline-none lg:flex"
        data-document-layout-divider
        onPointerDown={startDragging}
        onPointerMove={drag}
        onPointerUp={stopDragging}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={resetLayout}
        onKeyDown={resizeWithKeyboard}
      >
        <span className={`my-1 w-px transition-colors ${dragging ? 'bg-blue-500' : 'bg-stone-200 group-hover:bg-blue-400 group-focus:bg-blue-500'}`} aria-hidden="true" />
        <button
          type="button"
          aria-label="Layout zurücksetzen"
          title="Layout zurücksetzen"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={resetLayout}
          className="absolute top-2 flex h-5 w-5 items-center justify-center rounded-full border border-stone-200 bg-white text-[11px] text-stone-500 opacity-0 shadow-sm transition-opacity hover:text-blue-700 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          ↺
        </button>
      </div>
      {columns[1]}
      {columns.slice(2)}
    </div>
  )
}

export function BusinessDocumentSidebar({ children, sticky = true }: { children: ReactNode; sticky?: boolean }) {
  return (
    <aside
      data-business-document-sidebar
      className={`min-w-0 space-y-4 ${sticky ? 'lg:sticky lg:top-[calc(var(--document-sticky-header-height,0px)+1rem)] lg:max-h-[calc(100vh-var(--document-sticky-header-height,0px)-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1' : ''}`}
    >
      {children}
    </aside>
  )
}

export function BusinessWorkflowPlaceholder({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="card-base p-6">
      <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Workflow</p>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {children && <div className="mt-3 border-t border-stone-200 pt-3">{children}</div>}
    </div>
  )
}
