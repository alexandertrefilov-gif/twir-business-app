import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  archiveRoot: '',
  introText: '',
  storagePath: '',
  directOrders: [] as Array<Record<string, unknown>>,
  freeInvoices: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    companySetting: {
      findFirst: vi.fn(async () => ({
        documentArchiveEnabled: true,
        documentArchivePath: state.archiveRoot,
      })),
    },
    document: {
      count: vi.fn(async () => 1),
    },
    offer: {
      findMany: vi.fn(async () => [{
        id: 'test-id',
        offerNumber: 'AN 260901',
        offerDate: new Date('2026-09-01T00:00:00.000Z'),
        areaName: 'GGA-Lagerplanung',
        title: 'Koordination / Fachbauleitung GGA-Schränke',
        introText: state.introText,
        customer: { number: 'KD-0004', name: 'Mike Werner' },
        documents: [{ storagePath: state.storagePath }],
        customerPurchaseOrder: { orderNumber: '4500123456', documents: [] },
        order: {
          orderNumber: 'AU-260901',
          documents: [],
          serviceReports: [{ reportNumber: 'LN-260901', documents: [] }],
          invoices: [{ invoiceNumber: 'RE-260901', documents: [] }],
        },
      }]),
    },
    order: { findMany: vi.fn(async () => state.directOrders) },
    invoice: { findMany: vi.fn(async () => state.freeInvoices) },
  },
}))

import { getArchiveExplorer } from '@/lib/documents/archive-explorer.service'
import { encodeOfferText } from '@/lib/offers/rich-text'

function projectIntro(project: string) {
  return encodeOfferText({
    version: 1,
    sections: [{
      id: 'project-data',
      title: '',
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Projekt:', marks: [{ type: 'bold' }] }] },
          { type: 'paragraph', content: [{ type: 'text', text: project }] },
        ],
      },
    }],
  })
}

describe('sichtbarer Angebotsordner im Dokumentarchiv', () => {
  beforeEach(async () => {
    state.archiveRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'twir-offer-display-'))
    const directory = path.join(
      '2026', 'KD-0004_Mike-Werner', 'GGA-Lagerplanung', '01_Angebote', 'AN-260901',
    )
    state.storagePath = path.join(directory, 'AN-260901_ENTWURF.pdf')
    state.introText = projectIntro('Ki_02_003 – Umstellung von Geb. 2 nach Geb. 7 Versuchsgießerei ISH')
    state.directOrders = []
    state.freeInvoices = []
    await fs.mkdir(path.join(state.archiveRoot, directory), { recursive: true })
    await fs.writeFile(path.join(state.archiveRoot, state.storagePath), '%PDF-test')
  })

  afterEach(async () => {
    await fs.rm(state.archiveRoot, { recursive: true, force: true })
  })

  it('projects a legacy offer into the current business-case hierarchy without moving its file', async () => {
    const physicalDirectory = path.dirname(state.storagePath)
    const areaDirectory = path.join('2026', 'KD-0004_Mike-Werner', 'GGA-Lagerplanung')
    const technicalDirectory = path.join(areaDirectory, 'Vorgang_offer-test-id')

    const listing = await getArchiveExplorer({ currentPath: areaDirectory })
    expect(listing.entries).toMatchObject([{
      name: 'Vorgang_offer-test-id',
      displayName: 'Ki_02_003 – Umstellung von Geb. 2 nach Geb. 7 Versuchsgießerei ISH',
      relativePath: technicalDirectory,
    }])
    expect(listing.entries[0].displayName).not.toBe('AN-260901 – GGA-Lagerplanung')
    expect(listing.entries[0].displayName).not.toContain('Vorgang_offer-')

    const reloaded = await getArchiveExplorer({ currentPath: technicalDirectory })
    expect(reloaded.breadcrumbs.at(-1)?.label)
      .toBe('Ki_02_003 – Umstellung von Geb. 2 nach Geb. 7 Versuchsgießerei ISH')
    expect(reloaded.breadcrumbs.map(crumb => crumb.label).join(' ')).not.toContain('Vorgang_offer-')
    expect(reloaded.entries.map(entry => entry.displayName)).toEqual([
      '01 Angebot', '02 Kundenbestellung', '03 Auftrag', '04 Leistungsnachweis', '05 Rechnung',
    ])

    const emptyOrderCategory = await getArchiveExplorer({ currentPath: path.join(technicalDirectory, '03_Auftrag') })
    expect(emptyOrderCategory.available).toBe(true)
    expect(emptyOrderCategory.entries).toEqual([])

    for (const query of ['Ki_02_003', 'Versuchsgießerei ISH']) {
      const search = await getArchiveExplorer({ search: query })
      expect(search.entries).toHaveLength(1)
      expect(search.entries[0].displayParentPath).toContain(
        'Ki_02_003 – Umstellung von Geb. 2 nach Geb. 7 Versuchsgießerei ISH',
      )
      expect(search.entries[0].displayParentPath).not.toContain('Vorgang_offer-')
    }

    for (const query of ['AN 260901', 'AU-260901', '4500123456', 'LN-260901', 'RE-260901', 'Mike Werner', 'GGA-Lagerplanung', 'Koordination / Fachbauleitung']) {
      const search = await getArchiveExplorer({ search: query })
      expect(search.entries).toHaveLength(1)
    }

    state.introText = projectIntro('Aktualisierte Projektkennung – Versuchsgießerei ISH')
    const updated = await getArchiveExplorer({ currentPath: technicalDirectory })
    expect(updated.breadcrumbs.at(-1)).toEqual({
      label: 'Aktualisierte Projektkennung – Versuchsgießerei ISH',
      path: technicalDirectory,
    })
    expect(path.basename(technicalDirectory)).toBe('Vorgang_offer-test-id')
    await expect(fs.stat(path.join(state.archiveRoot, technicalDirectory))).rejects.toThrow()
    await expect(fs.stat(path.join(state.archiveRoot, physicalDirectory))).resolves.toBeDefined()

    const updatedSearch = await getArchiveExplorer({ search: 'Aktualisierte Projektkennung' })
    expect(updatedSearch.entries).toHaveLength(1)
    expect(updatedSearch.entries[0].displayParentPath)
      .toContain('Aktualisierte Projektkennung – Versuchsgießerei ISH')
  })

  it('shows understandable fallback names for direct orders and free invoices', async () => {
    const orderDirectory = path.join('2026', 'KD-0004_Mike-Werner', 'Direktprojekt', 'Vorgang_order-order-id')
    const orderFile = path.join(orderDirectory, '03_Auftrag', 'AU-260999_FINAL.pdf')
    const invoiceDirectory = path.join('2026', 'KD-0004_Mike-Werner', 'Allgemein', 'Vorgang_invoice-invoice-id')
    const invoiceFile = path.join(invoiceDirectory, '05_Rechnung', 'RE-260999_FINAL.pdf')
    state.directOrders = [{
      id: 'order-id', orderNumber: 'AU-260999', title: 'Direktprojekt',
      customer: { number: 'KD-0004', name: 'Mike Werner' },
      documents: [{ storagePath: orderFile }], serviceReports: [], invoices: [],
    }]
    state.freeInvoices = [{
      id: 'invoice-id', invoiceNumber: 'RE-260999',
      customer: { number: 'KD-0004', name: 'Mike Werner' },
      documents: [{ storagePath: invoiceFile }],
    }]
    await fs.mkdir(path.join(state.archiveRoot, path.dirname(orderFile)), { recursive: true })
    await fs.mkdir(path.join(state.archiveRoot, path.dirname(invoiceFile)), { recursive: true })
    await fs.writeFile(path.join(state.archiveRoot, orderFile), '%PDF-order')
    await fs.writeFile(path.join(state.archiveRoot, invoiceFile), '%PDF-invoice')

    const order = await getArchiveExplorer({ currentPath: path.dirname(orderDirectory) })
    expect(order.entries.find(entry => entry.relativePath === orderDirectory)?.displayName)
      .toBe('Auftrag AU-260999 – Direktprojekt')
    const invoice = await getArchiveExplorer({ currentPath: path.dirname(invoiceDirectory) })
    expect(invoice.entries.find(entry => entry.relativePath === invoiceDirectory)?.displayName)
      .toBe('Rechnung RE-260999')
  })
})
