import Link from 'next/link'
import React from 'react'

type Props = {
  variant: 'internal' | 'collaboration'
  title: string
  description: string
  href: '/intern/login' | '/collaboration/login'
  actionLabel: string
  features: string[]
}

function AccessIcon({ variant }: { variant: Props['variant'] }) {
  if (variant === 'internal') return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M5.25 21V6.75L12 3l6.75 3.75V21M8.25 9h.01M8.25 12h.01M8.25 15h.01M12 9h.01M12 12h.01M12 15h.01M15.75 9h.01M15.75 12h.01M15.75 15h.01" /></svg>
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.1 9.1 0 0 0 3.74-.48 3 3 0 0 0-4.67-2.72M18 18.72v-.01c0-3.02-2.69-5.47-6-5.47s-6 2.45-6 5.47v.16A11.94 11.94 0 0 0 12 20.5c2.19 0 4.24-.59 6-1.65v-.13ZM15 7.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>
}

export function PortalAccessCard({ variant, title, description, href, actionLabel, features }: Props) {
  const internal = variant === 'internal'
  return (
    <article className={`group flex min-w-0 flex-col rounded-2xl border p-6 transition duration-200 hover:-translate-y-0.5 sm:p-8 ${internal ? 'border-slate-800 bg-slate-950 text-white shadow-[0_20px_55px_-35px_rgba(15,23,42,0.8)] hover:shadow-[0_24px_60px_-34px_rgba(15,23,42,0.9)]' : 'border-stone-200 bg-white text-slate-950 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.45)] hover:border-emerald-300 hover:shadow-[0_22px_55px_-36px_rgba(5,150,105,0.3)]'}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${internal ? 'bg-blue-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}><AccessIcon variant={variant} /></div>
      <h3 className="mt-6 text-2xl font-600 tracking-tight">{title}</h3>
      <p className={`mt-2 max-w-md text-sm leading-6 ${internal ? 'text-slate-300' : 'text-slate-600'}`}>{description}</p>
      <ul className={`mt-7 flex-1 space-y-3 text-sm ${internal ? 'text-slate-200' : 'text-slate-700'}`}>
        {features.map((feature) => <li key={feature} className="flex items-start gap-3"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-600 ${internal ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-50 text-emerald-700'}`} aria-hidden="true">✓</span><span>{feature}</span></li>)}
      </ul>
      <Link href={href} className={`mt-8 inline-flex min-h-11 w-full items-center justify-between rounded-lg px-4 text-sm font-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${internal ? 'bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-400 focus-visible:ring-offset-slate-950' : 'border border-emerald-600 bg-white text-emerald-800 hover:bg-emerald-50 focus-visible:ring-emerald-600'}`}><span>{actionLabel}</span><span aria-hidden="true">→</span></Link>
    </article>
  )
}
