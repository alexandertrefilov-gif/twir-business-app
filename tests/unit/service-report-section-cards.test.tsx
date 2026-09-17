import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OfferRichText } from '@/components/offers/OfferRichText'
import { encodeOfferText, type OfferTextSection } from '@/lib/offers/rich-text'

function paragraph(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

const sections: OfferTextSection[] = [
  { id: 'calculation', title: 'D. Kalkulationsbasis', content: paragraph('Geschätzter Zeitaufwand und Gesamtpreis') },
  {
    id: 'payment',
    title: 'Zahlung: Meilensteine / KPIs',
    content: {
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [
            { type: 'tableHeader', attrs: { colspan: 1, colwidth: [240] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Projektphase' }] }] },
            { type: 'tableHeader', attrs: { colspan: 1, colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Betrag' }] }] },
          ],
        }],
      }, { type: 'paragraph', content: [{ type: 'text', text: 'Zahlung nach Meilensteinabnahme' }] }],
    },
  },
  { id: 'confidentiality', title: 'E. Verschwiegenheitspflicht:', content: paragraph('Vertrauliche Informationen bleiben geschützt.') },
]

const value = encodeOfferText({ version: 1, sections })

describe('Karten je Leistungs-Rich-Text-Sektion', () => {
  it('rendert Kalkulation, Zahlung und Verschwiegenheit in getrennten Karten', () => {
    const html = renderToStaticMarkup(<OfferRichText value={value} sectionCards />)

    expect(html.match(/data-document-section-card/g)).toHaveLength(3)
    expect(html).toContain('data-rich-text-section-cards')
    expect(html).toContain('space-y-4')
    expect(html.indexOf('D. Kalkulationsbasis')).toBeLessThan(html.indexOf('Zahlung: Meilensteine / KPIs'))
    expect(html.indexOf('Zahlung: Meilensteine / KPIs')).toBeLessThan(html.indexOf('E. Verschwiegenheitspflicht:'))
  })

  it('hält Tabelle und Fußnote vollständig innerhalb der Zahlungskarte', () => {
    const html = renderToStaticMarkup(<OfferRichText value={value} sectionCards />)
    const cards = html.split('data-document-section-card').slice(1)

    expect(cards[0]).not.toContain('<table')
    expect(cards[1]).toContain('<table')
    expect(cards[1]).toContain('Zahlung nach Meilensteinabnahme')
    expect(cards[1]).not.toContain('Verschwiegenheitspflicht')
    expect(cards[2]).toContain('Verschwiegenheitspflicht')
    expect(cards[2]).not.toContain('<table')
  })

  it('verwendet Karten nur in Webansicht und Editor, nicht in Vorschau oder PDF', () => {
    const normalDocument = renderToStaticMarkup(<OfferRichText value={value} />)
    const detail = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/[id]/page.tsx'), 'utf8')
    const form = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportForm.tsx'), 'utf8')
    const preview = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportPdfPreview.tsx'), 'utf8')
    const editor = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')
    const pdf = readFileSync(resolve(process.cwd(), 'lib/pdf-templates/service-report.template.tsx'), 'utf8')

    expect(normalDocument).not.toContain('data-document-section-card')
    expect(detail).toContain('buildServiceReportDocumentSections')
    expect(detail).toContain('<OfferRichText key={section.id} value={section.value} sectionCards />')
    expect(form).toContain('<ServiceReportPdfPreview')
    expect(form).not.toContain('<OfferRichText value={description}')
    expect(preview).not.toContain('OfferRichText')
    expect(editor).toContain("'form-section min-w-0 p-0'")
    expect(editor).not.toContain("'form-section min-w-0 overflow-clip p-0'")
    expect(pdf).toContain('buildServiceReportDocumentSections')
    expect(pdf).toContain('<OfferRichTextPdf value={section.value}')
    expect(pdf).not.toContain('DocumentSectionCard')
  })

  it('ändert weder Abschnittsdaten noch Workflow-Positionierung', () => {
    const detail = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/[id]/page.tsx'), 'utf8')
    const template = readFileSync(resolve(process.cwd(), 'lib/services/service-report-template.service.ts'), 'utf8')
    const left = detail.indexOf('documentSections.map')
    const sidebar = detail.indexOf('<BusinessDocumentSidebar', left)
    const workflow = detail.indexOf('<BusinessProcessWorkflow', sidebar)

    expect(template).toContain('sections: [...introSections, ...outroSections]')
    expect(template).not.toContain('Verschwiegenheitspflicht')
    expect(left).toBeGreaterThan(0)
    expect(sidebar).toBeGreaterThan(left)
    expect(workflow).toBeGreaterThan(sidebar)
  })

  it('serialisiert Prisma Decimal vor der Client-Layout-Grenze', () => {
    const detail = readFileSync(resolve(process.cwd(), 'app/(dashboard)/services/[id]/page.tsx'), 'utf8')

    expect(detail).toContain('const serializableItems = report.items.map')
    expect(detail).toContain('quantity: item.quantity.toNumber()')
    expect(detail).toContain('netAmount: item.netAmount.toNumber()')
    expect(detail).toContain('items: serializableItems')
    expect(detail).not.toContain('items: report.items')
  })

  it('bettet genau einen verschiebbaren Positionsblock in den Dokumenteditor ein', () => {
    const form = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportForm.tsx'), 'utf8')
    const editor = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')

    expect(form.match(/<ServiceReportPositionsEditor/g)).toHaveLength(1)
    expect(form).toContain('embeddedPositions={<ServiceReportPositionsEditor')
    expect(editor).toContain('data-service-report-positions-block')
    expect(editor).toContain('Position des Positionsblocks im Dokument')
    expect(editor).toContain('positionsAfterSectionId')
  })

  it('integriert Positionsheader, Entfernen und Dokumentposition in denselben responsiven Kartenrahmen', () => {
    const editor = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')
    const positions = readFileSync(resolve(process.cwd(), 'components/service-reports/ServiceReportPositionsEditor.tsx'), 'utf8')
    const blockStart = editor.indexOf('<section\n        className="form-section min-w-0 overflow-hidden p-0"')
    const blockEnd = editor.indexOf('</section>', blockStart)
    const block = editor.slice(blockStart, blockEnd)

    expect(blockStart).toBeGreaterThan(0)
    expect(block).toContain('data-service-report-positions-block')
    expect(block).toContain('id="service-positions-title"')
    expect(block).toContain('Position im Dokument')
    expect(block).toContain('removeButton')
    expect(block).toContain('{embeddedPositions}')
    expect(block).toContain('flex-wrap')
    expect(block).toContain('w-full min-w-0')
    expect(positions).not.toContain('<section className="form-section')
    expect(positions).toContain('＋ Position hinzufügen')
    expect(positions).toContain('＋ Weitere Position hinzufügen')
    expect(positions).toContain('Positionsnummern automatisch vergeben')
    expect(positions).toContain('Preise und Summen anzeigen')
  })
})
