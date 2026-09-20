import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// DELETE-SAFETY-004 — kontrollierter Rückbau Internal Project ↔ Collaboration.
// Quelltext-Verifikation nach etabliertem Muster (wie project-list-delete.test.ts):
// keine zweite Delete-/Confirmation-Engine, korrekte Wiederverwendung
// bestehender Mechanismen. Fachliche Blocker-Regeln sind DB-getestet in
// tests/integration/collaboration-release-db.test.ts.

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('project.service.ts — releaseCollaboration (keine neue Architektur)', () => {
  const service = read('lib/services/project.service.ts')

  it('hebt ausschließlich internalProjectId auf, kein Soft/Hard Delete des CollaborationProject', () => {
    const fn = service.slice(service.indexOf('export async function releaseCollaboration'))
    expect(fn).toContain('internalProjectId: null')
    expect(fn).not.toContain('deletedAt: new Date()')
    expect(fn).not.toContain('.delete(')
  })

  it('prüft die Kennungs-/Projektnummer-Bestätigung serverseitig', () => {
    const fn = service.slice(service.indexOf('export async function releaseCollaboration'))
    expect(fn).toContain('confirmedProjectNumber !== project.projectNumber')
  })

  it('nutzt einen updateMany-Guard für Idempotenz bei parallelen Anfragen', () => {
    const fn = service.slice(service.indexOf('export async function releaseCollaboration'), service.indexOf('export async function releaseCollaboration') + 2000)
    expect(fn).toContain('updateMany')
    expect(fn).toContain('result.count === 0')
  })

  it('protokolliert über die bestehende Audit-Infrastruktur (buildAuditLogCreate), keine zweite', () => {
    const fn = service.slice(service.indexOf('export async function releaseCollaboration'))
    expect(fn).toContain('buildAuditLogCreate(tx')
  })

  it('prüft Stages und Memberships bewusst NICHT als Blocker (sonst nie rückbaubar)', () => {
    const blockerFn = service.slice(service.indexOf('async function getCollaborationReleaseBlockers'), service.indexOf('export async function getCollaborationReleaseBlockersFor'))
    expect(blockerFn).not.toContain('collaborationMembership')
    expect(blockerFn).not.toContain('collaborationProjectStage')
  })
})

describe('actions.ts — releaseCollaborationAction (Permission-Wiederverwendung)', () => {
  const actions = read('app/(dashboard)/projects/actions.ts')

  it('nutzt Resource.PROJECT/Action.UPDATE — dieselbe Berechtigung wie das Verknüpfen (linkExistingCollaborationProjectAction)', () => {
    const releaseFn = actions.slice(actions.indexOf('export async function releaseCollaborationAction'))
    const linkFn = actions.slice(actions.indexOf('export async function linkExistingCollaborationProjectAction'), actions.indexOf('export async function assignExistingProjectAction'))
    expect(releaseFn).toContain('requirePermission(Resource.PROJECT, Action.UPDATE)')
    expect(linkFn).toContain('requirePermission(Resource.PROJECT, Action.UPDATE)')
  })

  it('getCollaborationReleaseInfoAction prüft dieselbe Berechtigung, bevor Blocker gelesen werden', () => {
    const fn = actions.slice(actions.indexOf('export async function getCollaborationReleaseInfoAction'))
    expect(fn).toContain('requirePermission(Resource.PROJECT, Action.UPDATE)')
  })
})

describe('ProjectRowDeleteAction — Zusammenarbeits-Gate (DELETE-SAFETY-004)', () => {
  const component = read('components/projects/ProjectRowDeleteAction.tsx')

  it('nutzt weiterhin ausschließlich den zentralen ConfirmDialog, keine zweite Modal-Engine', () => {
    const dialogImports = component.match(/from '@\/components\/shared\/ConfirmDialog'/g) ?? []
    expect(dialogImports.length).toBe(1)
    expect(component).not.toMatch(/createPortal/)
  })

  it('bietet bei aktiver Zusammenarbeit "Zusammenarbeit öffnen" und "Zusammenarbeit aufheben …" an', () => {
    expect(component).toContain("label: 'Zusammenarbeit öffnen'")
    expect(component).toContain("label: 'Zusammenarbeit aufheben …'")
  })

  it('zeigt beim internen Projekt löschen KEINEN Force-Delete, sondern verweist auf den Rückbau-Schritt', () => {
    expect(component).not.toContain('force')
    expect(component).not.toContain('Force')
  })

  it('setzt nach erfolgreicher Aufhebung wieder Schritt "delete" (kein Verbleib im Rückbau-Dialog)', () => {
    const fn = component.slice(component.indexOf('async function release()'), component.indexOf('function openCollaboration'))
    expect(fn).toContain("setStep('delete')")
  })

  it('ruft releaseCollaborationAction mit der Projektnummer als Identitätsbestätigung auf', () => {
    expect(component).toContain('releaseCollaborationAction(projectId, projectNumber)')
  })
})
