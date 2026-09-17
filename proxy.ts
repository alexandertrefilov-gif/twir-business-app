import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'
import { COLLABORATION_SESSION_COOKIE, INTERNAL_SESSION_COOKIE } from '@/lib/auth/session-cookies'

const PUBLIC_PATHS = new Set(['/', '/intern/login', '/collaboration/login', '/login'])

function loginRedirect(req: NextRequest, loginPath: string) {
  const url = new URL(loginPath, req.url)
  url.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.redirect(url)
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const collaborationArea = pathname.startsWith('/collaboration/')
    || pathname.startsWith('/api/collaboration/')
  const cookieName = collaborationArea
    ? COLLABORATION_SESSION_COOKIE
    : INTERNAL_SESSION_COOKIE
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, cookieName })
  const expectedScope = collaborationArea ? 'COLLABORATION' : 'INTERNAL'

  if (token?.authScope === expectedScope) {
    const response = NextResponse.next()
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    return response
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }
  return loginRedirect(req, collaborationArea ? '/collaboration/login' : '/intern/login')
}

export const config = {
  matcher: [
    '/((?!api/auth|api/intern/auth|api/collaboration/auth|_next/static|_next/image|favicon.ico|public).*)',
  ],
}
