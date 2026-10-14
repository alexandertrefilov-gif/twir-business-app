// lib/services/overdue-job-auth.ts
// REQ-029 P5-2 Phase 2: Bearer-Authentifizierung für den internen Überfälligkeits-Job.
//
// Der Endpunkt wird von einem externen Scheduler ohne Benutzersitzung aufgerufen und steht deshalb außerhalb
// des Session-Proxys. Er schützt sich selbst:
//   - fail-closed: ohne korrekt konfiguriertes Server-Token (OVERDUE_JOB_TOKEN, mindestens 32 Zeichen) ist der Job
//     nicht ausführbar (503), unabhängig davon, was der Aufrufer sendet;
//   - Vergleich über SHA-256-Digests mit crypto.timingSafeEqual (gleiche Länge, zeitkonstant);
//   - das Token wird weder zurückgegeben noch protokolliert.

import { createHash, timingSafeEqual } from 'node:crypto'

export const OVERDUE_JOB_TOKEN_ENV = 'OVERDUE_JOB_TOKEN'
export const OVERDUE_JOB_TOKEN_MIN_LENGTH = 32

export type OverdueJobAuthResult =
  | { ok: true }
  | { ok: false; status: 401; reason: 'missing' | 'invalid' }
  | { ok: false; status: 503; reason: 'not_configured' }

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** Extrahiert das Token aus `Authorization: Bearer <Token>` (Schema ohne Beachtung der Groß-/Kleinschreibung, genau ein Leerzeichen). */
function readBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^bearer ([^\s]+)$/i.exec(header)
  return match ? match[1] : null
}

export function authenticateOverdueJobRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): OverdueJobAuthResult {
  const expected = env[OVERDUE_JOB_TOKEN_ENV]
  if (typeof expected !== 'string' || expected.length < OVERDUE_JOB_TOKEN_MIN_LENGTH) {
    return { ok: false, status: 503, reason: 'not_configured' }
  }

  const provided = readBearerToken(request.headers.get('authorization'))
  if (provided === null) return { ok: false, status: 401, reason: 'missing' }

  // Beide Seiten werden gehasht: gleiche Länge für timingSafeEqual, kein Rückschluss auf die Tokenlänge.
  return timingSafeEqual(digest(provided), digest(expected))
    ? { ok: true }
    : { ok: false, status: 401, reason: 'invalid' }
}
