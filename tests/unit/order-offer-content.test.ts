import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('vollständige Angebotsübernahme in den Auftrag', () => {
  it('persistiert Einleitungs-, Schluss- und Positionskarten bei der Konvertierung', () => {
    const service = source('lib/services/offer.service.ts')
    const action = source('app/(dashboard)/offers/actions.ts')
    expect(service).toContain('offerToOrderDescription(offer.introText, offer.outroText, offer.items.length > 0)')
    expect(service).toContain('notes:       item.notes')
    expect(action).toContain('redirect(`/orders/${orderId}/edit`)')
  })

  it('erlaubt im Auftragseditor jede Textkarte und die Positionskarte zu entfernen', () => {
    const form = source('components/orders/OrderForm.tsx')
    const editor = source('components/offers/RichTextSectionsEditor.tsx')
    expect(form).toContain('<RichTextSectionsEditor')
    expect(form).toContain('removableSections')
    expect(form).toContain('embeddedPositions=')
    expect(form).toContain('onEmbeddedPositionsRemoved={() => setItems([])}')
    expect(form).toContain('Nicht benötigte Text- und Positionskarten können einzeln entfernt werden.')
    expect(editor).toContain("{removableSections ? 'Entfernen' : '−'}")
    expect(editor).toContain('Positionskarte entfernen')
  })

  it('bietet Bearbeiten und Entfernen direkt an jeder offenen Auftragskarte an', () => {
    const detail = source('app/(dashboard)/orders/[id]/page.tsx')
    const actions = source('components/orders/OrderContentCardActions.tsx')
    const serverActions = source('app/(dashboard)/orders/actions.ts')
    for (const card of ['descriptionBefore', 'positions', 'descriptionAfter']) {
      expect(detail).toContain(`card="${card}"`)
    }
    expect(actions).toContain('Bearbeiten')
    expect(actions).toContain('Entfernen')
    expect(actions).toContain('Das Ursprungsangebot bleibt unverändert.')
    expect(serverActions).toContain('await requirePermission(Resource.ORDER, Action.UPDATE)')
    expect(serverActions).toContain('removeOrderContentCard(orderId, card, userId, userEmail)')
  })

  it('bewahrt Positionsnotizen beim Bearbeiten und ordnet Inhalte auch in Web und PDF', () => {
    const form = source('components/orders/OrderForm.tsx')
    const editPage = source('app/(dashboard)/orders/[id]/edit/page.tsx')
    const detail = source('app/(dashboard)/orders/[id]/page.tsx')
    const pdf = source('lib/pdf-templates/order.template.tsx')
    const pdfService = source('lib/services/order-pdf.service.ts')
    expect(form).toContain('notes:       r.notes || null')
    expect(editPage).toContain("notes:       item.notes ?? ''")
    expect(detail).toContain('splitOfferTextAtPositions(orderDescriptionWithOfferFallback(')
    expect(pdf).toContain('splitOfferTextAtPositions(data.description)')
    expect(editPage).toContain('orderDescriptionWithOfferFallback(')
    expect(pdfService).toContain('orderDescriptionWithOfferFallback(')
  })
})
