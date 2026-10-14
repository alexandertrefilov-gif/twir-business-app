import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBusinessDocumentHeader, type HeaderPermissions } from '@/lib/workflow/document-header'
import { buildInvoiceHeaderFields, buildInvoiceRecipient, buildServiceDateFields } from '@/lib/workflow/invoice-header'
import type { BusinessProcessData } from '@/lib/services/business-process.service'

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const all: HeaderPermissions = {
  readOffer: true, readOrder: true, readServiceReport: true, readInvoice: true,
  readDocument: true, readProject: true, readCustomer: true,
}
const none: HeaderPermissions = {
  readOffer: false, readOrder: false, readServiceReport: false, readInvoice: false,
  readDocument: false, readProject: false, readCustomer: false,
}
const customer = { id: 'c1', name: 'Kunde AG' }

function proc(overrides: Partial<BusinessProcessData> = {}): BusinessProcessData {
  return {
    project: { id: 'p1', number: 'PR-1', name: 'Projekt' },
    offer: { id: 'o1', number: 'AN-1', status: 'CONVERTED_TO_ORDER' },
    order: { id: 'a1', number: 'AU-1', status: 'OPEN', confirmationDocuments: [{ id: 'd2', originalName: 'Annahme.pdf', mimeType: 'application/pdf' }] },
    serviceReports: [{ id: 's1', number: 'LN-1', status: 'FINALIZED' }],
    invoices: [
      { id: 'i1', number: 'RE-1', status: 'FINALIZED', type: 'STANDARD' },
      { id: 'i2', number: 'RE-2', status: 'FINALIZED', type: 'CANCELLATION' },
    ],
    customerPurchaseOrder: {
      id: 'k1', orderNumber: ' PO-4711 ', orderDate: new Date('2026-09-01T12:00:00'),
      documents: [{ id: 'd1', originalName: 'Bestellung.pdf', mimeType: 'application/pdf' }],
    },
    ...overrides,
  }
}

// currentInvoiceId === null → bewusst ohne bekannte aktuelle Rechnungs-ID
const buildInvoice = (p: BusinessProcessData, permissions: HeaderPermissions, currentInvoiceId: string | null = 'i1') =>
  buildBusinessDocumentHeader({ current: 'invoice', currentInvoiceId: currentInvoiceId ?? undefined, customer, process: p, permissions, dates: [] })

describe('WF-1B Kopfmodell für Rechnungen', () => {
  it('unterdrückt die Selbstreferenz und führt andere Rechnungen als „Weitere Rechnung“', () => {
    const model = buildInvoice(proc(), all)
    expect(model.references.map((r) => [r.label, r.number, r.href])).toEqual([
      ['Angebotsbezug', 'AN-1', '/offers/o1'],
      ['Auftrag', 'AU-1', '/orders/a1'],
      ['Leistungsnachweis', 'LN-1', '/services/s1'],
      ['Weitere Rechnung', 'RE-2 · Stornorechnung', '/invoices/i2'],
    ])
    expect(JSON.stringify(model.references)).not.toContain('/invoices/i1')
  })

  it('zeigt bei nur einer Rechnung keine Rechnungsbezüge', () => {
    const model = buildInvoice(proc({ invoices: [{ id: 'i1', number: 'RE-1', status: 'DRAFT' }] }), all)
    expect(model.references.some((r) => r.label.includes('Rechnung'))).toBe(false)
  })

  it('zeigt ohne bekannte aktuelle Rechnungs-ID keine Rechnungsbezüge (keine Selbstreferenz möglich)', () => {
    const model = buildInvoice(proc(), all, null)
    expect(model.references.some((r) => r.label.includes('Rechnung'))).toBe(false)
  })

  it('erfindet keine Storno-/Korrekturbeziehung: Typ wird nur als Dokumentart genannt', () => {
    const model = buildInvoice(proc({ invoices: [
      { id: 'i1', number: 'RE-1', status: 'FINALIZED', type: 'STANDARD' },
      { id: 'i3', number: 'RE-3', status: 'FINALIZED', type: 'CORRECTION' },
      { id: 'i4', number: 'Rechnungsentwurf', status: 'DRAFT', type: 'STANDARD' },
    ] }), all)
    const others = model.references.filter((r) => r.label === 'Weitere Rechnung').map((r) => r.number)
    expect(others).toEqual(['RE-3 · Korrekturrechnung', 'Rechnungsentwurf'])
    expect(JSON.stringify(model.references)).not.toMatch(/storniert|korrigiert|zu Rechnung/i)
  })

  it('verlinkt Bezüge nur mit Leserecht', () => {
    const model = buildInvoice(proc(), { ...none, readOrder: true })
    expect(model.references).toEqual([{ label: 'Auftrag', number: 'AU-1', href: '/orders/a1' }])
    expect(model.customerHref).toBeNull()
    expect(model.project).toBeNull()
    expect(model.documents).toEqual([])
  })

  it('erweitert ohne Leserechte keine Sichtbarkeit (anders als im Leistungsnachweis kein Auftragsbezug)', () => {
    const model = buildInvoice(proc(), none)
    expect(model.references).toEqual([])
    expect(model.project).toBeNull()
    expect(model.documents).toEqual([])
    expect(model.customerHref).toBeNull()
  })

  it('blendet weitere Rechnungen ohne Rechnungs-Leserecht aus', () => {
    const model = buildInvoice(proc(), { ...all, readInvoice: false })
    expect(model.references.some((r) => r.label === 'Weitere Rechnung')).toBe(false)
  })

  it('zeigt Projekt, Kundenbestellung und Dokumente nur wenn vorhanden und erlaubt', () => {
    const full = buildInvoice(proc(), all)
    expect(full.project).toEqual({ label: 'Projekt', number: 'PR-1 · Projekt', href: '/projects/p1' })
    expect(full.customerOrderNumber).toBe('PO-4711')
    expect(full.customerOrderDate).toBe('01.09.2026')
    expect(full.documents.map((d) => d.group)).toEqual(['Kundenbestellung', 'Auftragsunterlagen'])
    expect(full.customerHref).toBe('/customers/c1')

    const bare = buildInvoice(proc({ project: null, offer: null, order: null, serviceReports: [], customerPurchaseOrder: null }), all)
    expect(bare.project).toBeNull()
    expect(bare.customerOrderNumber).toBeNull()
    expect(bare.customerOrderDate).toBeNull()
    expect(bare.documents).toEqual([])
    expect(bare.references.map((r) => r.label)).toEqual(['Weitere Rechnung'])
  })

  it('übernimmt die Rechnungsadresse nur, wenn sie übergeben wird', () => {
    const recipient = { sourceLabel: 'Kundenadresse', name: 'Kunde AG', additional: null, contactName: null, email: null, vatId: null, lines: ['Weg 1'] }
    const withRecipient = buildBusinessDocumentHeader({ current: 'invoice', currentInvoiceId: 'i1', customer, process: proc(), permissions: all, dates: [], recipient })
    expect(withRecipient.recipient).toEqual(recipient)
    expect('recipient' in buildInvoice(proc(), all)).toBe(false)
  })

  it('trennt Kunde (Stammdatensatz) von der Rechnungsadresse (Snapshot)', () => {
    const recipient = buildInvoiceRecipient({ recipientSource: 'BILLING', name: 'Buchhaltung GmbH', street: 'Weg', houseNumber: '2', postalCode: '70372', city: 'Stuttgart', country: 'DE' })
    const model = buildBusinessDocumentHeader({ current: 'invoice', currentInvoiceId: 'i1', customer, process: proc(), permissions: all, dates: [], recipient })
    expect(model.customer.name).toBe('Kunde AG')
    expect(model.customer.street).toBeUndefined()
    expect(model.recipient?.name).toBe('Buchhaltung GmbH')
  })
})

describe('WF-1B Regression Angebot / Auftrag / Leistungsnachweis', () => {
  const build = (current: 'offer' | 'order' | 'serviceReport') =>
    buildBusinessDocumentHeader({ current, customer, process: proc(), permissions: all, dates: [] })

  it('listet auf anderen Seiten weiterhin alle Rechnungen als „Rechnung“', () => {
    for (const current of ['offer', 'order', 'serviceReport'] as const) {
      const invoices = build(current).references.filter((r) => r.label === 'Rechnung')
      expect(invoices.map((r) => [r.number, r.href])).toEqual([['RE-1', '/invoices/i1'], ['RE-2', '/invoices/i2']])
    }
  })

  it('führt keine Rechnungsadresse und keine neuen Felder in den bestehenden Modellen ein', () => {
    for (const current of ['offer', 'order', 'serviceReport'] as const) {
      const model = build(current)
      expect('recipient' in model).toBe(false)
      expect(Object.keys(model).sort()).toEqual(['customer', 'customerHref', 'customerOrderDate', 'customerOrderNumber', 'documents', 'fields', 'project', 'references'].sort())
    }
  })

  it('behält Verhalten: Leistungsnachweis zeigt Auftragsbezug ohne Link, Auftrag lässt sich selbst weg', () => {
    const sr = buildBusinessDocumentHeader({ current: 'serviceReport', customer, process: proc(), permissions: { ...none, readServiceReport: true }, dates: [] })
    expect(sr.references).toEqual([{ label: 'Auftrag', number: 'AU-1', href: null }])
    expect(build('order').references.some((r) => r.label === 'Auftrag')).toBe(false)
    expect(build('offer').references.some((r) => r.label === 'Angebotsbezug')).toBe(false)
  })
})

describe('WF-1B Rechnungsadresse aus dem Snapshot', () => {
  it('CUSTOMER: kennzeichnet die Kundenadresse', () => {
    const r = buildInvoiceRecipient({ recipientSource: 'CUSTOMER', name: 'Muster GmbH', street: 'Hauptstr.', houseNumber: '5', postalCode: '70173', city: 'Stuttgart', country: 'DE', vatId: 'DE123456789' })
    expect(r).toEqual({ sourceLabel: 'Kundenadresse', name: 'Muster GmbH', additional: null, contactName: null, email: null, vatId: 'DE123456789', lines: ['Hauptstr. 5', '70173 Stuttgart'] })
  })

  it('BILLING: kennzeichnet die hinterlegte Rechnungsadresse inkl. Zusatz, Kontakt und E-Mail', () => {
    const r = buildInvoiceRecipient({ recipientSource: 'BILLING', billingAddressId: 'x', name: 'Kunde GmbH', additional: 'Buchhaltung', contactName: 'Anna Test', email: 'rechnung@example.de', street: 'Rechnungsweg', houseNumber: '2', postalCode: '70372', city: 'Stuttgart', country: 'DE' })
    expect(r?.sourceLabel).toBe('Hinterlegte Rechnungsadresse')
    expect(r).toMatchObject({ additional: 'Buchhaltung', contactName: 'Anna Test', email: 'rechnung@example.de', lines: ['Rechnungsweg 2', '70372 Stuttgart'] })
  })

  it('CUSTOM: kennzeichnet die einmalige Rechnungsadresse und nennt das Ausland', () => {
    const r = buildInvoiceRecipient({ recipientSource: 'CUSTOM', name: 'Einmalig AG', street: 'Ring', houseNumber: null, postalCode: '1010', city: 'Wien', country: 'AT' })
    expect(r?.sourceLabel).toBe('Einmalige Rechnungsadresse')
    expect(r?.lines).toEqual(['Ring', '1010 Wien', 'AT'])
  })

  it('Altbestand ohne Quelle: Adresse wird gezeigt, die Quelle wird nicht erfunden', () => {
    const r = buildInvoiceRecipient({ name: 'Alt GmbH', street: 'Weg', postalCode: '70000', city: 'Ort' })
    expect(r?.sourceLabel).toBeNull()
    expect(r?.name).toBe('Alt GmbH')
    expect(buildInvoiceRecipient({ recipientSource: 'constructor', name: 'X' })?.sourceLabel).toBeNull()
  })

  it('liefert ohne auswertbaren Snapshot keinen Block', () => {
    for (const value of [null, undefined, 'text', 42, [], {}, { name: '  ' }, { street: 'Weg' }]) {
      expect(buildInvoiceRecipient(value)).toBeNull()
    }
  })

  it('lässt leere Teile weg und erzeugt keine „undefined“/„null“-Texte', () => {
    const r = buildInvoiceRecipient({ recipientSource: 'CUSTOM', name: ' Nur Name ', additional: '', contactName: '  ', email: null, street: null, houseNumber: null, postalCode: null, city: null, country: null })
    expect(r).toEqual({ sourceLabel: 'Einmalige Rechnungsadresse', name: 'Nur Name', additional: null, contactName: null, email: null, vatId: null, lines: [] })
    expect(JSON.stringify(r)).not.toMatch(/undefined/)
  })
})

describe('WF-1B Leistungsdatum, Leistungszeitraum und Rechnungsfelder', () => {
  // Kalendertage sind UTC-Mitternacht (REQ-029/B-3); Zeitpunkte werden in Europe/Berlin dargestellt.
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

  it('zeigt das Leistungsdatum', () => {
    expect(buildServiceDateFields({ deliveryDate: d('2026-09-10') })).toEqual([{ label: 'Leistungsdatum', value: '10. September 2026' }])
  })

  it('zeigt einen vollständigen Leistungszeitraum', () => {
    expect(buildServiceDateFields({ deliveryPeriodStart: d('2026-09-01'), deliveryPeriodEnd: d('2026-09-30') }))
      .toEqual([{ label: 'Leistungszeitraum', value: '01. September 2026 – 30. September 2026' }])
  })

  it('zeigt einen unvollständigen Zeitraum ehrlich als „ab“ oder „bis“', () => {
    expect(buildServiceDateFields({ deliveryPeriodStart: d('2026-09-01') })[0].value).toBe('ab 01. September 2026')
    expect(buildServiceDateFields({ deliveryPeriodEnd: d('2026-09-30') })[0].value).toBe('bis 30. September 2026')
  })

  it('zeigt Datum und Zeitraum beide, wenn beide gespeichert sind, und sonst nichts', () => {
    expect(buildServiceDateFields({ deliveryDate: d('2026-09-10'), deliveryPeriodStart: d('2026-09-01'), deliveryPeriodEnd: d('2026-09-30') }).map((f) => f.label))
      .toEqual(['Leistungsdatum', 'Leistungszeitraum'])
    expect(buildServiceDateFields({})).toEqual([])
    expect(buildServiceDateFields({ deliveryDate: null, deliveryPeriodStart: null, deliveryPeriodEnd: null })).toEqual([])
  })

  it('liefert die Rechnungsfelder in fester Reihenfolge ohne leere Zeilen', () => {
    const fields = buildInvoiceHeaderFields({
      invoiceDate: d('2026-10-01'), deliveryDate: d('2026-09-10'), dueDate: d('2026-10-31'),
      finalizedAt: new Date('2026-10-02T12:30:00.000Z'), sentAt: new Date('2026-10-03T10:00:00.000Z'), supplierNumber: ' 4711 ',
    })
    expect(fields).toEqual([
      { label: 'Rechnungsdatum', value: '01. Oktober 2026' },
      { label: 'Leistungsdatum', value: '10. September 2026' },
      { label: 'Zahlungsziel', value: '31. Oktober 2026' },
      { label: 'Finalisiert am', value: '02.10.2026 14:30' },
      { label: 'Versendet am', value: '03.10.2026' },
      { label: 'Lieferantennummer', value: '4711' },
    ])
  })

  it('stellt Zeitpunkte in Europe/Berlin und Kalendertage zeitzonenunabhängig dar (REQ-029/B-3)', () => {
    const fields = buildInvoiceHeaderFields({
      invoiceDate: new Date('2026-10-20T17:42:00.000Z'), dueDate: new Date('2026-10-19T22:00:00.000Z'),
      finalizedAt: new Date('2026-10-02T22:30:00.000Z'), sentAt: new Date('2026-10-02T22:30:00.000Z'),
    })
    expect(fields).toEqual([
      { label: 'Rechnungsdatum', value: '20. Oktober 2026' },
      { label: 'Zahlungsziel', value: '19. Oktober 2026' },
      { label: 'Finalisiert am', value: '03.10.2026 00:30' },
      { label: 'Versendet am', value: '03.10.2026' },
    ])
  })

  it('lässt fehlende optionale Werte vollständig weg', () => {
    expect(buildInvoiceHeaderFields({ invoiceDate: d('2026-10-01'), dueDate: null, finalizedAt: null, sentAt: undefined, supplierNumber: '  ' }))
      .toEqual([{ label: 'Rechnungsdatum', value: '01. Oktober 2026' }])
  })
})

describe('WF-1B Rechnungsseite (Quelltext-Verträge)', () => {
  const page = src('app/(dashboard)/invoices/[id]/page.tsx')

  it('nutzt das gemeinsame Kopfmodell mit Rechnungs-Kontext und Snapshot-Adresse', () => {
    expect(page).toContain("current: 'invoice'")
    expect(page).toContain('currentInvoiceId: invoice.id')
    expect(page).toContain('buildInvoiceRecipient(invoice.customerSnapshot)')
    expect(page).toContain('getHeaderPermissions(processPermissions)')
    expect(page).toContain('<BusinessDocumentMeta')
    expect(page).toContain('customer: { id: invoice.customerId, name: invoice.customer.name }')
  })

  it('enthält keine ungeprüften Einzel-Links und keine Platzhalter-Gedankenstriche mehr im Kopf', () => {
    expect(page).not.toContain('HeaderReference')
    expect(page).not.toContain('HeaderValue')
    expect(page).not.toContain("value ?? '—'")
    expect(page).toContain('invoice.order && headerPermissions.readOrder')
    expect(page).toContain('headerPermissions.readCustomer')
    expect(page).toContain('headerPermissions.readOrder ? invoice.order?.title : undefined')
  })

  it('löst das Projekt nur mit Leserecht und nur ergänzend auf', () => {
    expect(page).toContain('!process.project && headerPermissions.readProject')
    expect(page).toContain('getInvoiceHeaderProject(invoice.projectId)')
  })

  it('belässt Snapshot-, Positions-, Zahlungs- und Mahnlogik der Seite', () => {
    expect(page).toContain('invoice.customerSnapshot')
    expect(page).toContain('invoice.companySnapshot')
    expect(page).toContain('title="Rechnungsparteien"')
    expect(page).toContain('<InvoiceActions')
    expect(page).toContain('<PaymentJournal')
    expect(page).toContain('<DunningPanel')
    expect(page).toContain('<BusinessProcessWorkflow')
  })

  it('Projekt-Lesedienst ist rein lesend', () => {
    const service = src('lib/services/invoice-header-project.service.ts')
    expect(service).toContain('findFirst')
    expect(service).toContain('deletedAt: null')
    expect(service).not.toMatch(/\.(create|update|upsert|delete|deleteMany|updateMany)\(/)
  })

  it('Header-Hilfen sind rein und ohne Datenbankzugriff', () => {
    const helper = src('lib/workflow/invoice-header.ts')
    expect(helper).not.toContain('prisma')
    expect(helper).not.toContain('hasPermission')
  })
})
