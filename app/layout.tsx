// app/layout.tsx — FIXED: adds SessionProvider required by next-auth/react
import type { Metadata }  from 'next'
import { getServerSession } from 'next-auth'
import { authOptions }    from '@/lib/auth/options'
import { SessionProvider } from '@/components/providers/SessionProvider'
import './globals.css'

export const metadata: Metadata = {
  title: { template: '%s · Business App', default: 'Business App' },
  description: 'Angebots-, Auftrags- und Rechnungsverwaltung',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
