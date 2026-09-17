import { NextResponse } from 'next/server'
import { Action, Resource, requirePermission, toHttpError } from '@/lib/auth/permissions'
import { renderOrderPdf } from '@/lib/pdf-templates/order.template'
import { getOrderPdfData } from '@/lib/services/order-pdf.service'
import { OrderPdfValidationError, parseOrderPdfOptions } from '@/lib/validators/order-pdf.schema'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(Resource.ORDER, Action.READ)
    const { id } = await params
    const url = new URL(request.url)
    const options = parseOrderPdfOptions(url.searchParams)
    const data = await getOrderPdfData(id, options)
    const buffer = await renderOrderPdf(data)
    const disposition = url.searchParams.get('download') === 'true' ? 'attachment' : 'inline'
    const filename = (data.orderNumber ?? 'Auftrag').replace(/[^a-zA-Z0-9._-]/g, '_')

    return new NextResponse(Uint8Array.from(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}.pdf"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof OrderPdfValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const { status, message } = toHttpError(error)
    return NextResponse.json({ error: message }, { status })
  }
}
