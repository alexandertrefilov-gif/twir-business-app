import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { Action, requirePermission, Resource, toHttpError } from '@/lib/auth/permissions'
import { archiveMimeType, getArchiveStorage, normalizeArchiveRelativePath } from '@/lib/documents/archive-explorer.service'
import { isAccountingArchivePath } from '@/lib/documents/document-access'

const MAX_JSON_PREVIEW_SIZE = 2 * 1024 * 1024

function contentDisposition(filename: string, inline: boolean): string {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'document'
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission(Resource.DOCUMENT, Action.READ)
    const relativePath = normalizeArchiveRelativePath(request.nextUrl.searchParams.get('path'))
    if (!relativePath) return NextResponse.json({ error: 'Dateipfad fehlt.' }, { status: 400 })
    if (isAccountingArchivePath(relativePath)) {
      await requirePermission(Resource.ACCOUNTING, Action.READ)
    }
    const disposition = request.nextUrl.searchParams.get('disposition')
    const storage = await getArchiveStorage()
    const entry = await storage.stat(relativePath)
    if (entry.kind !== 'file' || entry.fileType === 'other') {
      return NextResponse.json({ error: 'Datei nicht unterstützt.' }, { status: 400 })
    }
    const inline = disposition === 'inline' && (entry.fileType === 'pdf' || entry.fileType === 'json')
    if (entry.fileType === 'json' && inline && (entry.size ?? 0) > MAX_JSON_PREVIEW_SIZE) {
      return NextResponse.json({ error: 'Die Metadatendatei ist für die Vorschau zu groß.' }, { status: 413 })
    }
    const contents = await storage.readFile(relativePath)
    return new NextResponse(Uint8Array.from(contents), {
      headers: {
        'Content-Type': archiveMimeType(entry.fileType),
        'Content-Disposition': contentDisposition(path.basename(relativePath), inline),
        'Content-Length': String(contents.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return NextResponse.json({ error: 'Datei nicht gefunden.' }, { status: 404 })
    }
    const message = error instanceof Error ? error.message : ''
    const clientError = /Archivpfad|Absolute|Symbolische|Ungültiger|Dateityp/.test(message)
    if (clientError) return NextResponse.json({ error: message }, { status: 400 })
    const result = toHttpError(error)
    return NextResponse.json({ error: result.status === 500 ? 'Archivdatei konnte nicht gelesen werden.' : result.message }, { status: result.status })
  }
}
