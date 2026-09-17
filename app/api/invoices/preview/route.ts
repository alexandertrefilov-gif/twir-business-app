import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Action, Resource, requirePermission, toHttpError } from '@/lib/auth/permissions'
import { renderInvoicePdf } from '@/lib/pdf-templates/invoice.template'
import { getInvoiceDraftPdfData } from '@/lib/services/invoice-pdf.service'
import { InvoiceDraftSchema } from '@/lib/validators/invoice.schema'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json()
    const requestedInvoiceIdRaw = typeof body === 'object' && body !== null &&
      typeof (body as { invoiceId?: unknown }).invoiceId === 'string'
      ? (body as { invoiceId: string }).invoiceId
      : undefined
    const invoiceIdResult = z.string().uuid().optional().safeParse(requestedInvoiceIdRaw)
    if (!invoiceIdResult.success) return NextResponse.json({ error: 'Rechnungs-ID ist ungültig.' }, { status: 400 })
    const requestedInvoiceId = invoiceIdResult.data
    await requirePermission(Resource.INVOICE, requestedInvoiceId ? Action.UPDATE : Action.CREATE)
    const parsed = InvoiceDraftSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Bitte füllen Sie alle Pflichtfelder für die Vorschau korrekt aus.' }, { status: 400 })
    }

    const data = await getInvoiceDraftPdfData(parsed.data, requestedInvoiceId)
    const buffer = await renderInvoicePdf(data)
    return new NextResponse(Uint8Array.from(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="Rechnung-Vorschau.pdf"',
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
