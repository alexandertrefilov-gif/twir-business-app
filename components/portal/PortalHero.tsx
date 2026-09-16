import React from 'react'

export function PortalHero() {
  return (
    <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:gap-16" aria-labelledby="portal-title">
      <div className="max-w-2xl">
        <p className="text-xs font-600 uppercase tracking-[0.2em] text-blue-700">Willkommen bei TWIR</p>
        <h1 id="portal-title" className="mt-4 text-4xl font-600 tracking-[-0.035em] text-slate-950 sm:text-5xl lg:text-6xl">TWIR Portal</h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl"><span className="font-500 text-slate-800">Eine Plattform. Zwei Bereiche.</span><br />Wählen Sie den für Sie freigegebenen Zugang.</p>
      </div>
      <div className="relative hidden min-h-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] lg:block" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.13)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.13)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-blue-100/80 blur-2xl" />
        <div className="absolute bottom-0 left-0 h-2/3 w-full bg-gradient-to-t from-slate-100/90 to-transparent" />
        <svg viewBox="0 0 520 240" className="absolute inset-x-5 bottom-0 h-auto w-[calc(100%-2.5rem)] text-slate-700" fill="none"><path d="M10 220V142L94 99V220M94 220V58L207 116V220M207 220V82L316 32V220M316 220V113L404 73V220M404 220V128L510 91V220" stroke="currentColor" strokeWidth="2" /><path d="M31 153h38m-38 22h38m-38 22h38M119 89h46m-46 27h46m-46 27h46m-46 27h46m-46 27h46M233 99h56m-56 30h56m-56 30h56m-56 30h56M340 126h39m-39 27h39m-39 27h39M430 139h52m-52 25h52m-52 25h52" stroke="currentColor" strokeOpacity=".35" /><path d="M10 220h500" stroke="#2563eb" strokeWidth="3" /></svg>
        <p className="absolute right-6 top-5 text-[11px] font-600 uppercase tracking-[0.18em] text-slate-500">Digitale Projektwelt</p>
      </div>
    </section>
  )
}
