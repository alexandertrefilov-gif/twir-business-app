// middleware.ts — Auth-Guard für alle geschützten Routen
// Läuft auf Edge Runtime vor jedem Request

import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    // Hier können spätere Erweiterungen rein:
    // - Rate Limiting für Login
    // - IP-Blocking
    // - Redirect-Logik nach Rolle
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  },
)

// Alle Routen außer Login und statischen Assets schützen
export const config = {
  matcher: [
    '/((?!api/auth|login|_next/static|_next/image|favicon.ico|public).*)',
  ],
}
