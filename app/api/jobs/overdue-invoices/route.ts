// app/api/jobs/overdue-invoices/route.ts
// REQ-029 P5-2 Phase 2: geschützter interner Job-Endpunkt für den Überfälligkeitslauf.
//
// Aufruf durch einen externen Scheduler (POST mit `Authorization: Bearer <OVERDUE_JOB_TOKEN>`).
// Die Fachlogik liegt ausschließlich in markOverdueInvoices (Europe/Berlin-Tagesgrenze, Zeilensperre, Audit je
// Rechnung); dieser Endpunkt authentifiziert, ruft auf, protokolliert und übersetzt das Ergebnis in einen HTTP-Status.
// Die Route steht im Proxy-Matcher auf der Ausnahmeliste (exakter Pfad), siehe proxy.ts.

import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { authenticateOverdueJobRequest } from '@/lib/services/overdue-job-auth'
import { markOverdueInvoices } from '@/lib/services/dunning.service'
import { berlinCalendarDate } from '@/lib/utils/berlin-date'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } })
}

function logRun(level: 'info' | 'error', payload: Record<string, unknown>) {
  // Eine strukturierte JSON-Zeile je Ereignis; enthält weder Token noch Kundendaten.
  console[level](JSON.stringify({ event: 'overdue-job', ...payload }))
}

export async function POST(request: Request) {
  const auth = authenticateOverdueJobRequest(request)
  if (!auth.ok) {
    if (auth.status === 503) {
      logRun('error', { phase: 'rejected', reason: auth.reason })
      return json({ status: 'unavailable', error: 'Job ist nicht konfiguriert' }, 503)
    }
    logRun('error', { phase: 'rejected', reason: auth.reason })
    return json({ status: 'unauthorized', error: 'Nicht autorisiert' }, 401, { 'WWW-Authenticate': 'Bearer' })
  }

  const runId = randomUUID()
  const now = new Date()
  const berlinDate = berlinCalendarDate(now)
  const startedAt = Date.now()
  logRun('info', { phase: 'start', runId, berlinDate })

  try {
    const marked = await markOverdueInvoices(now)
    const durationMs = Date.now() - startedAt
    logRun('info', { phase: 'end', status: 'ok', runId, berlinDate, marked, durationMs })
    return json({ status: 'ok', runId, berlinDate, marked, durationMs }, 200)
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : String(error)
    logRun('error', { phase: 'end', status: 'failed', runId, berlinDate, durationMs, message: message.slice(0, 500) })
    // Fehlerdetails (Rechnungs-IDs, Datenbankmeldungen) bleiben im Server-Log; die Antwort nennt nur die Lauf-ID.
    return json({ status: 'failed', runId, berlinDate, durationMs }, 500)
  }
}

function methodNotAllowed() {
  return json({ status: 'error', error: 'Methode nicht erlaubt' }, 405, { Allow: 'POST' })
}

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
