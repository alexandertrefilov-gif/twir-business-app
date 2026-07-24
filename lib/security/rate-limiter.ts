// lib/security/rate-limiter.ts
// Rate-Limiting für Login-Endpunkte
//
// MVP: In-Memory-Store (nicht persistent über Server-Neustarts).
// Produktion: Store durch Redis ersetzen (Interface identisch).
//
// Schützt gegen:
//   - Brute-Force auf Passwörter
//   - Credential-Stuffing
//   - automatisierte Login-Versuche
//
// ANNAHME: In Next.js Middleware oder NextAuth authorize() aufrufen.
// Für Cluster-Deployments: Redis-Adapter einbauen (Adapter-Pattern unten).

// ── Config ────────────────────────────────────────────────────

const WINDOW_MS       = 15 * 60 * 1000  // 15-Minuten-Fenster
const MAX_ATTEMPTS    = 10              // Max Versuche pro Fenster
const LOCKOUT_MS      = 30 * 60 * 1000  // 30 Minuten Lockout nach Überschreitung

// ── In-Memory Store ───────────────────────────────────────────

interface AttemptRecord {
  count:      number
  windowStart: number
  lockedUntil?: number
}

const store = new Map<string, AttemptRecord>()

// Cleanup expired entries (läuft im gleichen Prozess)
let cleanupTimer: NodeJS.Timeout | null = null
function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, record] of store.entries()) {
      if (
        (!record.lockedUntil || record.lockedUntil < now) &&
        now - record.windowStart > WINDOW_MS
      ) {
        store.delete(key)
      }
    }
  }, 5 * 60 * 1000)  // alle 5 Minuten aufräumen
  if (cleanupTimer.unref) cleanupTimer.unref()
}

// ── Store Interface (für Redis-Austausch) ────────────────────

export interface RateLimitStore {
  get:       (key: string) => Promise<AttemptRecord | null>
  set:       (key: string, record: AttemptRecord) => Promise<void>
  delete:    (key: string) => Promise<void>
}

// Default: In-Memory
const defaultStore: RateLimitStore = {
  async get(key)          { return store.get(key) ?? null },
  async set(key, record)  { store.set(key, record) },
  async delete(key)       { store.delete(key) },
}

let activeStore: RateLimitStore = defaultStore

/** Für Produktion: Redis-Adapter injizieren */
export function setRateLimitStore(s: RateLimitStore) {
  activeStore = s
}

// ── Public API ────────────────────────────────────────────────

export interface RateLimitCheckResult {
  allowed:         boolean
  remainingAttempts: number
  retryAfterMs?:   number
  lockedUntil?:    Date
}

/**
 * Prüft ob eine IP oder E-Mail weitere Login-Versuche machen darf.
 * Schlüssel kann IP-Adresse oder E-Mail oder Kombination sein.
 *
 * @example
 * const result = await checkRateLimit(`login:${ip}`)
 * if (!result.allowed) throw new Error('Too many attempts')
 */
export async function checkRateLimit(key: string): Promise<RateLimitCheckResult> {
  ensureCleanup()

  const now    = Date.now()
  const record = await activeStore.get(key)

  // Locked?
  if (record?.lockedUntil && record.lockedUntil > now) {
    return {
      allowed:           false,
      remainingAttempts: 0,
      retryAfterMs:      record.lockedUntil - now,
      lockedUntil:       new Date(record.lockedUntil),
    }
  }

  // New window or expired?
  if (!record || now - record.windowStart > WINDOW_MS) {
    return {
      allowed:           true,
      remainingAttempts: MAX_ATTEMPTS - 1,
    }
  }

  const remaining = MAX_ATTEMPTS - record.count - 1
  if (remaining < 0) {
    const lockedUntil = now + LOCKOUT_MS
    await activeStore.set(key, { ...record, lockedUntil })
    return {
      allowed:           false,
      remainingAttempts: 0,
      retryAfterMs:      LOCKOUT_MS,
      lockedUntil:       new Date(lockedUntil),
    }
  }

  return { allowed: true, remainingAttempts: remaining }
}

/**
 * Registriert einen fehlgeschlagenen Versuch.
 * Aufrufen NACH checkRateLimit wenn Authentifizierung scheitert.
 */
export async function recordFailedAttempt(key: string): Promise<RateLimitCheckResult> {
  ensureCleanup()

  const now    = Date.now()
  const record = await activeStore.get(key)

  let updated: AttemptRecord

  if (!record || now - record.windowStart > WINDOW_MS) {
    updated = { count: 1, windowStart: now }
  } else {
    updated = { ...record, count: record.count + 1 }
  }

  // Lock if threshold exceeded
  if (updated.count >= MAX_ATTEMPTS) {
    updated.lockedUntil = now + LOCKOUT_MS
  }

  await activeStore.set(key, updated)

  const remaining = Math.max(0, MAX_ATTEMPTS - updated.count)
  return {
    allowed:           remaining > 0 && !updated.lockedUntil,
    remainingAttempts: remaining,
    retryAfterMs:      updated.lockedUntil ? updated.lockedUntil - now : undefined,
    lockedUntil:       updated.lockedUntil ? new Date(updated.lockedUntil) : undefined,
  }
}

/**
 * Setzt Counter zurück nach erfolgreichem Login.
 */
export async function resetRateLimit(key: string): Promise<void> {
  await activeStore.delete(key)
}

// ── Integration: NextAuth authorize() ─────────────────────────
//
// Verwendungsbeispiel in lib/auth/options.ts:
//
// async authorize(credentials, req) {
//   const ip  = req?.headers?.['x-forwarded-for'] ?? 'unknown'
//   const key = `login:${ip}:${credentials?.email}`
//
//   const check = await checkRateLimit(key)
//   if (!check.allowed) {
//     throw new Error(`Zu viele Anmeldeversuche. Bitte versuchen Sie es in ${
//       Math.ceil((check.retryAfterMs ?? 0) / 60000)
//     } Minuten erneut.`)
//   }
//
//   const user = await prisma.user.findUnique(...)
//   if (!passwordValid) {
//     await recordFailedAttempt(key)
//     return null
//   }
//   await resetRateLimit(key)
//   return user
// }
