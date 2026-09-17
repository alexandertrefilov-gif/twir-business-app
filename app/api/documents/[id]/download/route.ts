// app/api/documents/[id]/download/route.ts
// Auth-geschützte Dokumenten-Download-Route.
// Liefert Dateien NIEMALS direkt aus dem Storage-Pfad aus.
// Alle Anfragen werden gegen Session + Berechtigung geprüft.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth/options'
import { getDocumentById }           from '@/lib/services/document.service'
import path                          from 'path'
import fs                            from 'fs/promises'
import { requirePermission, Resource, Action, toHttpError } from '@/lib/auth/permissions'
import { prisma } from '@/lib/db/prisma'
import { isAccountingDocument } from '@/lib/documents/document-access'

export async function GET(
  req:      NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  // 1. Auth
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }
  try { await requirePermission(Resource.DOCUMENT, Action.READ) } catch (error) {
    const result = toHttpError(error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }

  // 2. Fetch document metadata
  let doc
  try {
    doc = await getDocumentById(id)
  } catch {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  }

  // Rechnungs- und künftige Buchhaltungsbelege enthalten Finanzdaten. Das
  // allgemeine Dokumentrecht allein reicht für diesen Kontext nicht aus.
  if (isAccountingDocument(doc)) {
    try { await requirePermission(Resource.ACCOUNTING, Action.READ) } catch (error) {
      const result = toHttpError(error)
      return NextResponse.json({ error: result.message }, { status: result.status })
    }
  }

  // 3. Resolve storage path (local FS only — S3 extension in Phase 8)
  const settings = doc.lifecycle !== 'UPLOAD' || doc.isArchived
    ? await prisma.companySetting.findFirst({ select: { documentArchiveEnabled: true, documentArchivePath: true } })
    : null
  const useArchiveRoot = doc.lifecycle !== 'UPLOAD'
    || (doc.isArchived && Boolean(settings?.documentArchiveEnabled))
  const storageRoot = useArchiveRoot && settings?.documentArchivePath
    ? settings.documentArchivePath
    : process.env.STORAGE_LOCAL_PATH ?? './storage/documents'
  const filePath    = path.join(storageRoot, doc.storagePath)

  // 4. Security: prevent path traversal
  const resolvedRoot = path.resolve(storageRoot)
  const resolvedFile = path.resolve(filePath)
  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
    return NextResponse.json({ error: 'Ungültiger Pfad' }, { status: 400 })
  }

  // 5. Read file
  let buffer: Buffer
  try {
    buffer = await fs.readFile(resolvedFile)
  } catch {
    return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 })
  }

  // 6. Stream response with correct headers
  const body = Uint8Array.from(buffer)

  const inline = req.nextUrl.searchParams.get('disposition') === 'inline'
    && (doc.mimeType === 'application/pdf' || doc.mimeType.startsWith('image/'))
  const disposition = inline ? 'inline' : 'attachment'
  const fallbackName = doc.originalName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'document'
  return new NextResponse(body, {
    headers: {
      'Content-Type':        doc.mimeType,
      'Content-Disposition': `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
      'Content-Length':      String(buffer.length),
      'Cache-Control':       'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
