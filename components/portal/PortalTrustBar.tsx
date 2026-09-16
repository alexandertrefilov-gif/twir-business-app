import React from 'react'

const trustItems = [
  ['Sicher', 'Ihre Daten sind geschützt.'],
  ['Zuverlässig', 'Stabile und moderne Technologie.'],
  ['Partnerschaftlich', 'Gemeinsam erfolgreich.'],
  ['Nachhaltig', 'Für eine starke Zukunft.'],
] as const

export function PortalTrustBar() {
  return (
    <section aria-labelledby="trust-title" className="mt-8 border-t border-stone-200 py-8 sm:mt-10">
      <h2 id="trust-title" className="sr-only">Qualität und Vertrauen</h2>
      <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {trustItems.map(([title, description]) => <li key={title} className="flex items-start gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-hidden="true" /><div><h3 className="text-sm font-600 text-slate-800">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div></li>)}
      </ul>
    </section>
  )
}
