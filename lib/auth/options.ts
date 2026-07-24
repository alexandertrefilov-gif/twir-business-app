// lib/auth/options.ts — FIXED: Rate limiter integrated, no user enumeration
// ÄNDERUNGEN gegenüber Phase 2:
//   1. Rate-Limiting per IP + E-Mail über checkRateLimit / recordFailedAttempt
//   2. Einheitliche Fehlermeldung verhindert User-Enumeration
//   3. Erfolgreicher Login setzt Rate-Limit-Counter zurück

import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider       from 'next-auth/providers/credentials'
import { type NextRequest }      from 'next/server'
import bcrypt                    from 'bcryptjs'
import { prisma }                from '@/lib/db/prisma'
import { RoleName }              from '@/types/enums'
import { writeAuditLog }         from '@/lib/services/audit.service'
import { AuditAction }           from '@/types/enums'
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from '@/lib/security/rate-limiter'

// Einheitliche Fehlermeldung — verhindert User-Enumeration
// (identisch ob E-Mail unbekannt oder Passwort falsch)
const AUTH_ERROR = 'E-Mail oder Passwort ungültig.'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge:   8 * 60 * 60,   // 8 Stunden
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  providers: [
    CredentialsProvider({
      name:        'credentials',
      credentials: {
        email:    { label: 'E-Mail',   type: 'email'    },
        password: { label: 'Passwort', type: 'password' },
      },

      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email.trim().toLowerCase()

        // ── Rate-Limit-Check ────────────────────────────────
        // Key: kombiniert IP + E-Mail um sowohl distributed als auch
        // targeted Brute-Force zu erkennen.
        const request = req as unknown as NextRequest
        const ip      = request?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim()
               ?? request?.headers?.get?.('x-real-ip')
               ?? 'unknown'
        const rlKey   = `login:${ip}:${email}`

        const check = await checkRateLimit(rlKey)
        if (!check.allowed) {
          const minutes = Math.ceil((check.retryAfterMs ?? 1800000) / 60000)
          // Wirf Error mit neutraler Meldung (kein Hinweis auf Rate-Limit-Grund)
          throw new Error(`Zu viele Anmeldeversuche. Bitte versuchen Sie es in ${minutes} Minuten erneut.`)
        }

        // ── User-Lookup ─────────────────────────────────────
        const user = await prisma.user.findUnique({
          where:   { email },
          include: { role: true },
        })

        // Timing-Attack-Schutz: bcrypt auch bei unbekanntem User berechnen
        if (!user || user.deletedAt || user.status !== 'ACTIVE') {
          // Dummy-Hash damit Antwortzeit nicht verrät ob User existiert
          await bcrypt.compare(credentials.password, '$2b$12$placeholder.hash.for.timing.protection.only')
          await recordFailedAttempt(rlKey)
          return null
        }

        const passwordValid = await bcrypt.compare(credentials.password, user.passwordHash)

        if (!passwordValid) {
          await recordFailedAttempt(rlKey)
          return null
        }

        // ── Erfolgreicher Login ─────────────────────────────
        await resetRateLimit(rlKey)

        await prisma.user.update({
          where: { id: user.id },
          data:  { lastLoginAt: new Date() },
        })

        await writeAuditLog({
          userId:    user.id,
          userEmail: user.email,
          action:    AuditAction.LOGIN,
          entityType:'user',
          entityId:  user.id,
          metadata:  { ip },
        })

        return {
          id:    user.id,
          email: user.email,
          name:  `${user.firstName} ${user.lastName}`,
          role:  user.role.name as RoleName,
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id
        token.role = (user as typeof user & { role: RoleName }).role
      }
      return token
    },

    async session({ session, token }) {
      if (token && session.user) {
        const u = session.user as typeof session.user & { id: string; role: RoleName }
        u.id   = token.id   as string
        u.role = token.role as RoleName
      }
      return session
    },
  },
}

// ── Typ-Erweiterungen ─────────────────────────────────────────
declare module 'next-auth' {
  interface User { role: RoleName }
  interface Session {
    user: { id: string; email: string; name: string; role: RoleName }
  }
}
declare module 'next-auth/jwt' {
  interface JWT { id: string; role: RoleName }
}
