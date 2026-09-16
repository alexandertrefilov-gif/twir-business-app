import React from 'react'

const qualities = ['Sicher', 'Zuverlässig', 'Partnerschaftlich']

export function PortalHeader() {
  return (
    <header className="border-b border-stone-200/90 bg-white/95">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-5 py-3 sm:px-8 lg:px-10">
        <div className="flex min-w-0 items-center gap-4" aria-label="TWIR">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-700 text-sm font-600 tracking-tight text-white" aria-hidden="true">T</span>
          <div><p className="text-base font-600 tracking-[0.12em] text-slate-950">TWIR</p><p className="text-[10px] font-600 uppercase tracking-[0.18em] text-slate-500">Technik. Lösungen. Zukunft.</p></div>
        </div>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-500 text-slate-500" aria-label="Unsere Werte">
          {qualities.map((quality) => <li key={quality}>{quality}</li>)}
        </ul>
      </div>
    </header>
  )
}
