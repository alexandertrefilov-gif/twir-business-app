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

export async function GET(
  _req:     NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  // 1. Auth
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  // 2. Fetch document metadata
  let doc
  try {
    doc = await getDocumentById(id)
  } catch {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  }

  // 3. Resolve storage path (local FS only — S3 extension in Phase 8)
  const storageRoot = process.env.STORAGE_LOCAL_PATH ?? './storage/documents'
  const filePath    = path.join(storageRoot, doc.storagePath)

  // 4. Security: prevent path traversal
  const resolvedRoot = path.resolve(storageRoot)
  const resolvedFile = path.resolve(filePath)
  if (!resolvedFile.startsWith(resolvedRoot)) {
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

  return new NextResponse(body, {
    headers: {
      'Content-Type':        doc.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.originalName)}"`,
      'Content-Length':      String(buffer.length),
      'Cache-Control':       'private, no-store',
    },
  })
}
