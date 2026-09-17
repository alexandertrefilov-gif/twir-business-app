import { NextResponse } from 'next/server'
import { Action, Resource, requirePermission, toHttpError } from '@/lib/auth/permissions'
import { renderInvoicePdf } from '@/lib/pdf-templates/invoice.template'
import { getInvoicePdfData } from '@/lib/services/invoice-pdf.service'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(Resource.INVOICE, Action.READ)
    const { id } = await params
    const data = await getInvoicePdfData(id)
    const buffer = await renderInvoicePdf(data)
    const download = new URL(request.url).searchParams.get('download') === 'true'
    const filename = (data.invoiceNumber ?? 'Rechnungsentwurf').replace(/[^a-zA-Z0-9._-]/g, '_')
    return new NextResponse(Uint8Array.from(buffer), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}.pdf"`,
      'Content-Length': String(buffer.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } })
  } catch (error) {
    const { status, message } = toHttpError(error)
    return NextResponse.json({ error: message }, { status })
  }
}
