import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { SessionProvider } from '@/components/providers/SessionProvider'
export default async function InternalAuthLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider session={await getServerSession(authOptions)} basePath="/api/intern/auth">{children}</SessionProvider>
}
