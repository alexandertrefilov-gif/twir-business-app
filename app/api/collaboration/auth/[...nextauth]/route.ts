import NextAuth from 'next-auth'
import { collaborationAuthOptions } from '@/lib/auth/collaboration-options'
const handler = NextAuth(collaborationAuthOptions)
export { handler as GET, handler as POST }
