import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('WF-1A gemeinsamer Dokumentkopf in den Seiten', () => {
  for (const [name, path, current] of [
    ['Angebot', 'app/(dashboard)/offers/[id]/page.tsx', 'offer'],
    ['Auftrag', 'app/(dashboard)/orders/[id]/page.tsx', 'order'],
    ['Leistungsnachweis', 'app/(dashboard)/services/[id]/page.tsx', 'serviceReport'],
  ] as const) {
    it(`${name}: verwendet Kopfmodell und gemeinsame Komponente`, () => {
      const page = src(path)
      expect(page).toContain('<BusinessDocumentMeta model={headerModel} />')
      expect(page).toContain(`current: '${current}'`)
      expect(page).toContain('getHeaderPermissions(processPermissions)')
    })
  }

  it('Rechnungsseite bleibt unverändert und ohne neue Kopfkomponente', () => {
    expect(src('app/(dashboard)/invoices/[id]/page.tsx')).not.toContain('BusinessDocumentMeta')
  })

  it('verwendet nur bestehende Leseberechtigungen', () => {
    const perms = src('lib/workflow/document-header-permissions.ts')
    expect(perms).toContain('Action.READ')
    expect(perms).not.toMatch(/Action\.(CREATE|UPDATE|DELETE)/)
    expect(src('lib/auth/permissions.ts')).toBeTruthy()
  })

  it('zeigt Kundenbestellnummer und -datum in der Komponente', () => {
    const meta = src('components/documents/BusinessDocumentMeta.tsx')
    expect(meta).toContain('model.customerOrderNumber')
    expect(meta).toContain('model.customerOrderDate')
    expect(meta).toContain('Dokumente')
  })
})
