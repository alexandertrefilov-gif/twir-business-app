import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  clampDocumentSidebarWidth,
  DOCUMENT_SIDEBAR_DEFAULT_WIDTH,
  DOCUMENT_SIDEBAR_MAX_WIDTH,
  DOCUMENT_SIDEBAR_MIN_WIDTH,
  DOCUMENT_SIDEBAR_STORAGE_KEY,
} from '@/components/documents/BusinessDocumentLayout'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('verstellbares Dokumentlayout', () => {
  it('begrenzt die Sidebar und hält bei ausreichender Breite mindestens 55 Prozent Hauptinhalt frei', () => {
    expect(DOCUMENT_SIDEBAR_DEFAULT_WIDTH).toBe(380)
    expect(DOCUMENT_SIDEBAR_MIN_WIDTH).toBe(300)
    expect(DOCUMENT_SIDEBAR_MAX_WIDTH).toBe(520)
    expect(clampDocumentSidebarWidth(100, 1200)).toEqual({ width: 300, maximum: 520 })
    expect(clampDocumentSidebarWidth(900, 1200)).toEqual({ width: 520, maximum: 520 })
    expect(clampDocumentSidebarWidth(500, 900)).toEqual({ width: 395, maximum: 395 })
  })

  it('speichert erst am Drag-End und stellt gespeicherte Werte wieder her', () => {
    const layout = source('components/documents/BusinessDocumentLayout.tsx')
    expect(DOCUMENT_SIDEBAR_STORAGE_KEY).toBe('twir.layout.documentSidebarWidth')
    expect(layout).toContain('localStorage.getItem(DOCUMENT_SIDEBAR_STORAGE_KEY)')
    expect(layout).toContain('persist(resizeTo(widthFromPointer(event.clientX)))')
    expect(layout).not.toMatch(/function drag[\s\S]*?localStorage\.setItem/)
  })

  it('bietet Maus-, Doppelklick-, Reset- und Tastaturbedienung an', () => {
    const layout = source('components/documents/BusinessDocumentLayout.tsx')
    expect(layout).toContain('role="separator"')
    expect(layout).toContain('aria-orientation="vertical"')
    expect(layout).toContain('aria-valuenow={sidebarWidth}')
    expect(layout).toContain('onPointerDown={startDragging}')
    expect(layout).toContain('onDoubleClick={resetLayout}')
    expect(layout).toContain("event.key === 'ArrowLeft'")
    expect(layout).toContain("event.key === 'ArrowRight'")
    expect(layout).toContain('aria-label="Layout zurücksetzen"')
  })

  it('aktiviert den Trenner nur auf Desktop und lässt Mobile einspaltig', () => {
    const layout = source('components/documents/BusinessDocumentLayout.tsx')
    expect(layout).toContain('grid-cols-1 items-start lg:grid-cols-')
    expect(layout).toContain('hidden touch-none cursor-col-resize')
    expect(layout).toContain('lg:flex')
    expect(layout).toContain('min-w-0')
  })

  it.each([
    'app/(dashboard)/offers/[id]/page.tsx',
    'app/(dashboard)/offers/[id]/edit/page.tsx',
    'app/(dashboard)/orders/[id]/page.tsx',
    'app/(dashboard)/orders/[id]/edit/page.tsx',
    'app/(dashboard)/customers/[id]/page.tsx',
  ])('%s verwendet das zentrale Split-Layout', (path) => {
    expect(source(path)).toContain('<BusinessDocumentLayout>')
  })

  it('bewahrt Sticky-Sidebar und interne Tabellen-Overflows', () => {
    const layout = source('components/documents/BusinessDocumentLayout.tsx')
    expect(layout).toContain('lg:sticky lg:top-[calc(var(--document-sticky-header-height,0px)+1rem)]')
    expect(layout).toContain('lg:overflow-y-auto')
    for (const path of [
      'app/(dashboard)/offers/[id]/page.tsx',
      'app/(dashboard)/orders/[id]/page.tsx',
    ]) {
      expect(source(path)).toContain('overflow-x-auto')
    }
  })
})
