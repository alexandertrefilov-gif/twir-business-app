// app/api/collaboration/documents/route.ts
// Upload/Liste für die Collaboration-Dokumentdomäne (Fotos, Protokolle,
// Prüfberichte, Planzeichnungen). Nutzt denselben Upload-Validator wie
// /api/upload/route.ts — separate Storage-Wurzel, siehe
// lib/services/collaboration-document.service.ts.

import { NextRequest, NextResponse } from 'next/server'
import { toHttpError } from '@/lib/auth/permissions'
import {
  listCollaborationDocuments,
  uploadCollaborationDocument,
} from '@/lib/services/collaboration-document.service'

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Keine Datei übermittelt' }, { status: 400 })
  }

  const MAX_SIZE = 20 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Datei zu groß. Maximum: ${MAX_SIZE / 1024 / 1024} MB` }, { status: 413 })
  }

  const projectId = formData.get('projectId')
  if (typeof projectId !== 'string' || !projectId) {
    return NextResponse.json({ error: 'Projekt fehlt' }, { status: 400 })
  }
  const cabinetIdRaw = formData.get('cabinetId')
  const cabinetId = typeof cabinetIdRaw === 'string' && cabinetIdRaw ? cabinetIdRaw : null
  const documentKind = (formData.get('documentKind') as string) || 'Sonstiges'

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const document = await uploadCollaborationDocument({
      projectId,
      cabinetId,
      documentKind,
      originalName: (file as File).name ?? 'unknown',
      mimeType: file.type ?? 'application/octet-stream',
      buffer,
    })
    return NextResponse.json({ ok: true, document: { id: document.id, originalName: document.originalName, documentKind: document.documentKind, fileSize: document.fileSize } }, { status: 201 })
  } catch (error) {
    const { status, message } = toHttpError(error)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  const cabinetId = req.nextUrl.searchParams.get('cabinetId')
  if (!projectId) return NextResponse.json({ error: 'Projekt fehlt' }, { status: 400 })
  try {
    const documents = await listCollaborationDocuments({ projectId, cabinetId: cabinetId ?? undefined })
    return NextResponse.json({ ok: true, documents })
  } catch (error) {
    const { status, message } = toHttpError(error)
    return NextResponse.json({ error: message }, { status })
  }
}
