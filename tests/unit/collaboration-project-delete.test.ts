import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Härtung von CollaborationProjectDeleteAction/deleteCollaborationProject:
// vorher kein Abhängigkeits-Check und window.prompt() statt des zentralen
// ConfirmDialog. Quelltext-Verifikation nach etabliertem Muster (wie
// project-list-delete.test.ts / collaboration-release.test.ts).

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('deleteCollaborationProject — Dependency-Härtung (keine zweite Prüfung)', () => {
  const service = read('lib/services/collaboration-phase2.service.ts')

  it('importiert und nutzt getCollaborationReleaseBlockersFor statt einer eigenen Abhängigkeits-Prüfung', () => {
    expect(service).toContain("import { getCollaborationReleaseBlockersFor } from '@/lib/services/project.service'")
    const fn = service.slice(service.indexOf('async function getCollaborationProjectDeleteBlockers'))
    expect(fn).toContain('getCollaborationReleaseBlockersFor(projectId, tx)')
  })

  it('blockiert, wenn das Projekt noch mit einem internen Projekt verknüpft ist (internalProjectId ist @unique)', () => {
    const fn = service.slice(service.indexOf('async function getCollaborationProjectDeleteBlockers'), service.indexOf('export async function getCollaborationProjectDeleteBlockersFor'))
    expect(fn).toContain('internalProjectId')
    expect(fn).toContain('verknüpft')
  })

  it('prüft die Blocker VOR der Mutation und wirft bei Blockierung, statt stillschweigend zu löschen', () => {
    const fn = service.slice(service.indexOf('export async function deleteCollaborationProject'))
    expect(fn).toContain('getCollaborationProjectDeleteBlockers(projectId, tx)')
    expect(fn).toContain('blockers.length > 0')
    expect(fn).toContain('BusinessRuleError')
  })

  it('kein Hard-Delete, kein Cascade: ausschließlich active=false/deletedAt gesetzt', () => {
    const fn = service.slice(service.indexOf('export async function deleteCollaborationProject'))
    expect(fn).toContain('active: false')
    expect(fn).not.toContain('.delete(')
  })

  it('nutzt einen updateMany-Guard für Idempotenz bei parallelen Anfragen (kein Fehler bei Duplikat)', () => {
    const fn = service.slice(service.indexOf('export async function deleteCollaborationProject'))
    expect(fn).toContain('updateMany')
    expect(fn).toContain('result.count === 0')
  })

  it('erzwingt COLLAB_MANAGER serverseitig, sowohl für die Prüfung als auch für die Löschung', () => {
    const infoFn = service.slice(service.indexOf('export async function getCollaborationProjectDeleteBlockersFor'), service.indexOf('export async function deleteCollaborationProject'))
    const deleteFn = service.slice(service.indexOf('export async function deleteCollaborationProject'))
    expect(infoFn).toContain('requireCollaborationManager')
    expect(deleteFn).toContain('requireCollaborationManager')
  })
})

describe('CollaborationProjectDeleteAction — zentraler ConfirmDialog statt window.prompt', () => {
  const component = read('components/collaboration/CollaborationProjectDeleteAction.tsx')

  it('verwendet keinen window.prompt()/window.confirm() Aufruf mehr (nur in Kommentaren erwähnt)', () => {
    expect(component).not.toContain('window.prompt(')
    expect(component).not.toContain('window.confirm(')
  })

  it('nutzt den zentralen ConfirmDialog mit Checkbox und Kennungs-Bestätigung', () => {
    expect(component).toContain("import { ConfirmDialog } from '@/components/shared/ConfirmDialog'")
    expect(component).toContain('acknowledgeLabel=')
    expect(component).toContain('blockedReasons={blockers}')
  })

  it('prüft Abhängigkeiten on-demand über die neue project-delete-info-Aktion, fail-closed bei Fehler', () => {
    expect(component).toContain("action: 'project-delete-info'")
    expect(component).toContain('setBlockers([cause instanceof Error')
  })
})

describe('workflow/route.ts — project-delete-info verdrahtet', () => {
  const route = read('app/api/collaboration/workflow/route.ts')

  it('registriert die neue Aktion project-delete-info und ruft getCollaborationProjectDeleteBlockersFor auf', () => {
    expect(route).toContain("'project-delete-info'")
    expect(route).toContain('getCollaborationProjectDeleteBlockersFor(input.id)')
  })
})
