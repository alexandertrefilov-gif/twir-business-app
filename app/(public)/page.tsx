import React from 'react'
import { PortalAccessCard } from '@/components/portal/PortalAccessCard'
import { PortalHeader } from '@/components/portal/PortalHeader'
import { PortalHero } from '@/components/portal/PortalHero'
import { PortalTrustBar } from '@/components/portal/PortalTrustBar'

export default function PortalPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-stone-50 text-slate-950">
      <PortalHeader />
      <div className="mx-auto w-full max-w-7xl px-5 pb-8 pt-10 sm:px-8 sm:pb-10 sm:pt-14 lg:px-10 lg:pt-16">
        <PortalHero />
        <section aria-labelledby="portal-access-title" className="mt-10 sm:mt-12 lg:mt-14">
          <h2 id="portal-access-title" className="sr-only">Portalbereiche auswählen</h2>
          <div className="grid items-stretch gap-5 md:grid-cols-2 lg:gap-7">
            <PortalAccessCard variant="internal" title="Firmenverwaltung" description="Interner Unternehmensbereich für Mitarbeiter und berechtigte Nutzer." href="/intern/login" actionLabel="Zum internen Login" features={['Kunden & Projekte', 'Angebote, Aufträge, Rechnungen', 'Buchhaltung & Auswertungen', 'Interne Dokumente', 'Einstellungen & Verwaltung']} />
            <PortalAccessCard variant="collaboration" title="Zusammenarbeit" description="Projektportal für freigegebene Kunden, Betreiber und Projektpartner." href="/collaboration/login" actionLabel="Zum Projekt-Login" features={['Projektübersicht', 'Gemeinsame Dokumente', 'Aufgaben & Termine', 'Status & Fortschritt', 'Direkter Austausch']} />
          </div>
        </section>
        <PortalTrustBar />
      </div>
    </main>
  )
}
