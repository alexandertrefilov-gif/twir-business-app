import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Prüft die physische Trennung der Collaboration-Dokumentdomäne vom
// internen Dokumentenarchiv: eigene Tabelle, eigene Storage-Wurzel,
// IDOR-Schutz über requireCollaborationProjectAccess.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: auth.getServerSession }))

describe.skipIf(!RUN_INTEGRATION)('CollaborationDocument — Datenbankintegration', () => {
  let db: any
  let documentService: typeof import('@/lib/services/collaboration-document.service')
  const marker = `GGA-DOC-${Date.now()}-${Math.random().toString(16).slice(2)}`
  let storageRoot = ''

  let memberUserId = '', memberEmail = ''
  let outsiderUserId = '', outsiderEmail = ''
  let operatorUserId = '', operatorEmail = ''
  let projectAId = '', projectBId = ''

  function asMember() { auth.getServerSession.mockResolvedValue({ user: { id: memberUserId, email: memberEmail, authScope: 'COLLABORATION' } }) }
  function asOutsider() { auth.getServerSession.mockResolvedValue({ user: { id: outsiderUserId, email: outsiderEmail, authScope: 'COLLABORATION' } }) }
  function asOperator() { auth.getServerSession.mockResolvedValue({ user: { id: operatorUserId, email: operatorEmail, authScope: 'COLLABORATION' } }) }

  beforeAll(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gga-doc-test-'))
    process.env.STORAGE_LOCAL_PATH = storageRoot

    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
    const role = await db.role.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
    const member = await db.user.create({ data: { email: `${marker}-member@example.invalid`, passwordHash: 'not-used', firstName: 'Member', lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
    memberUserId = member.id; memberEmail = member.email
    const outsider = await db.user.create({ data: { email: `${marker}-outsider@example.invalid`, passwordHash: 'not-used', firstName: 'Outsider', lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
    outsiderUserId = outsider.id; outsiderEmail = outsider.email
    const operator = await db.user.create({ data: { email: `${marker}-operator@example.invalid`, passwordHash: 'not-used', firstName: 'Operator', lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
    operatorUserId = operator.id; operatorEmail = operator.email

    const projectA = await db.collaborationProject.create({ data: { projectNumber: `${marker}-A`, name: 'Doc Test Projekt A', active: true } })
    projectAId = projectA.id
    const projectB = await db.collaborationProject.create({ data: { projectNumber: `${marker}-B`, name: 'Doc Test Projekt B', active: true } })
    projectBId = projectB.id
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: memberUserId, role: 'INTERNAL_PLANNER' } })
    await db.collaborationMembership.create({ data: { projectId: projectBId, userId: outsiderUserId, role: 'COLLAB_MANAGER' } })
    await db.collaborationMembership.create({ data: { projectId: projectAId, userId: operatorUserId, role: 'OPERATOR' } })

    documentService = await import('@/lib/services/collaboration-document.service')
  })

  afterAll(async () => {
    if (db) {
      await db.auditLog.deleteMany({ where: { userId: { in: [memberUserId, outsiderUserId, operatorUserId].filter(Boolean) } } })
      for (const projectId of [projectAId, projectBId].filter(Boolean)) {
        await db.collaborationDocument.deleteMany({ where: { projectId } })
        await db.collaborationMembership.deleteMany({ where: { projectId } })
      }
      await db.collaborationProject.deleteMany({ where: { id: { in: [projectAId, projectBId].filter(Boolean) } } })
      await db.user.deleteMany({ where: { id: { in: [memberUserId, outsiderUserId, operatorUserId].filter(Boolean) } } })
      await db.$disconnect()
    }
    if (storageRoot) await fs.rm(storageRoot, { recursive: true, force: true })
  })

  it('lädt ein Dokument hoch, schreibt es unter die eigene Storage-Wurzel und protokolliert es', async () => {
    asMember()
    const documentsBefore = await db.document.count()
    const document = await documentService.uploadCollaborationDocument({
      projectId: projectAId,
      documentKind: 'Übersicht',
      originalName: 'schrank-vorher.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
    })
    expect(document.projectId).toBe(projectAId)
    const written = await fs.readFile(path.join(storageRoot, 'collaboration', document.storagePath))
    expect(written.length).toBeGreaterThan(0)

    // Keine internen kaufmännischen Dokumente wurden berührt — vollständige
    // Domänentrennung von der Document-Tabelle.
    const documentsAfter = await db.document.count()
    expect(documentsAfter).toBe(documentsBefore)
  })

  it('lehnt Upload für einen Nutzer ohne Projektzugriff ab', async () => {
    asOutsider()
    await expect(documentService.uploadCollaborationDocument({
      projectId: projectAId,
      documentKind: 'Übersicht',
      originalName: 'angriff.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    })).rejects.toThrow('nicht gefunden')
  })

  it('lehnt unerlaubten Dokumentzugriff (Download-Auflösung) für Projekt-Fremde ab', async () => {
    asMember()
    const document = await documentService.uploadCollaborationDocument({
      projectId: projectAId,
      documentKind: 'Protokoll',
      originalName: 'pruefprotokoll.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
    })
    asOutsider()
    await expect(documentService.getCollaborationDocumentForDownload(document.id)).rejects.toThrow('nicht gefunden')
  })

  it('ein gelöschtes Dokument ist nicht mehr auffindbar', async () => {
    asMember()
    const document = await documentService.uploadCollaborationDocument({
      projectId: projectAId,
      documentKind: 'Sonstiges',
      originalName: 'temp.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('test'),
    })
    await documentService.softDeleteCollaborationDocument(document.id, 'Testbereinigung')
    await expect(documentService.getCollaborationDocumentForDownload(document.id)).rejects.toThrow('nicht gefunden')
  })

  // GGA-04.1: bereits vor diesem Checkpoint korrektes, aber bislang
  // ungetestetes Verhalten — OPERATOR sieht nur EXTERNAL-sichtbare
  // Dokumente, nie INTERNAL, ohne dass die Existenz eines INTERNAL-
  // Dokuments verraten wird (dieselbe "nicht gefunden"-Fehlermeldung).
  it('OPERATOR sieht ausschließlich EXTERNAL-sichtbare Dokumente, niemals INTERNAL', async () => {
    asMember()
    const internalDoc = await documentService.uploadCollaborationDocument({
      projectId: projectAId,
      documentKind: 'Sonstiges',
      originalName: 'nur-intern.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('intern'),
    })
    const externalDoc = await documentService.uploadCollaborationDocument({
      projectId: projectAId,
      documentKind: 'Sonstiges',
      originalName: 'fuer-betreiber.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('extern'),
    })
    await documentService.setCollaborationDocumentVisibility(externalDoc.id, 'EXTERNAL')

    asOperator()
    const visible = await documentService.listCollaborationDocuments({ projectId: projectAId })
    expect(visible.map((d) => d.id)).toContain(externalDoc.id)
    expect(visible.map((d) => d.id)).not.toContain(internalDoc.id)

    await expect(documentService.getCollaborationDocumentForDownload(externalDoc.id)).resolves.toMatchObject({ id: externalDoc.id })
    await expect(documentService.getCollaborationDocumentForDownload(internalDoc.id)).rejects.toThrow('nicht gefunden')
  })
})
