import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { InvoiceDraftSchema } from '@/lib/validators/invoice.schema'
import { CustomerBillingAddressSchema } from '@/lib/validators/customer-billing-address.schema'
import { buildBillingAddressSnapshot } from '@/lib/services/invoice.service'

const invoiceBase = { customerId: '00000000-0000-4000-8000-000000000001', invoiceDate: new Date(), items: [{ position: 1, description: 'Leistung', quantity: 1, unit: 'Std.', unitPrice: 100, taxRate: 19 }] }

describe('Rechnungsempfänger', () => {
  it('speichert die gewählte Adresse vollständig als unabhängigen Snapshot', () => {
    const address = { id: '00000000-0000-4000-8000-000000000002', companyName: 'Kunde GmbH', additional: 'Buchhaltung', contactName: 'Anna Test', email: 'rechnung@example.de', street: 'Rechnungsweg', houseNumber: '2', postalCode: '70372', city: 'Stuttgart', country: 'DE' }
    const snapshot = buildBillingAddressSnapshot({ vatId: 'DE123456789', taxNumber: null }, address)
    expect(snapshot).toMatchObject({ recipientSource: 'BILLING', billingAddressId: address.id, name: 'Kunde GmbH', contactName: 'Anna Test', street: 'Rechnungsweg' })
    address.street = 'Später geändert'
    expect(snapshot.street).toBe('Rechnungsweg')
  })

  it('verlangt für eine hinterlegte Rechnungsadresse deren ID', () => {
    expect(InvoiceDraftSchema.safeParse({ ...invoiceBase, invoiceRecipientSource: 'BILLING' }).success).toBe(false)
    expect(InvoiceDraftSchema.safeParse({ ...invoiceBase, invoiceRecipientSource: 'BILLING', billingAddressId: '00000000-0000-4000-8000-000000000002' }).success).toBe(true)
  })

  it('validiert Pflichtfelder der Rechnungsadresse', () => {
    expect(CustomerBillingAddressSchema.safeParse({ label: 'Zentrale', companyName: 'Kunde GmbH', street: 'Weg', postalCode: '70173', city: 'Stuttgart', country: 'DE' }).success).toBe(true)
    expect(CustomerBillingAddressSchema.safeParse({ label: '', companyName: '', street: '', postalCode: '', city: '', country: 'DE' }).success).toBe(false)
  })

  it('bewahrt den Entwurfs-Snapshot bei Finalisierung und nutzt Kontaktangaben im PDF', () => {
    const service = readFileSync(resolve(process.cwd(), 'lib/services/invoice.service.ts'), 'utf8')
    const pdf = readFileSync(resolve(process.cwd(), 'lib/services/invoice-pdf.service.ts'), 'utf8')
    expect(service).toContain('invoice.customerSnapshot ?? buildCustomerSnapshot(invoice.customer)')
    expect(pdf).toContain("contactName: text(storedCustomer, 'contactName')")
  })

  it('bietet nur aktive, nicht gelöschte Adressen an', () => {
    const page = readFileSync(resolve(process.cwd(), 'app/(dashboard)/invoices/new/page.tsx'), 'utf8')
    expect(page).toContain("addresses: { where: { type: 'BILLING', deletedAt: null, isActive: true }")
  })
})
