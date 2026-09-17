import { NextRequest, NextResponse } from 'next/server'
import { Action, requirePermission, Resource, toHttpError } from '@/lib/auth/permissions'
import { saveExternalConfirmation, type ConfirmationOwner } from '@/lib/services/external-confirmation.service'
import { OrderConfirmationSchema } from '@/lib/validators/order-confirmation.schema'

const owners: Record<string, { owner: ConfirmationOwner; resource: Resource }> = {
  order: { owner: 'order', resource: Resource.ORDER },
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ entityType: string; id: string }> }) {
  try {
    const { entityType, id } = await params
    const config = owners[entityType]
    if (!config) return NextResponse.json({ error: 'Unbekannter Dokumenttyp.' }, { status: 404 })
    const actor = await requirePermission(config.resource, Action.UPDATE)
    const formData = await request.formData()
    const candidate = formData.get('file')
    const file = candidate instanceof File && candidate.size > 0 ? candidate : null
    const metadataInput = {
      confirmedAt: formData.get('confirmedAt') || undefined,
      confirmationNote: formData.get('confirmationNote') || undefined,
    }
    const metadata = OrderConfirmationSchema.safeParse({
      confirmationType: formData.get('confirmationType'),
      ...metadataInput,
    })
    if (!metadata.success) return NextResponse.json({ error: metadata.error.issues[0]?.message ?? 'Bestätigung ist ungültig.' }, { status: 422 })
    if (metadata.data.confirmationType === 'SIGNED_DOCUMENT' && !file) {
      return NextResponse.json({ error: 'Für diese Bestätigungsart ist ein unterschriebenes Dokument erforderlich.' }, { status: 422 })
    }
    if (file) await requirePermission(Resource.DOCUMENT, Action.CREATE)
    await saveExternalConfirmation({
      owner: config.owner, id,
      file: file ? { originalName: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) } : undefined,
      ...metadata.data,
      actor,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    const result = toHttpError(error)
    return NextResponse.json({ error: result.status === 500 ? 'Bestätigung konnte nicht gespeichert werden.' : result.message }, { status: result.status })
  }
}
