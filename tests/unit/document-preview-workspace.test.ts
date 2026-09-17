import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  A4_PREVIEW_HEIGHT,
  A4_PREVIEW_WIDTH,
  MAX_DOCUMENT_ZOOM,
  MIN_DOCUMENT_ZOOM,
  calculateFitZoom,
  clampDocumentZoom,
} from '@/components/documents/DocumentPreviewWorkspace'

const componentSource = readFileSync(resolve(process.cwd(), 'components/documents/DocumentPreviewWorkspace.tsx'), 'utf8')
const orderPageSource = readFileSync(resolve(process.cwd(), 'app/(dashboard)/orders/[id]/page.tsx'), 'utf8')

describe('A4-Dokumentvorschau', () => {
  it('verwendet die A4-Referenzgröße und erhält das Seitenverhältnis', () => {
    expect(A4_PREVIEW_WIDTH).toBe(794)
    expect(A4_PREVIEW_HEIGHT).toBe(1123)
    expect(A4_PREVIEW_WIDTH / A4_PREVIEW_HEIGHT).toBeCloseTo(210 / 297, 3)
    expect(componentSource).toContain("aspectRatio: '210 / 297'")
  })

  it('startet bei 100 Prozent und begrenzt Minus/Plus auf 50 bis 150 Prozent', () => {
    expect(componentSource).toContain('useState(100)')
    expect(clampDocumentZoom(40)).toBe(MIN_DOCUMENT_ZOOM)
    expect(clampDocumentZoom(80)).toBe(80)
    expect(clampDocumentZoom(160)).toBe(MAX_DOCUMENT_ZOOM)
    expect(componentSource).toContain('changeZoom(-DOCUMENT_ZOOM_STEP)')
    expect(componentSource).toContain('changeZoom(DOCUMENT_ZOOM_STEP)')
  })

  it('berechnet Fit proportional aus verfügbarer Breite und Höhe', () => {
    expect(calculateFitZoom(818, 1147)).toBe(100)
    expect(calculateFitZoom(659, 923)).toBe(79)
    expect(calculateFitZoom(3000, 3000)).toBe(150)
    expect(calculateFitZoom(200, 200)).toBe(50)
    expect(componentSource).toContain('new ResizeObserver(fitToWindow)')
  })

  it('stellt für skaliertes A4 eine passende Scrollfläche bereit', () => {
    expect(componentSource).toContain('overflow-auto')
    expect(componentSource).toContain('width: scaledWidth, height: scaledHeight')
    expect(componentSource).toContain("transformOrigin: 'top left'")
  })

  it('trennt die normale Kartenansicht von der echten A4-Vorschau', () => {
    const layoutStart = orderPageSource.indexOf('<BusinessDocumentLayout>')
    const cardStart = orderPageSource.indexOf('<DocumentSectionCard')
    const sidebarStart = orderPageSource.indexOf('<BusinessDocumentSidebar', cardStart)
    const workflow = orderPageSource.indexOf('<BusinessProcessWorkflow')
    expect(layoutStart).toBeGreaterThan(0)
    expect(cardStart).toBeGreaterThan(layoutStart)
    expect(sidebarStart).toBeGreaterThan(cardStart)
    expect(workflow).toBeGreaterThan(sidebarStart)
    expect(orderPageSource).not.toContain('<DocumentPreviewWorkspace>')
    expect(orderPageSource.slice(cardStart, sidebarStart)).not.toContain('<BusinessProcessWorkflow')
  })

  it('bewahrt fachliche Dokumentdaten und unveränderte Workflow-Aufrufe', () => {
    for (const value of ['Kunde', 'Auftragsdatum', 'Abgeschlossen', 'Angebotsbezug', 'Thema und Beschreibung', 'Positionen']) {
      expect(orderPageSource).toContain(value)
    }
    expect(orderPageSource).toContain("currentDocument={{ type: 'order', id: order.id }}")
    expect(orderPageSource).toContain('<OrderStatusActions')
    expect(orderPageSource).toContain('processPermissions')
    expect(orderPageSource).toContain('<BusinessDocumentLayout>')
    expect(orderPageSource).toContain('<DocumentSectionCard')
    expect(componentSource).toContain('data-document-viewport')
    expect(componentSource).toContain('transform: `scale(${scale})`')
  })
})
