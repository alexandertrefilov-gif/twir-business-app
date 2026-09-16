import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { collaborationAuthOptions } from '@/lib/auth/collaboration-options'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { CollaborationShell } from '@/components/collaboration/CollaborationShell'

export default async function CollaborationLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(collaborationAuthOptions)
  if (!session?.user || session.user.authScope !== 'COLLABORATION') redirect('/collaboration/login')
  return <SessionProvider session={session} basePath="/api/collaboration/auth"><CollaborationShell userName={session.user.name}>{children}</CollaborationShell></SessionProvider>
}
