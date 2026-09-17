'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

export const A4_PREVIEW_WIDTH = 794
export const A4_PREVIEW_HEIGHT = 1123
export const MIN_DOCUMENT_ZOOM = 50
export const MAX_DOCUMENT_ZOOM = 150
export const DOCUMENT_ZOOM_STEP = 10

export function clampDocumentZoom(value: number): number {
  return Math.min(MAX_DOCUMENT_ZOOM, Math.max(MIN_DOCUMENT_ZOOM, Math.round(value)))
}

export function calculateFitZoom(containerWidth: number, containerHeight: number, padding = 24): number {
  if (containerWidth <= padding || containerHeight <= padding) return MIN_DOCUMENT_ZOOM
  const widthScale = (containerWidth - padding) / A4_PREVIEW_WIDTH
  const heightScale = (containerHeight - padding) / A4_PREVIEW_HEIGHT
  return clampDocumentZoom(Math.floor(Math.min(widthScale, heightScale) * 100))
}

export function DocumentPreviewWorkspace({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [fitMode, setFitMode] = useState(false)

  const fitToWindow = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    setZoomPercent(calculateFitZoom(viewport.clientWidth, viewport.clientHeight))
  }, [])

  useEffect(() => {
    if (!fitMode) return
    fitToWindow()
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(fitToWindow)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [fitMode, fitToWindow])

  function changeZoom(delta: number) {
    setFitMode(false)
    setZoomPercent((current) => clampDocumentZoom(current + delta))
  }

  function activateFit() {
    setFitMode(true)
    fitToWindow()
  }

  const scale = zoomPercent / 100
  const scaledWidth = A4_PREVIEW_WIDTH * scale
  const scaledHeight = A4_PREVIEW_HEIGHT * scale

  return (
    <section className="min-w-0" aria-label="Auftragsdokument-Vorschau">
      <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-white px-3 py-2">
        <span className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Dokumentansicht</span>
        <div className="flex items-center gap-1" role="group" aria-label="Dokumentzoom">
          <button type="button" onClick={() => changeZoom(-DOCUMENT_ZOOM_STEP)} disabled={zoomPercent <= MIN_DOCUMENT_ZOOM} aria-label="Dokument verkleinern" className="flex h-8 w-8 items-center justify-center rounded border border-stone-200 bg-white text-lg hover:bg-stone-50 disabled:opacity-40">−</button>
          <output aria-live="polite" className="min-w-14 text-center text-sm tabular-nums">{zoomPercent} %</output>
          <button type="button" onClick={() => changeZoom(DOCUMENT_ZOOM_STEP)} disabled={zoomPercent >= MAX_DOCUMENT_ZOOM} aria-label="Dokument vergrößern" className="flex h-8 w-8 items-center justify-center rounded border border-stone-200 bg-white text-lg hover:bg-stone-50 disabled:opacity-40">＋</button>
          <button type="button" onClick={activateFit} aria-pressed={fitMode} className={`ml-1 min-h-8 rounded border px-2.5 text-xs font-500 ${fitMode ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-stone-200 bg-white hover:bg-stone-50'}`}>An Fenster anpassen</button>
        </div>
      </div>

      <div ref={viewportRef} data-document-viewport className="h-[calc(100vh-13rem)] min-h-[36rem] overflow-auto rounded-md bg-stone-100 p-3">
        <div className="mx-auto" style={{ width: scaledWidth, height: scaledHeight }}>
          <article
            data-a4-document
            aria-label="Auftragsdokument"
            className="h-[1123px] w-[794px] overflow-auto border border-stone-200 bg-white shadow-sm"
            style={{ aspectRatio: '210 / 297', transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            {children}
          </article>
        </div>
      </div>
    </section>
  )
}
