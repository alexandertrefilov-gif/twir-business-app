import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// DELETE-SAFETY-003 — zusätzlicher Löscheinstieg auf /projects. Reine
// Quelltext-Verifikation (wie tests/unit/dialog-viewport-overflow.test.ts):
// diese Datei prüft, dass KEINE zweite deleteProject()-Businesslogik, keine
// zweite Dependency-Prüfung und keine zweite Confirmation-Engine entstanden
// ist, sondern ausschließlich die bereits bestehende DELETE-SAFETY-001-Logik
// wiederverwendet wird. Fachliche Blocker-Regeln (Order/Leistung/Rechnung/
// Collaboration) sind bereits in tests/integration/project-delete-db.test.ts
// DB-getestet — hier wird nur die neue Verdrahtung geprüft.

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Projektübersicht (/projects) — Aktionen-Spalte (T8)', () => {
  const page = read('app/(dashboard)/projects/page.tsx')

  it('lädt canDelete über die bestehende PERMISSION_MATRIX (hasPermission), keine neue Berechtigung', () => {
    expect(page).toContain("hasPermission(Resource.PROJECT, Action.DELETE)")
  })

  it('rendert die Löschaktion nur, wenn canDelete zutrifft', () => {
    expect(page).toContain('{canDelete && <ProjectRowDeleteAction')
  })

  it('fügt eine Aktionen-Spalte hinzu, ohne die Zeile selbst klickbar zu machen', () => {
    expect(page).toContain('<th className="p-3 text-right">Aktionen</th>')
    expect(page).not.toMatch(/<tr[^>]*onClick/)
  })
})

describe('ProjectRowDeleteAction — Wiederverwendung von DELETE-SAFETY-001 (keine zweite Delete-Engine)', () => {
  const component = read('components/projects/ProjectRowDeleteAction.tsx')

  it('importiert ausschließlich die bestehenden Server Actions, keine eigene Delete-Implementierung', () => {
    expect(component).toContain('deleteProjectAction')
    expect(component).toContain('getProjectDeleteInfoAction')
    expect(component).toContain("from '@/app/(dashboard)/projects/actions'")
    expect(component).not.toContain('prisma.project.delete')
    expect(component).not.toContain('prisma.project.update')
  })

  it('nutzt den zentralen ConfirmDialog mit Checkbox und Kennungs-Bestätigung wie die Projektdetailseite', () => {
    expect(component).toContain("import { ConfirmDialog } from '@/components/shared/ConfirmDialog'")
    expect(component).toContain('acknowledgeLabel:')
    expect(component).toContain('typedConfirmation:')
    expect(component).toContain('expected: projectNumber')
  })

  it('zeigt die Warnung "kann nicht rückgängig gemacht werden"', () => {
    expect(component).toContain('nicht rückgängig gemacht werden')
  })

  it('leitet Abhängigkeiten ausschließlich über getProjectDeleteInfoAction (keine eigene Dependency-Prüfung)', () => {
    expect(component).toContain('getProjectDeleteInfoAction(projectId)')
    expect(component).not.toContain('.offers.length')
    expect(component).not.toContain('.orders.length')
  })

  it('behandelt einen Prüf-Fehler fail-closed (blockiert statt stillschweigend zu erlauben)', () => {
    expect(component).toContain('setBlockers([result.error])')
  })
})

describe('getProjectDeleteInfoAction — reiner Lese-Wrapper (T5-T7 Grundlage)', () => {
  const actions = read('app/(dashboard)/projects/actions.ts')

  it('nutzt exakt getProject() und getProjectDeleteBlockers() aus project.service.ts, keine neue Logik', () => {
    const fn = actions.slice(actions.indexOf('export async function getProjectDeleteInfoAction'))
    expect(fn).toContain('await requirePermission(Resource.PROJECT, Action.DELETE)')
    expect(fn).toContain('await getProject(projectId)')
    expect(fn).toContain('getProjectDeleteBlockers(project)')
  })
})

describe('ConfirmDialog — Blockierungs-Modus (DELETE-SAFETY-003)', () => {
  const dialog = read('components/shared/ConfirmDialog.tsx')

  it('unterdrückt den Bestätigen-Button vollständig, wenn blockiert', () => {
    expect(dialog).toContain('{!isBlocked && (')
    expect(dialog).toContain('canConfirm = !isBlocked')
  })

  it('checking-Zustand blockiert die Bestätigung ebenfalls (fail-closed während des Ladens)', () => {
    expect(dialog).toContain('const isBlocked = checking ||')
  })
})
