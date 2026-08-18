import { NextResponse } from 'next/server'
import {
  Action,
  Resource,
  requirePermission,
  toHttpError,
} from '@/lib/auth/permissions'
import { renderOfferPdf } from '@/lib/pdf-templates/offer.template'
import { getOfferPdfData } from '@/lib/services/offer-pdf.service'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission(Resource.OFFER, Action.READ)
    const { id } = await params
    const data = await getOfferPdfData(id)
    const buffer = await renderOfferPdf(data)

    return new NextResponse(Uint8Array.from(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${data.offerNumber}.pdf"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const { status, message } = toHttpError(error)
    return NextResponse.json({ error: message }, { status })
  }
}
