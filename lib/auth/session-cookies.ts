const secure = process.env.NODE_ENV === 'production'
const prefix = secure ? '__Secure-' : ''

export const INTERNAL_SESSION_COOKIE = `${prefix}twir-internal-session`
export const COLLABORATION_SESSION_COOKIE = `${prefix}twir-collaboration-session`

export function sessionCookie(name: string) {
  return {
    name,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure,
    },
  }
}

export function authCookies(area: 'internal' | 'collaboration') {
  const cookiePrefix = `${prefix}twir-${area}`
  return {
    sessionToken: sessionCookie(`${cookiePrefix}-session`),
    callbackUrl: {
      name: `${cookiePrefix}-callback-url`,
      options: { sameSite: 'lax' as const, path: '/', secure },
    },
    csrfToken: {
      name: `${cookiePrefix}-csrf-token`,
      options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure },
    },
  }
}
