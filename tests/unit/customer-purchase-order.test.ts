import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CustomerPurchaseOrderMetadataSchema } from '@/lib/validators/customer-purchase-order.schema'
import { validateUploadSignature } from '@/lib/security/upload-validator'

describe('eingehende Kundenbestellungen', () => {
  it('erlaubt die Annahme ohne Bestelldokument', () => {
    const parsed = CustomerPurchaseOrderMetadataSchema.safeParse({ orderNumber: '', orderDate: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual({ orderNumber: null, orderDate: null })
  })

  it('validiert Bestellmetadaten und erhält das Datum', () => {
    const parsed = CustomerPurchaseOrderMetadataSchema.parse({ orderNumber: '4500123456', orderDate: '2026-09-08' })
    expect(parsed.orderNumber).toBe('4500123456')
    expect(parsed.orderDate?.toISOString()).toContain('2026-09-08')
  })

  it('akzeptiert echte PDF- und Office-Signaturen und weist Tarn-Dateien ab', () => {
    expect(validateUploadSignature(Buffer.from('%PDF-1.7'), 'application/pdf')).toBe(true)
    expect(validateUploadSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
    expect(validateUploadSignature(Buffer.from('From: kunde@example.com\r\nSubject: Bestellung\r\n'), 'message/rfc822')).toBe(true)
    expect(validateUploadSignature(Buffer.from('not a pdf'), 'application/pdf')).toBe(false)
    expect(validateUploadSignature(Buffer.from('<script>alert(1)</script>'), 'message/rfc822')).toBe(false)
  })

  it('integriert Bestellung, optionale Annahme und bestehende Statuslogik in einer geschützten Route', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/offers/[id]/customer-purchase-order/route.ts'), 'utf8')
    expect(route).toContain('requirePermission(Resource.OFFER, Action.UPDATE)')
    expect(route).toContain('requirePermission(Resource.DOCUMENT, Action.CREATE)')
    expect(route).toContain('file.size > MAX_FILE_SIZE')
    expect(route.indexOf('file.size > MAX_FILE_SIZE')).toBeLessThan(route.indexOf('file.arrayBuffer()'))
    expect(route).toContain('acceptOffer,')
    expect(route).not.toContain('changeOfferStatus(')
  })

  it('bindet den Dialog auf der Angebotsdetailseite zum nachträglichen Erfassen einer Bestellung ein', () => {
    const detail = readFileSync(resolve(process.cwd(), 'app/(dashboard)/offers/[id]/page.tsx'), 'utf8')
    expect(detail).toContain("import { CustomerPurchaseOrderDialog } from '@/components/offers/CustomerPurchaseOrderDialog'")
    expect(detail).toContain('mode="add"')
  })

  it('verknüpft die Bestellung bei der bestehenden Angebotskonvertierung mit genau dem Auftrag', () => {
    const service = readFileSync(resolve(process.cwd(), 'lib/services/offer.service.ts'), 'utf8')
    expect(service).toContain('where: { offerId }')
    expect(service).toContain('data: { orderId: order.id }')
    expect(service).toContain('customerPurchaseOrderId: customerPurchaseOrder.id')
    expect(service).toContain('Nur angenommene Angebote können in Aufträge umgewandelt werden.')
  })

  it('legt neue Originaldateien in der Bestellkategorie ab, ohne bestehende Pfade zu verschieben', () => {
    const service = readFileSync(resolve(process.cwd(), 'lib/services/customer-purchase-order.service.ts'), 'utf8')
    expect(service).toContain("category: '02_Bestellung'")
    expect(service).toContain('businessCaseId: `offer-${offer.id}`')
    expect(service).toContain("type: 'UPLOAD'")
    expect(service).toContain('originalName: safeOriginal')
    expect(service).toContain('acceptOfferInTransaction')
    expect(service.indexOf('acceptOfferInTransaction')).toBeLessThan(service.indexOf('tx.customerPurchaseOrder.upsert'))
    expect(service).toContain('return await prisma.$transaction')
    expect(service).toContain("'DOCUMENT_UPLOADED'")
    expect(service).not.toContain('rename(')
  })

  it('beschriftet den Annahmedialog eindeutig und schützt gegen Doppelklick', () => {
    const dialog = readFileSync(resolve(process.cwd(), 'components/offers/CustomerPurchaseOrderDialog.tsx'), 'utf8')
    expect(dialog).toContain('Annehmen und Bestellung speichern')
    expect(dialog).toContain('Ohne Bestellung annehmen')
    expect(dialog).toContain('Bestellung hier hineinziehen')
    expect(dialog).toContain('submittingRef.current')
    expect(dialog).toContain('.eml')
  })

  it('hebt das Middleware-Bodylimit an, damit der 20-MB-Upload die Route überhaupt erreicht', () => {
    // Next.js liest Request-Bodies vollständig ein, sobald middleware.ts greift,
    // und kappt sie standardmäßig bei 10 MB (statt sauber abzulehnen wird der
    // multipart-Body abgeschnitten, was in der Route zu einem rohen 500 statt
    // der eigenen 413-Prüfung führt). Ohne diese Anhebung ist der in
    // upload-validator.ts vorgesehene 20-MB-Upload für Kundenbestellungen
    // nicht erreichbar.
    const config = readFileSync(resolve(process.cwd(), 'next.config.mjs'), 'utf8')
    expect(config).toContain('middlewareClientMaxBodySize')
    const match = config.match(/middlewareClientMaxBodySize:\s*'(\d+)mb'/)
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBeGreaterThan(20)
  })
})
