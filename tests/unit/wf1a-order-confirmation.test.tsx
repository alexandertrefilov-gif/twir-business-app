import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const findFirst = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/prisma', () => ({ prisma: { customerPurchaseOrder: { findFirst } } }))
vi.mock('@/lib/services/order.service', () => ({ getOrderById: vi.fn() }))
vi.mock('@/lib/services/settings.service', () => ({ getCompanySnapshot: vi.fn() }))
vi.mock('@/lib/services/company-logo-rendering.service', () => ({ loadCompanyLogoForPdf: vi.fn() }))

import { getOrderById } from '@/lib/services/order.service'
import { getCompanySnapshot } from '@/lib/services/settings.service'
import { loadCompanyLogoForPdf } from '@/lib/services/company-logo-rendering.service'
import { getOrderPdfData } from '@/lib/services/order-pdf.service'
import { OrderDocument, renderOrderPdf, type OrderPdfData } from '@/lib/pdf-templates/order.template'
import { EMPLOYEE_ORDER_PDF_OPTIONS, FULL_ORDER_PDF_OPTIONS, parseOrderPdfOptions } from '@/lib/validators/order-pdf.schema'
import { formatCustomerOrderReference, ORDER_CONFIRMATION_LABEL } from '@/lib/workflow/document-labels'

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const decimal = (value: number) => ({ toNumber: () => value })

function texts(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { node.forEach((n) => texts(n, out)); return out }
  const props = (node as ReactElement).props as { children?: unknown } | undefined
  if (props) texts(props.children, out)
  return out
}

const base: OrderPdfData = {
  orderNumber: 'AU-1', orderDate: '19.08.2026', title: 'Montage',
  options: EMPLOYEE_ORDER_PDF_OPTIONS,
  company: { companyName: 'TWIR GmbH' },
  customer: { name: 'Kunde AG' },
  items: [],
}

describe('WF-1A Auftragsbestätigung (PDF)', () => {
  it('verwendet den Titel "Auftragsbestätigung" im Dokument', () => {
    const doc = OrderDocument({ data: base }) as ReactElement<{ title: string }>
    expect(doc.props.title).toBe('Auftragsbestätigung AU-1')
    expect(texts(doc).join('|')).toContain('Auftragsbestätigung')
  })

  it('zeigt "Ihre Bestellung Nr. … vom …" nur bei vorhandenen Daten', () => {
    const withPo = texts(OrderDocument({ data: { ...base, customerOrderNumber: 'PO-1', customerOrderDate: '01.09.2026' } })).join('|')
    expect(withPo).toContain('Ihre Bestellung Nr. PO-1 vom 01.09.2026')
    const without = texts(OrderDocument({ data: base })).join('|')
    expect(without).not.toContain('Ihre Bestellung')
  })

  it('formatiert Teilangaben', () => {
    expect(formatCustomerOrderReference('PO-1', null)).toBe('Ihre Bestellung Nr. PO-1')
    expect(formatCustomerOrderReference(null, '01.09.2026')).toBe('Ihre Bestellung vom 01.09.2026')
    expect(formatCustomerOrderReference(null, null)).toBeNull()
  })

  it('rendert ein gültiges PDF', async () => {
    const buffer = await renderOrderPdf({ ...base, customerOrderNumber: 'PO-1' })
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('aktiviert showCustomerOrder standardmäßig für Mitarbeiter und Vollversion', () => {
    expect(EMPLOYEE_ORDER_PDF_OPTIONS.showCustomerOrder).toBe(true)
    expect(FULL_ORDER_PDF_OPTIONS.showCustomerOrder).toBe(true)
    expect(parseOrderPdfOptions(new URLSearchParams()).showCustomerOrder).toBe(true)
    expect(parseOrderPdfOptions(new URLSearchParams('showCustomerOrder=false')).showCustomerOrder).toBe(false)
  })

  describe('Datenaufbereitung', () => {
    beforeEach(() => {
      findFirst.mockReset()
      vi.mocked(getOrderById).mockResolvedValue({
        id: 'order-1', offerId: 'offer-1', orderNumber: 'AU-1', orderDate: new Date('2026-08-19'),
        title: 'Montage', description: null, startDate: null, endDate: null,
        customerSnapshot: null, offer: { offerNumber: 'AN-1' },
        customer: { name: 'Kunde AG', contacts: [] }, items: [],
        totalNet: decimal(0), totalTax: decimal(0), totalGross: decimal(0),
      } as never)
      vi.mocked(getCompanySnapshot).mockResolvedValue({ companyName: 'TWIR GmbH', logoPath: null } as never)
      vi.mocked(loadCompanyLogoForPdf).mockResolvedValue(undefined)
    })

    it('übernimmt Kundenbestellnummer und -datum', async () => {
      findFirst.mockResolvedValue({ orderNumber: ' PO-9 ', orderDate: new Date('2026-09-01T12:00:00Z') })
      const data = await getOrderPdfData('order-1', EMPLOYEE_ORDER_PDF_OPTIONS)
      expect(data.customerOrderNumber).toBe('PO-9')
      expect(data.customerOrderDate).toBe('01.09.2026')
      expect(findFirst.mock.calls[0][0].where).toEqual({ OR: [{ orderId: 'order-1' }, { offerId: 'offer-1' }] })
    })

    it('lässt die Angaben ohne Kundenbestellung weg', async () => {
      findFirst.mockResolvedValue(null)
      const data = await getOrderPdfData('order-1', EMPLOYEE_ORDER_PDF_OPTIONS)
      expect(data).not.toHaveProperty('customerOrderNumber')
      expect(data).not.toHaveProperty('customerOrderDate')
    })

    it('liest nichts, wenn die Option deaktiviert ist', async () => {
      const data = await getOrderPdfData('order-1', { ...EMPLOYEE_ORDER_PDF_OPTIONS, showCustomerOrder: false })
      expect(findFirst).not.toHaveBeenCalled()
      expect(data).not.toHaveProperty('customerOrderNumber')
    })
  })
})

describe('WF-1A Umbenennung nur für PDF, Vorschau und Archiv', () => {
  it('setzt die Archivbezeichnung', () => {
    const archive = src('lib/documents/document-archive.service.ts')
    expect(archive).toContain('label: ORDER_CONFIRMATION_LABEL')
    expect(ORDER_CONFIRMATION_LABEL).toBe('Auftragsbestätigung')
  })

  it('schützt archivierte FINAL-Dokumente weiterhin vor Überschreiben', () => {
    const archive = src('lib/documents/document-archive.service.ts')
    expect(archive).toContain("if (lifecycle === 'FINAL' && existing?.archiveStatus === 'ARCHIVED') return null")
    expect(archive).toContain("lifecycle === 'FINAL' ? 'exclusive' : 'replace'")
  })

  it('benennt die Vorschau um, lässt Status- und Listentexte unverändert', () => {
    expect(src('components/orders/OrderPdfDialog.tsx')).toContain('Vorschau Auftragsbestätigung')
    expect(src('types/enums.ts')).not.toContain('Auftragsbestätigung')
    expect(src('lib/pdf-templates/order.template.tsx')).not.toMatch(/>Auftrag</)
  })
})
