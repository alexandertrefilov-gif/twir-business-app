import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('manuelle Angebotsnummer', () => {
  const editor = source('components/offers/OfferNumberEditor.tsx')
  const form = source('components/offers/OfferForm.tsx')
  const page = source('app/(dashboard)/offers/[id]/edit/page.tsx')
  const action = source('app/(dashboard)/offers/actions.ts')
  const service = source('lib/services/offer.service.ts')
  const schema = source('prisma/schema.prisma')

  it('ist zunächst gesperrt und verlangt die ausdrückliche Freigabe', () => {
    expect(editor).toContain("const [isEditing, setIsEditing] = useState(false)")
    expect(editor).toContain('Angebotsnummer manuell ändern')
    expect(editor).toContain('Änderungen werden protokolliert.')
    expect(editor).toContain('Bearbeitung freigeben')
    expect(editor).toContain('Speichern')
    expect(editor).toContain('Abbrechen')
  })

  it('bindet die Änderung nur in die bestehende Entwurfs-Bearbeitungsseite ein', () => {
    expect(page).toContain("if (offer.status !== 'DRAFT')")
    expect(page).toContain('changeOfferNumberAction.bind(null, offer.id)')
    expect(form).toContain("mode === 'edit' && offerNumber && changeNumberAction")
  })

  it('erzwingt Berechtigung, Validierung und Revalidierung auf dem Server', () => {
    expect(action).toContain('requirePermission(Resource.OFFER, Action.UPDATE)')
    expect(action).toContain('OfferNumberChangeSchema.safeParse')
    expect(action).toContain('changeOfferNumber(offerId')
    expect(action).toContain('revalidatePath(`/offers/${offerId}/edit`)')
  })

  it('ändert Nummer und Audit-Eintrag atomar und erhält die ID-Referenzen', () => {
    expect(service).toContain('await prisma.$transaction(async (tx) =>')
    expect(service).toContain("action: AuditAction.OFFER_NUMBER_CHANGE")
    expect(service).toContain('oldValue: { offerNumber: offer.offerNumber }')
    expect(service).toContain('newValue: { offerNumber: newNumber }')
    expect(service).toContain("where: { id }, data: { offerNumber: newNumber }")
    expect(service).not.toContain('data: { id:')
  })

  it('schützt Status, Nummernkreis und konkurrierende Eindeutigkeit', () => {
    expect(service).toContain('offer.status !== OfferStatus.DRAFT || offer.order')
    expect(service).toContain('parsed.sequence > sequence.lastNumber')
    expect(service).toContain('offerNumber: newNumber, deletedAt: null, id: { not: id }')
    expect(service).toContain("error.code === 'P2002'")
    expect(schema).not.toContain('offerNumber String      @unique')
  })

  it('lässt die eigene unveränderte Nummer ohne Audit-No-op zu', () => {
    expect(service).toContain('if (offer.offerNumber === newNumber)')
    expect(service).toMatch(/if \(offer\.offerNumber === newNumber\) \{\s+return\s+\}/)
  })

  it('macht nur aktive Angebotsnummern per Partial Unique Index eindeutig', () => {
    const migration = source('prisma/migrations_archive_20260915_pre_canonical_baseline/20260903190000_offer_number_unique_for_active_offers/migration.sql')
    expect(migration).toContain('DROP INDEX "offers_offer_number_key"')
    expect(migration).toContain('CREATE UNIQUE INDEX "offers_offer_number_key"')
    expect(migration).toContain('WHERE "deleted_at" IS NULL')
    expect(migration).toContain('HAVING COUNT(*) > 1')
  })

  it('verwendet eine dedizierte Audit-Aktion', () => {
    expect(schema).toContain('OFFER_NUMBER_CHANGE')
    expect(source('types/enums.ts')).toContain("OFFER_NUMBER_CHANGE:'OFFER_NUMBER_CHANGE'")
    expect(source('prisma/migrations_archive_20260915_pre_canonical_baseline/20260903180000_add_offer_number_change_audit_action/migration.sql')).toContain("ADD VALUE IF NOT EXISTS 'OFFER_NUMBER_CHANGE'")
  })
})
