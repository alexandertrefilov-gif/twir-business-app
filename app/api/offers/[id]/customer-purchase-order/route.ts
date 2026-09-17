import { NextRequest, NextResponse } from 'next/server'
import { Action, requirePermission, Resource, toHttpError } from '@/lib/auth/permissions'
import { saveCustomerPurchaseOrder } from '@/lib/services/customer-purchase-order.service'
import { CustomerPurchaseOrderMetadataSchema } from '@/lib/validators/customer-purchase-order.schema'

const MAX_FILE_SIZE = 20 * 1024 * 1024

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission(Resource.OFFER, Action.UPDATE)
    const { id: offerId } = await params
    const formData = await request.formData()
    const metadata = CustomerPurchaseOrderMetadataSchema.safeParse({
      orderNumber: formData.get('orderNumber') ?? undefined,
      orderDate: formData.get('orderDate') ?? undefined,
    })
    if (!metadata.success) return NextResponse.json({ error: metadata.error.issues[0]?.message ?? 'Bestelldaten sind ungültig.' }, { status: 422 })
    const candidate = formData.get('file')
    const file = candidate instanceof File && candidate.size > 0 ? candidate : null
    if (file) {
      await requirePermission(Resource.DOCUMENT, Action.CREATE)
      if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Datei zu groß. Maximum: 20 MB' }, { status: 413 })
    }
    const acceptOffer = request.nextUrl.searchParams.get('accept') === '1'
    await saveCustomerPurchaseOrder({
      offerId,
      orderNumber: metadata.data.orderNumber,
      orderDate: metadata.data.orderDate,
      file: file ? { originalName: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) } : undefined,
      acceptOffer,
      actor,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    const result = toHttpError(error)
    return NextResponse.json({ error: result.status === 500 ? 'Kundenbestellung konnte nicht gespeichert werden.' : result.message }, { status: result.status })
  }
}
