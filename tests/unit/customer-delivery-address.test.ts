import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CustomerDeliveryAddressSchema } from '@/lib/validators/customer-delivery-address.schema'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const valid = {
  label: 'Werk Untertürkheim', companyName: 'Mercedes-Benz AG', additional: 'Werk 10',
  street: 'Mercedesstraße', houseNumber: '120', postalCode: '70372', city: 'Stuttgart',
  country: 'DE', contactName: 'Max Mustermann', email: 'werk@example.test', phone: '+49 711 1234',
  isActive: true, isDefault: false,
}

describe('CustomerDeliveryAddress', () => {
  const schema = source('prisma/schema.prisma')
  const migration = source('prisma/migrations_archive_20260915_pre_canonical_baseline/20260903160000_share_customer_addresses/migration.sql')
  const service = source('lib/services/customer-address.service.ts')
  const actions = source('app/(dashboard)/customers/[id]/delivery-addresses/actions.ts')
  const detail = source('app/(dashboard)/customers/[id]/page.tsx')

  it('modelliert Liefer- und Rechnungsadressen über dieselbe zentrale Adresse', () => {
    expect(schema).toContain('model Address')
    expect(schema).toContain('model CustomerAddress')
    expect(schema).toContain('SHIPPING')
    expect(migration).toContain('FROM "customer_delivery_addresses"')
  })

  it('erlaubt höchstens eine aktive, nicht gelöschte Standardadresse pro Kunde', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "customer_addresses_one_active_default_per_type"')
    expect(migration).toContain('WHERE "is_default" = true AND "is_active" = true AND "deleted_at" IS NULL')
    expect(service).toContain('where: { customerId, type, deletedAt: null, isActive: true, isDefault: true')
  })

  it('setzt beim Standardwechsel andere aktive Standards transaktional zurück', () => {
    expect(service).toContain('setDefaultCustomerAddress')
    expect(service).toContain('tx.customerAddress.updateMany')
    expect(service).toContain('data: { isDefault: false }')
    expect(service).toContain('tx.customerAddress.update({ where: { id: assignmentId }, data: { isDefault: true } })')
  })

  it('deaktiviert und löscht ohne automatische Nachfolgeadresse', () => {
    expect(service).toContain("data: { isActive, ...(!isActive && { isDefault: false }) }")
    expect(service).toContain('deletedAt: new Date(), isActive: false, isDefault: false')
    expect(service).not.toContain('Nachfolgeadresse')
  })

  it('prüft die Customer-Zugehörigkeit bei jeder adressbezogenen Mutation', () => {
    expect(service).toContain('where: { id: assignmentId, customerId, type, deletedAt: null }')
    expect(service.match(/getCustomerAddress\(customerId, assignmentId, type\)/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('validiert Pflichtfelder, PLZ und E-Mail serverseitig', () => {
    expect(CustomerDeliveryAddressSchema.safeParse(valid).success).toBe(true)
    expect(CustomerDeliveryAddressSchema.safeParse({ ...valid, street: '' }).success).toBe(false)
    expect(CustomerDeliveryAddressSchema.safeParse({ ...valid, postalCode: 'ABC' }).success).toBe(false)
    expect(CustomerDeliveryAddressSchema.safeParse({ ...valid, email: 'ungueltig' }).success).toBe(false)
  })

  it('normalisiert optionale Werte und ISO-Land', () => {
    const parsed = CustomerDeliveryAddressSchema.parse({ ...valid, additional: '', email: '', phone: '', country: 'de' })
    expect(parsed).toMatchObject({ additional: null, email: null, phone: null, country: 'DE' })
  })

  it('erzwingt Permissions serverseitig für alle Actions', () => {
    expect(actions.match(/requirePermission\(Resource\.CUSTOMER, Action\.UPDATE\)/g)).toHaveLength(4)
    expect(actions).toContain('requirePermission(Resource.CUSTOMER, Action.DELETE)')
  })

  it('schreibt minimales Audit innerhalb derselben Transaktionen', () => {
    expect(service.match(/prisma\.\$transaction/g)?.length).toBeGreaterThanOrEqual(5)
    expect(service.match(/buildAuditLogCreate\(tx,/g)?.length).toBeGreaterThanOrEqual(5)
    expect(service).toContain("entityType: 'customer_address'")
  })

  it('zeigt Lieferadressen nach Rechnungsadressen und vor Ansprechpartnern', () => {
    const billing = detail.indexOf('Rechnungsadressen (')
    const delivery = detail.indexOf('Lieferadressen (')
    const contacts = detail.indexOf('Ansprechpartner (')
    expect(billing).toBeGreaterThan(0)
    expect(delivery).toBeGreaterThan(billing)
    expect(contacts).toBeGreaterThan(delivery)
    expect(detail).toContain('CustomerDeliveryAddressActions')
  })
})
