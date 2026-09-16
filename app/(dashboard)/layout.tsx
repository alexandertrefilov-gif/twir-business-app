// app/(dashboard)/layout.tsx
import { getServerSession } from 'next-auth'
import { redirect }         from 'next/navigation'
import { authOptions }      from '@/lib/auth/options'
import { DashboardShell }   from '@/components/layout/DashboardShell'
import { SessionProvider } from '@/components/providers/SessionProvider'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || session.user.authScope !== 'INTERNAL') redirect('/intern/login')

  return (
    <SessionProvider session={session} basePath="/api/intern/auth">
      <DashboardShell
        userName={session.user.name}
        userEmail={session.user.email}
        userRole={session.user.role}
      >
        {children}
      </DashboardShell>
    </SessionProvider>
  )
}
