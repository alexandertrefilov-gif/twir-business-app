// app/api/collaboration/cabinets/[id]/schrankakte/route.ts
// Digitale GGA-Schrankakte als PDF — Collaboration-Auth (nicht die interne
// requirePermission), IDOR-sicher über requireCollaborationCabinetAccess.
//
// Zielgruppe (audience) wird serverseitig anhand der tatsächlichen Rolle
// erzwungen: OPERATOR/COLLAB_VIEWER erhalten IMMER die gefilterte
// Betreiber-Fassung, unabhängig vom Query-Parameter — der Parameter erlaubt
// internen Rollen lediglich, die Betreiber-Fassung optional zur Vorschau
// anzufordern (?audience=operator).

import { NextResponse } from 'next/server'
import { toHttpError } from '@/lib/auth/permissions'
import { requireCollaborationCabinetAccess, requireCollaborationSession } from '@/lib/auth/collaboration-guards'
import { getGgaCabinetSchrankaktePdfData, type SchrankakteAudience } from '@/lib/services/gga-cabinet-schrankakte.service'
import { renderGgaCabinetSchrankaktePdf } from '@/lib/pdf-templates/gga-cabinet-schrankakte.template'

export const runtime = 'nodejs'

const EXTERNAL_ONLY_ROLES = ['OPERATOR', 'COLLAB_VIEWER']

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { userId } = await requireCollaborationSession()
    const access = await requireCollaborationCabinetAccess(userId, id)

    const url = new URL(request.url)
    const requestedOperatorView = url.searchParams.get('audience') === 'operator'
    const audience: SchrankakteAudience = EXTERNAL_ONLY_ROLES.includes(access.membership.role) || requestedOperatorView ? 'OPERATOR' : 'INTERNAL'

    const data = await getGgaCabinetSchrankaktePdfData(id, audience)
    const buffer = await renderGgaCabinetSchrankaktePdf(data)
    const disposition = url.searchParams.get('download') === 'true' ? 'attachment' : 'inline'
    const filename = data.cabinetLabel.replace(/[^a-zA-Z0-9._-]/g, '_')

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
