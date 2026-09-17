import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  copyOrderItemsToServiceReportTemplate,
  mergeOfferTextForServiceReport,
  serviceItemTypeForUnit,
} from '@/lib/services/service-report-template.service'
import { decodeOfferText, encodeOfferText, isOfferTextDocumentEmpty } from '@/lib/offers/rich-text'
import {
  ServiceReportCreateSchema,
  ServiceReportItemSchema,
  calcReportItemAmounts,
  calcReportTotals,
} from '@/lib/validators/service-report.schema'

describe('Leistungsnachweis-Vorlage aus Auftrag', () => {
  it('kopiert Positionen in stabiler Reihenfolge als unabhängige Formularwerte', () => {
    const source = [
      { position: 1, description: 'Kabeltrasse montieren', quantity: { toString: () => '1' }, unit: 'Psch.', unitPrice: { toString: () => '500' }, notes: null },
      { position: 2, description: 'Kabel verlegen', quantity: { toString: () => '20' }, unit: 'm', unitPrice: { toString: () => '12.5' }, notes: 'Nach Aufmaß' },
    ]
    const result = copyOrderItemsToServiceReportTemplate(source)

    expect(result.map((item) => item.description)).toEqual(['Kabeltrasse montieren', 'Kabel verlegen'])
    expect(result).toEqual([
      { position: 1, type: 'flat', description: 'Kabeltrasse montieren', quantity: '1', unit: 'Psch.', unitPrice: '500', discountRate: '0', taxRate: '19', notes: '' },
      { position: 2, type: 'material', description: 'Kabel verlegen', quantity: '20', unit: 'm', unitPrice: '12.5', discountRate: '0', taxRate: '19', notes: 'Nach Aufmaß' },
    ])
    result[0].description = 'Tatsächlich ausgeführte Leistung'
    expect(source[0].description).toBe('Kabeltrasse montieren')
  })

  it('ordnet vorhandene Einheiten ohne neue Datenbankinformation sinnvoll zu', () => {
    expect(serviceItemTypeForUnit('Std.')).toBe('hours')
    expect(serviceItemTypeForUnit('h')).toBe('hours')
    expect(serviceItemTypeForUnit('Psch.')).toBe('flat')
    expect(serviceItemTypeForUnit('m²')).toBe('flat')
    expect(serviceItemTypeForUnit('Stk.')).toBe('material')
  })

  it('führt Intro und Outro vollständig auf Section-Ebene zusammen', () => {
    const intro = encodeOfferText({ version: 1, sections: [{ id: 'intro', title: 'Thema', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Leistungsumfang' }] }] } }] })
    const outro = encodeOfferText({ version: 1, sections: [{ id: 'outro', title: 'Ergänzungen', content: { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dokumentation' }] }] }] }] } }] })
    const merged = decodeOfferText(mergeOfferTextForServiceReport(intro, outro))
    expect(merged.sections.map((section) => section.title)).toEqual(['Thema', 'Ergänzungen'])
    expect(merged.sections[1].content.content?.[0].type).toBe('bulletList')
    expect(merged.positionsAfterSectionId).toBe('intro')
    expect(merged.positionsEnabled).toBe(true)
  })

  it('lädt ausschließlich OrderItem-Snapshots und verändert keine Angebotsposition', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/services/service-report-template.service.ts'), 'utf8')
    expect(source).toContain('items: {')
    expect(source).not.toContain('offerItem.update')
    expect(source).not.toContain('offerItem.delete')
  })

  it('öffnet die Neuerstellung direkt mit allen übernommenen Auftragspositionen', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportForm.tsx'), 'utf8')
    const page = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/new/page.tsx'), 'utf8')
    expect(page).toContain('items: selectedOrder?.items')
    expect(source).not.toContain('Leistungen auswählen')
    expect(source).not.toContain('Ausgewählte Leistungen übernehmen')
  })

  it('hält Preview an denselben strukturierten Inhalts-Snapshot gebunden', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportForm.tsx'), 'utf8')
    expect(source).toContain('items: decodePositionsEnabled(description) ? previewItems : []')
    expect(source).not.toContain('computed.map((item, index)')
  })

  it('hält den Standard-Leistungsnachweis preisfrei und schaltet Preise explizit im Editor', () => {
    const positions = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportPositionsEditor.tsx'), 'utf8')
    const detail = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/[id]/page.tsx'), 'utf8')
    const pdf = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/service-report.template.tsx'), 'utf8')
    expect(positions).toContain('useState(false)')
    expect(positions).toContain('Preise und Summen anzeigen')
    expect(detail).not.toContain('Einzelpr.')
    expect(detail).not.toContain('Gesamt netto')
    expect(pdf).not.toContain('>Einzelpr.</Text>')
    expect(pdf).not.toContain('>Gesamt netto</Text>')
  })

  it('trennt Angebotspositionen vom Dokumenttext und bewahrt Intro/Outro-Reihenfolge', () => {
    const intro = encodeOfferText({ version: 1, sections: [
      { id: 'a', title: 'A. Projektlaufzeit', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      { id: 'd', title: 'D. Dokumentation', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
    ] })
    const outro = encodeOfferText({ version: 1, sections: [
      { id: 'e', title: 'E. Verschwiegenheitspflicht:', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
    ] })
    const items = [{ position: 1, type: 'material' as const, description: 'Montage', quantity: '2', unit: 'Stk.', unitPrice: '999', discountRate: '0', taxRate: '19', notes: '' }]
    const merged = decodeOfferText(mergeOfferTextForServiceReport(intro, outro, items))
    expect(merged.sections.map((section) => section.title)).toEqual([
      'A. Projektlaufzeit', 'D. Dokumentation', 'E. Verschwiegenheitspflicht:',
    ])
    expect(merged.positionsAfterSectionId).toBe('d')
    expect(JSON.stringify(merged)).not.toContain('999')
  })

  it('verwendet den gemeinsamen Rich-Text-Editor und Renderer', () => {
    const form = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportForm.tsx'), 'utf8')
    const detail = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/[id]/page.tsx'), 'utf8')
    const pdf = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/service-report.template.tsx'), 'utf8')
    expect(form).toContain('<RichTextSectionsEditor')
    expect(detail).toContain('<OfferRichText key={section.id} value={section.value}')
    expect(pdf).toContain('<OfferRichTextPdf value={section.value}')
    expect(form).toContain('removableSections')
    expect(form).toContain('embeddedPositions={<ServiceReportPositionsEditor')
  })

  it('entfernt Inhaltsbereiche nur aus der lokalen Leistungsnachweis-Kopie und bietet Undo', () => {
    const editor = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')
    const service = readFileSync(resolve(process.cwd(), 'lib/services/service-report.service.ts'), 'utf8')
    expect(editor).toContain("current.sections.filter((section) => section.id !== id)")
    expect(editor).toContain('function restoreSection')
    expect(editor).toContain('Rückgängig')
    expect(service).not.toContain('orderItem.delete')
    expect(service).not.toContain('offerItem.delete')
  })

  it('ermittelt das Ursprungsangebot über den Auftrag, ohne Angebot→Auftrag zu verändern', () => {
    const offerService = readFileSync(resolve(process.cwd(), 'lib/services/offer.service.ts'), 'utf8')
    const templateService = readFileSync(resolve(process.cwd(), 'lib/services/service-report-template.service.ts'), 'utf8')
    expect(templateService).toContain('offer: {')
    expect(templateService).toContain('orderDescriptionWithOfferFallback(')
    expect(templateService).toContain('copyOrderItemsToServiceReportTemplate(order.items)')
    expect(templateService).not.toContain('order.offer?.items ?? order.items')
    expect(offerService).toContain('offerToOrderDescription(offer.introText, offer.outroText, offer.items.length > 0)')
    expect(templateService).toContain('orderDescriptionWithOfferFallback(')
  })

  it('übernimmt beim Reload genau einmal die vom Server gelieferten Defaults', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportPositionsEditor.tsx'), 'utf8')
    expect(source).toContain('defaults.map')
    expect(source).not.toContain('setItems((current) => [...current, ...defaults.items')
  })

  it('berechnet Positionsrabatt, Netto, Steuer und Brutto über die zentrale Angebotsberechnung', () => {
    expect(calcReportItemAmounts({ quantity: 2.5, unitPrice: 100, discountRate: 10, taxRate: 19 })).toEqual({
      subtotal: 250,
      discountAmount: 25,
      netAmount: 225,
      taxAmount: 42.75,
      grossAmount: 267.75,
    })
    const items = [
      { position: 1, type: 'hours' as const, description: 'Planung', quantity: 2.5, unit: 'Std.', unitPrice: 100, discountRate: 10, taxRate: 19, notes: null },
      { position: 2, type: 'material' as const, description: 'Material', quantity: 2, unit: 'Stk.', unitPrice: 50, discountRate: 0, taxRate: 7, notes: null },
    ]
    expect(calcReportTotals(items)).toEqual({ subtotal: 350, totalDiscount: 25, totalNet: 325, totalTax: 49.75, totalGross: 374.75 })
  })

  it('validiert alle drei Typen sowie Mengen-, Preis- und Rabattgrenzen', () => {
    for (const type of ['hours', 'material', 'flat'] as const) {
      expect(ServiceReportItemSchema.safeParse({ position: 1, type, description: 'Leistung', quantity: 1, unit: 'Stk.', unitPrice: 0, discountRate: 0, taxRate: 19 }).success).toBe(true)
    }
    expect(ServiceReportItemSchema.safeParse({ position: 1, type: 'hours', description: 'Leistung', quantity: 0, unit: 'Std.', unitPrice: 0, discountRate: 0, taxRate: 19 }).success).toBe(false)
    expect(ServiceReportItemSchema.safeParse({ position: 1, type: 'hours', description: 'Leistung', quantity: 1, unit: 'Std.', unitPrice: -1, discountRate: 0, taxRate: 19 }).success).toBe(false)
    expect(ServiceReportItemSchema.safeParse({ position: 1, type: 'hours', description: 'Leistung', quantity: 1, unit: 'Std.', unitPrice: 1, discountRate: 101, taxRate: 19 }).success).toBe(false)
  })

  it('erlaubt einen Leistungsnachweis ohne optionale Positionskarte', () => {
    const result = ServiceReportCreateSchema.safeParse({
      orderId: '00000000-0000-4000-8000-000000000001',
      title: null,
      description: encodeOfferText({
        version: 1,
        sections: [],
        positionsEnabled: false,
      }),
      reportDate: '2026-08-21',
      items: [],
    })

    expect(result.success).toBe(true)
  })

  it('persistiert auch die Varianten nur Positionen und ohne Positionen ohne leere Textplatzhalter', () => {
    const onlyPositionsDocument = { version: 1 as const, sections: [], positionsEnabled: true, positionsAfterSectionId: null }
    const withoutPositionsDocument = { version: 1 as const, sections: [], positionsEnabled: false, positionsAfterSectionId: null }
    const onlyPositions = encodeOfferText(onlyPositionsDocument)
    const withoutPositions = encodeOfferText(withoutPositionsDocument)

    expect(isOfferTextDocumentEmpty(onlyPositionsDocument)).toBe(false)
    expect(isOfferTextDocumentEmpty(withoutPositionsDocument)).toBe(false)
    expect(decodeOfferText(onlyPositions)).toMatchObject({ sections: [], positionsEnabled: true })
    expect(decodeOfferText(withoutPositions)).toMatchObject({ sections: [], positionsEnabled: false })
  })

  it('verwendet Bestätigung, Wiederherstellung und genau eine Positionskarte', () => {
    const form = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportForm.tsx'), 'utf8')
    const editor = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')

    expect(editor).toContain('title="Positionskarte entfernen?"')
    expect(editor).toContain('Die enthaltenen Positionen werden aus diesem Leistungsnachweis entfernt.')
    expect(editor).toContain('embeddedPositionsHasData ?')
    expect(editor).toContain('positionsEnabled: false')
    expect(editor).toContain('positionsEnabled: true')
    expect(editor.match(/<span aria-hidden>＋<\/span> Positionen/g)).toHaveLength(1)
    expect(form).toContain('setPositionDefaults(undefined)')
    expect(form).toContain('setPreviewItems([])')
  })

  it('unterstützt Hinzufügen, Löschen, Drag-and-drop und manuelle Nummerierung ohne Ursprungsänderung', () => {
    const editor = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportPositionsEditor.tsx'), 'utf8')
    const service = readFileSync(resolve(process.cwd(), 'lib/services/service-report.service.ts'), 'utf8')
    expect(editor).toContain('function addItem()')
    expect(editor).toContain('function removeItem(key: string)')
    expect(editor).toContain('function dropOn(targetKey: string)')
    expect(editor).toContain('draggable')
    expect(editor).toContain('Positionsnummern automatisch vergeben')
    expect(editor).toContain('disabled={automaticPositions}')
    expect(service).not.toContain('offerItem.delete')
    expect(service).not.toContain('orderItem.delete')
  })

  it('persistiert Rabatt und MwSt. ausschließlich auf ServiceReportItem und hält das PDF preisfrei', () => {
    const service = readFileSync(resolve(process.cwd(), 'lib/services/service-report.service.ts'), 'utf8')
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const pdf = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/service-report.template.tsx'), 'utf8')
    expect(service).toContain('discountRate: item.discountRate')
    expect(service).toContain('taxRate:      item.taxRate')
    expect(schema).toContain('discountRate Decimal')
    expect(pdf).toContain('Leistung / Material')
    expect(pdf).not.toContain('item.unitPrice')
    expect(pdf).not.toContain('item.discountRate')
    expect(pdf).not.toContain('item.taxRate')
  })

  it('zeigt vor dem Speichern eine Vorschau aus demselben bearbeitbaren Zustand', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportForm.tsx'), 'utf8')
    const preview = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportPdfPreview.tsx'), 'utf8')
    expect(source).toContain('<ServiceReportPdfPreview')
    expect(source).not.toContain('previewOpen')
    expect(preview).toContain("fetch('/api/services/preview'")
    expect(preview).toContain('PDF-Vorschau Leistungsnachweis')
    expect(preview).toContain('<iframe')
  })

  it('nutzt für Neu- und Bearbeiten dasselbe responsive Kartenlayout', () => {
    const createPage = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/new/page.tsx'), 'utf8')
    const editPage = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/[id]/edit/page.tsx'), 'utf8')

    expect(createPage).toContain('<BusinessDocumentLayout>')
    expect(editPage).toContain('<BusinessDocumentLayout>')
    expect(createPage).not.toContain('<DocumentEditorCanvas>')
    expect(editPage).not.toContain('<DocumentEditorCanvas>')
    expect(createPage).not.toContain('max-w-4xl')
    expect(editPage).not.toContain('max-w-4xl')
  })

  it('hält Metadaten, Editor und Werkzeugleiste innerhalb der Dokumentbreite', () => {
    const form = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportForm.tsx'), 'utf8')
    const editor = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')

    expect(form).toContain('className="w-full min-w-0 space-y-4"')
    expect(form).toContain('documentLayout')
    expect(form).toContain('className="form-section"')
    expect(form).not.toContain('className="form-section min-w-0"')
    expect(editor).toContain("'form-section min-w-0 p-0'")
    expect(editor).not.toContain("'form-section min-w-0 overflow-clip p-0'")
    expect(editor).toContain("documentLayout ? 'space-y-6'")
    expect(editor).toContain('w-full flex-wrap items-center')
    expect(editor).toContain('overflow-x-auto')
  })

  it('zeigt bei der Neuanlage denselben Vorgangsworkflow rechts neben dem unveränderten Formular', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/new/page.tsx'), 'utf8')
    const layout = page.indexOf('<BusinessDocumentLayout>')
    const form = page.indexOf('<ServiceReportForm', layout)
    const sidebar = page.indexOf('<BusinessDocumentSidebar', form)
    const workflow = page.indexOf('<BusinessProcessWorkflow', sidebar)

    expect(layout).toBeGreaterThan(0)
    expect(form).toBeGreaterThan(layout)
    expect(sidebar).toBeGreaterThan(form)
    expect(workflow).toBeGreaterThan(sidebar)
    expect(page.slice(0, layout)).not.toContain('<BusinessProcessWorkflow')
    expect(page.match(/<BusinessProcessWorkflow/g)).toHaveLength(1)
    expect(page).toContain('getBusinessProcessForOrder(selectedOrderId, user.userId, user.role)')
    expect(page).toContain('activeStage="serviceReport"')
    expect(page).toContain('<BusinessDocumentSidebar sticky>')
    expect(page).toContain('id="service-report-workflow-actions"')
    expect(page).toContain("items: selectedOrder?.items")
    expect(page).toContain('action={createServiceReportAction}')
  })

  it('beschränkt den visuellen Erstellungskontext auf die Workflow-Darstellung', () => {
    const workflow = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    const derivation = readFileSync(resolve(process.cwd(), 'lib/workflow/business-process.ts'), 'utf8')
    expect(workflow).toContain('activeStage?: ProcessStageKey')
    expect(workflow).toContain("stage.key === activeStage")
    expect(workflow).not.toContain('activeStage ?? currentDocument.type')
    expect(workflow).toContain("stage.state === 'current' ? 'later'")
    expect(workflow).toContain("primary={visualState === 'current'}")
    expect(workflow).toContain('<StageActions')
    expect(workflow).toContain('stageKey={stage.key}')
    expect(workflow).toContain('stageState={stage.state}')
    expect(derivation).not.toContain('activeStage')
  })
})
