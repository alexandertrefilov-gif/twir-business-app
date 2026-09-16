'use client'

import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { getSafeCallbackUrl, type AuthArea } from '@/lib/auth/callback-url'

export function ScopedLoginForm({ area }: { area: AuthArea }) {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = getSafeCallbackUrl(params.get('callbackUrl'), area)
  const provider = area === 'internal' ? 'internal-credentials' : 'collaboration-credentials'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await signIn(provider, { email: email.trim().toLowerCase(), password, redirect: false })
      if (result?.error) {
        setError(area === 'internal' ? 'E-Mail oder Passwort ungültig.' : 'Anmeldedaten oder Zugangsberechtigung ungültig.')
        return
      }
      router.push(callbackUrl)
      router.refresh()
    })
  }

  const collaboration = area === 'collaboration'
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12 flex items-center justify-center">
      <section className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-8 shadow-sm" aria-labelledby="login-title">
        <Link href="/" className="text-sm text-blue-700 hover:underline">← TWIR Portal</Link>
        <h1 id="login-title" className="mt-6 text-2xl font-600">{collaboration ? 'Projektportal anmelden' : 'Firmenverwaltung anmelden'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{collaboration ? 'Nur für freigeschaltete Projektpartner.' : 'Interner Unternehmensbereich.'}</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div><label className="field-label field-required" htmlFor={`${area}-email`}>E-Mail</label><input id={`${area}-email`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 w-full rounded-md border border-stone-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></div>
          <div><label className="field-label field-required" htmlFor={`${area}-password`}>Passwort</label><input id={`${area}-password`} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 w-full rounded-md border border-stone-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></div>
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={isPending} className="h-10 w-full rounded-md bg-blue-700 text-sm font-500 text-white hover:bg-blue-800 disabled:opacity-50">{isPending ? 'Anmelden…' : 'Anmelden'}</button>
        </form>
      </section>
    </main>
  )
}
