import { getServerSession } from 'next-auth'
import { collaborationAuthOptions } from '@/lib/auth/collaboration-options'
import { SessionProvider } from '@/components/providers/SessionProvider'
export default async function CollaborationAuthLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider session={await getServerSession(collaborationAuthOptions)} basePath="/api/collaboration/auth">{children}</SessionProvider>
}
