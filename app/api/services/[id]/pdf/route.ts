import { NextResponse } from 'next/server'
import { Action, Resource, requirePermission, toHttpError } from '@/lib/auth/permissions'
import { renderServiceReportPdf } from '@/lib/pdf-templates/service-report.template'
import { getServiceReportPdfData } from '@/lib/services/service-report-pdf.service'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(Resource.SERVICE_REPORT, Action.READ)
    const { id } = await params
    const data = await getServiceReportPdfData(id, user.userId, user.role)
    const buffer = await renderServiceReportPdf(data)
    const url = new URL(request.url)
    const disposition = url.searchParams.get('download') === 'true' ? 'attachment' : 'inline'
    const filename = data.reportNumber.replace(/[^a-zA-Z0-9._-]/g, '_')

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
    const { status, message } = toHttpError(error)
    return NextResponse.json({ error: message }, { status })
  }
}
