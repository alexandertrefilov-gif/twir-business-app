import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AddressSearchSchema, CustomerAddressInputSchema } from '@/lib/validators/customer-address.schema'
import { buildAddressNormalizedKey } from '@/lib/services/customer-address.service'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('gemeinsamer Adressbestand', () => {
  const schema = source('prisma/schema.prisma')
  const migration = source('prisma/migrations_archive_20260915_pre_canonical_baseline/20260903160000_share_customer_addresses/migration.sql')
  const normalizedKeyMigration = source('prisma/migrations_archive_20260915_pre_canonical_baseline/20260903170000_add_address_normalized_key/migration.sql')
  const service = source('lib/services/customer-address.service.ts')
  const picker = source('components/customers/CustomerAddressPicker.tsx')

  it('erlaubt eine Adresse bei mehreren Kunden und beiden Adresstypen', () => {
    expect(schema).toContain('customerAddresses CustomerAddress[]')
    expect(schema).toContain('@@unique([customerId, addressId, type])')
    expect(schema).toContain('BILLING')
    expect(schema).toContain('SHIPPING')
  })

  it('migriert und dedupliziert Rechnungs- und Lieferadressen ohne Legacy-Tabellen zu löschen', () => {
    expect(migration).toContain('UNION ALL')
    expect(migration).toContain('normalized_key')
    expect(migration).toContain('GROUP BY "normalized_key"')
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/)
    expect(normalizedKeyMigration).toContain('CREATE UNIQUE INDEX "addresses_normalized_key_key"')
  })

  it('normalisiert Dubletten unabhängig von Großschreibung und Leerzeichen', () => {
    const first = buildAddressNormalizedKey({ companyName: ' TWIR GmbH ', street: 'Neue  Straße', houseNumber: '1', postalCode: '71706', city: 'Markgröningen', country: 'DE' })
    const second = buildAddressNormalizedKey({ companyName: 'twir gmbh', street: 'neue straße', houseNumber: '1', postalCode: '71706', city: 'markgröningen', country: 'de' })
    expect(first).toBe(second)
  })

  it('sucht serverseitig, erst ab zwei Zeichen und mit Ergebnislimit', () => {
    expect(AddressSearchSchema.safeParse('a').success).toBe(false)
    expect(AddressSearchSchema.safeParse('ab').success).toBe(true)
    expect(service).toContain('take: 20')
    expect(service).toContain('customerAddresses: { some:')
  })

  it('verwendet einen gemeinsamen Picker für bestehende und neue Adressen', () => {
    expect(picker).toContain('Bestehende Adresse')
    expect(picker).toContain('Neue Adresse')
    expect(picker).toContain('Bestehende verwenden')
    expect(picker).toContain("type: 'BILLING' | 'SHIPPING'")
  })

  it('erstellt Adresse, Zuordnung und beide Audits atomar', () => {
    const createStart = service.indexOf('createAndAssignCustomerAddress')
    const assignStart = service.indexOf('assignExistingCustomerAddress')
    const block = service.slice(createStart, assignStart)
    expect(block).toContain('prisma.$transaction')
    expect(block).toContain('tx.address.create')
    expect(block).toContain('tx.customerAddress.create')
    expect(block.match(/buildAuditLogCreate\(tx,/g)).toHaveLength(2)
  })

  it('entfernt nur die Zuordnung und nie die zentrale Adresse', () => {
    const removeBlock = service.slice(service.indexOf('removeCustomerAddress'))
    expect(removeBlock).toContain('tx.customerAddress.update')
    expect(removeBlock).not.toContain('tx.address.delete')
  })

  it('validiert gemeinsame neue Rechnungs- und Lieferadressen', () => {
    const valid = { label: 'Werk', companyName: 'TWIR', additional: null, street: 'Teststraße', houseNumber: '1', postalCode: '71706', city: 'Markgröningen', country: 'de', contactName: null, email: '', phone: '', isActive: true, isDefault: false }
    expect(CustomerAddressInputSchema.parse(valid)).toMatchObject({ country: 'DE', email: null, phone: null })
  })

  it('warnt beim Bearbeiten einer geteilten Adresse vor der kundenübergreifenden Wirkung', () => {
    const notice = source('components/customers/SharedAddressNotice.tsx')
    expect(service).toContain('export async function getAddressCoUsers')
    expect(service).toContain('customerId: { not: exceptCustomerId }')
    expect(notice).toContain('Gemeinsam genutzte Adresse.')
    expect(notice).toContain('gelten dort ebenfalls')
    expect(notice).toContain('bleiben nur für diesen Kunden gültig')
    for (const page of [
      'app/(dashboard)/customers/[id]/billing-addresses/[addressId]/edit/page.tsx',
      'app/(dashboard)/customers/[id]/delivery-addresses/[addressId]/edit/page.tsx',
    ]) {
      expect(source(page)).toContain('getAddressCoUsers(address.addressId, id)')
      expect(source(page)).toContain('sharedWith={sharedWith}')
    }
    for (const form of ['components/customers/CustomerBillingAddressForm.tsx', 'components/customers/CustomerDeliveryAddressForm.tsx']) {
      expect(source(form)).toContain('<SharedAddressNotice sharedWith={sharedWith} />')
    }
  })
})
