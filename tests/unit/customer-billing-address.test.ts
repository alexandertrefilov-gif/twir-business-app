import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CustomerBillingAddress Datenintegrität', () => {
  const migration = readFileSync(resolve(process.cwd(), 'prisma/migrations_archive_20260915_pre_canonical_baseline/20260903160000_share_customer_addresses/migration.sql'), 'utf8')
  const service = readFileSync(resolve(process.cwd(), 'lib/services/customer-address.service.ts'), 'utf8')

  it('begrenzt Standards pro Kunde und ignoriert Soft-Deletes', () => {
    expect(migration).toContain('WHERE "is_default" = true AND "is_active" = true AND "deleted_at" IS NULL')
  })

  it('migriert nur vollständige aktivierte Legacy-Adressen und höchstens eine je Kunde', () => {
    expect(migration).toContain('FROM "customer_billing_addresses"')
    expect(migration).not.toContain('DROP TABLE')
    expect(migration).toContain('ON CONFLICT ("customer_id", "address_id", "type") DO NOTHING')
  })

  it('deaktiviert und löscht Standards ohne Nachfolgeadresse', () => {
    expect(service).toContain('const isDefault = isActive && requestedDefault')
    expect(service).toContain('deletedAt: new Date(), isActive: false, isDefault: false')
    expect(service).not.toContain('Nachfolgeadresse')
  })
})
