// app/api/upload/route.ts
// Datei-Upload-Endpunkt
// Nutzt: validateUpload (Phase 8), registerDocument (Phase 7), requirePermission (Phase 2)

import { NextRequest, NextResponse } from 'next/server'
import {
  Action,
  Resource,
  requirePermission,
  toHttpError,
} from '@/lib/auth/permissions'
import { validateUpload } from '@/lib/security/upload-validator'
import {
  generateStorageFilename,
  registerDocument,
} from '@/lib/services/document.service'
import path                          from 'path'
import fs                            from 'fs/promises'

// Erlaubte Entity-Verknüpfungen
const ENTITY_KEYS = ['customerId', 'invoiceId', 'orderId', 'offerId', 'serviceReportId'] as const

export async function POST(req: NextRequest) {
  // 1. Auth + zentrale Rollenberechtigung
  let actor: Awaited<ReturnType<typeof requirePermission>>
  try {
    actor = await requirePermission(Resource.DOCUMENT, Action.CREATE)
  } catch (error) {
    const { status, message } = toHttpError(error)
    return NextResponse.json({ error: message }, { status })
  }
  const { userId, userEmail } = actor

  // 2. Parse multipart form
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

  // Begrenze maximale Dateigröße VOR dem Lesen des Buffer
  const MAX_SIZE = 20 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `Datei zu groß. Maximum: ${MAX_SIZE / 1024 / 1024} MB` },
      { status: 413 },
    )
  }

  const originalName = (file as File).name ?? 'unknown'
  const mimeType     = file.type ?? 'application/octet-stream'

  // 3. Security validation
  const validation = validateUpload({
    originalName,
    mimeType,
    sizeBytes:   file.size,
  })

  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 422 })
  }

  // 4. Resolve storage location
  const storageRoot = process.env.STORAGE_LOCAL_PATH ?? './storage/documents'
  const storageDriver = process.env.STORAGE_DRIVER ?? 'local'

  // 5. Generate unique filename
  const storageName = generateStorageFilename('upload', validation.sanitizedName)
  const storagePath = storageName   // relative — no directory traversal possible

  // 6. Write file (local driver)
  if (storageDriver === 'local') {
    try {
      await fs.mkdir(storageRoot, { recursive: true })
      const buffer = Buffer.from(await file.arrayBuffer())
      await fs.writeFile(path.join(storageRoot, storagePath), buffer)
    } catch (err) {
      console.error('[Upload] Dateisystem-Fehler:', err)
      return NextResponse.json(
        { error: 'Fehler beim Speichern der Datei' },
        { status: 500 },
      )
    }
  }
  // S3 driver: add here in Phase 9+ / production

  // 7. Extract entity links from form data
  const entityLinks: Record<string, string | null> = {}
  for (const key of ENTITY_KEYS) {
    const val = formData.get(key)
    entityLinks[key] = typeof val === 'string' ? val : null
  }

  const documentType = (formData.get('documentType') as string) || 'UPLOAD'

  // 8. Register document metadata
  let documentId: string
  try {
    documentId = await registerDocument(
      {
        type:            documentType,
        filename:        storageName,
        originalName:    validation.sanitizedName,
        mimeType,
        fileSize:        file.size,
        storagePath,
        ...entityLinks,
        uploadedById:    userId,
      },
      userId,
      userEmail,
    )
  } catch (err) {
    // Cleanup uploaded file on metadata failure
    if (storageDriver === 'local') {
      await fs.unlink(path.join(storageRoot, storagePath)).catch(() => {})
    }
    console.error('[Upload] Metadata-Registrierung fehlgeschlagen:', err)
    return NextResponse.json(
      { error: 'Fehler beim Registrieren des Dokuments' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success:      true,
    documentId,
    filename:     storageName,
    originalName: validation.sanitizedName,
    mimeType,
    fileSize:     file.size,
  }, { status: 201 })
}

// Only POST allowed
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
