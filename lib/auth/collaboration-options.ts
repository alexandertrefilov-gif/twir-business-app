import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '@/lib/security/rate-limiter'
import { authCookies } from '@/lib/auth/session-cookies'
import { getRequestHeader } from '@/lib/auth/request-headers'
import { DUMMY_PASSWORD_HASH } from '@/lib/auth/password-timing'

type CollaborationCredentials = { email?: string; password?: string }

export async function authorizeCollaborationCredentials(
  credentials: CollaborationCredentials | undefined,
  req: unknown,
) {
  if (!credentials?.email || !credentials?.password) return null
  const email = credentials.email.trim().toLowerCase()
  const ip = getRequestHeader(req, 'x-forwarded-for')?.split(',')[0]?.trim()
    ?? getRequestHeader(req, 'x-real-ip')
    ?? 'unknown'
  const rateLimitKey = `collaboration-login:${ip}:${email}`
  const check = await checkRateLimit(rateLimitKey)
  if (!check.allowed) return null

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, passwordHash: true, firstName: true, lastName: true,
      status: true, deletedAt: true,
      collaborationMemberships: {
        where: { active: true, project: { active: true, deletedAt: null } },
        select: { id: true }, take: 1,
      },
    },
  })

  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    await bcrypt.compare(credentials.password, DUMMY_PASSWORD_HASH)
    await recordFailedAttempt(rateLimitKey)
    return null
  }
  const passwordValid = await bcrypt.compare(credentials.password, user.passwordHash)
  if (!passwordValid || user.collaborationMemberships.length === 0) {
    await recordFailedAttempt(rateLimitKey)
    return null
  }
  await resetRateLimit(rateLimitKey)
  return { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`, authScope: 'COLLABORATION' as const }
}

export const collaborationAuthOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: {
    signIn: '/collaboration/login',
    error: '/collaboration/login',
  },
  cookies: authCookies('collaboration'),
  providers: [
    CredentialsProvider({
      id: 'collaboration-credentials',
      name: 'collaboration-credentials',
      credentials: {
        email: { label: 'E-Mail', type: 'email' },
        password: { label: 'Passwort', type: 'password' },
      },
      async authorize(credentials, req) {
        return authorizeCollaborationCredentials(credentials, req)
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.authScope = 'COLLABORATION'
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.authScope = 'COLLABORATION'
      }
      return session
    },
  },
}
