// app/api/collaboration/documents/[id]/download/route.ts
// Auth-geschützte Download-Route für Collaboration-Dokumente.
// Liefert Dateien niemals direkt aus dem Storage-Pfad aus — jede Anfrage
// wird gegen die Collaboration-Session + Projektmitgliedschaft geprüft.

import { NextRequest, NextResponse } from 'next/server'
import { toHttpError } from '@/lib/auth/permissions'
import {
  getCollaborationDocumentForDownload,
  getCollaborationDocumentStorage,
} from '@/lib/services/collaboration-document.service'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let document
  try {
    document = await getCollaborationDocumentForDownload(id)
  } catch (error) {
    const { status, message } = toHttpError(error)
    return NextResponse.json({ error: message }, { status })
  }

  const storage = getCollaborationDocumentStorage()
  let buffer: Buffer
  try {
    buffer = await storage.readFile(document.storagePath)
  } catch {
    return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 })
  }

  const inline = req.nextUrl.searchParams.get('disposition') === 'inline'
    && (document.mimeType === 'application/pdf' || document.mimeType.startsWith('image/'))
  const disposition = inline ? 'inline' : 'attachment'
  const fallbackName = document.originalName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'document'
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Disposition': `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
