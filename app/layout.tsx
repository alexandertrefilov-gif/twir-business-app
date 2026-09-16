import type { Metadata }  from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { template: '%s · Business App', default: 'Business App' },
  description: 'Angebots-, Auftrags- und Rechnungsverwaltung',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  )
}
