// app/api/auth/[...nextauth]/route.ts
// KRITISCH: Dieser Route-Handler ist zwingend erforderlich für NextAuth in Next.js 14.
// Ohne diese Datei schlägt jeder signIn()-Aufruf mit 404 fehl.

import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth/options'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
