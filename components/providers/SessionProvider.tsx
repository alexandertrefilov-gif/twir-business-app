'use client'
// components/providers/SessionProvider.tsx
// next-auth/react requires SessionProvider to wrap the app for client-side auth hooks.
// Used in app/layout.tsx.

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'

interface Props {
  children: React.ReactNode
  session:  Session | null
  basePath?: string
}

export function SessionProvider({ children, session, basePath }: Props) {
  return (
    <NextAuthSessionProvider session={session} basePath={basePath}>
      {children}
    </NextAuthSessionProvider>
  )
}
