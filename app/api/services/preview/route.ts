import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Action, Resource, requirePermission, toHttpError } from '@/lib/auth/permissions'
import { renderServiceReportPdf } from '@/lib/pdf-templates/service-report.template'
import { getServiceReportDraftPdfData } from '@/lib/services/service-report-pdf.service'
import { ServiceReportCreateSchema } from '@/lib/validators/service-report.schema'

export const runtime = 'nodejs'

const PreviewSchema = ServiceReportCreateSchema.extend({
  reportId: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json()
    const requestedReportId = typeof body === 'object' && body !== null &&
      typeof (body as { reportId?: unknown }).reportId === 'string'
      ? (body as { reportId: string }).reportId
      : undefined
    const user = await requirePermission(
      Resource.SERVICE_REPORT,
      requestedReportId ? Action.UPDATE : Action.CREATE,
    )
    const parsed = PreviewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Bitte füllen Sie alle Pflichtfelder für die Vorschau korrekt aus.' }, { status: 400 })
    }

    const { reportId, ...draft } = parsed.data
    const data = await getServiceReportDraftPdfData(draft, user.userId, user.role, reportId)
    const buffer = await renderServiceReportPdf(data)

    return new NextResponse(Uint8Array.from(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="Leistungsnachweis-Vorschau.pdf"',
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
