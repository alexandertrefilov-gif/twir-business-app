'use client'
// app/(auth)/login/page.tsx

import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { getSafeCallbackUrl } from '@/lib/auth/callback-url'

export default function LoginPage() {
  const router       = useRouter()
  const params       = useSearchParams()
  const callbackUrl  = getSafeCallbackUrl(params.get('callbackUrl'))

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await signIn('credentials', {
        email:    email.trim().toLowerCase(),
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('E-Mail oder Passwort ungültig.')
        return
      }
      router.push(callbackUrl)
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">

      {/* ── Left panel: branding ── */}
      <div
        className="hidden lg:flex flex-col justify-between p-12"
        style={{ background: 'hsl(220 22% 11%)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"/>
            </svg>
          </div>
          <span className="text-white font-600 text-sm tracking-wide">Business App</span>
        </div>

        <div>
          <blockquote className="text-slate-300 text-lg font-300 leading-relaxed mb-6">
            »Kein Angebot verloren.<br/>
            Keine Rechnung vergessen.<br/>
            Kein Auftrag unklar.«
          </blockquote>
          <div className="flex gap-3">
            {['Kunden', 'Angebote', 'Aufträge', 'Rechnungen'].map((t) => (
              <span
                key={t}
                className="text-xs px-2.5 py-1 rounded border"
                style={{
                  borderColor: 'hsl(220 18% 22%)',
                  color:       'hsl(220 12% 52%)',
                  background:  'hsl(220 18% 14%)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs" style={{ color: 'hsl(220 10% 38%)' }}>
          Intern · Nicht öffentlich zugänglich
        </p>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex items-center justify-center p-8" style={{ background: 'hsl(var(--background))' }}>
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"/>
              </svg>
            </div>
            <span className="font-600 text-sm">Business App</span>
          </div>

          <h1 className="text-xl font-600 text-foreground mb-1">Anmelden</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Mit Ihrem Unternehmenskonto fortfahren
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label field-required" htmlFor="email">
                E-Mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="
                  w-full h-10 px-3 rounded-md border border-stone-200 bg-white
                  text-sm text-foreground placeholder:text-muted-foreground
                  focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent
                  transition
                "
                placeholder="name@unternehmen.de"
              />
            </div>

            <div>
              <label className="field-label field-required" htmlFor="password">
                Passwort
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="
                  w-full h-10 px-3 rounded-md border border-stone-200 bg-white
                  text-sm text-foreground placeholder:text-muted-foreground
                  focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent
                  transition
                "
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="
                w-full h-10 rounded-md bg-blue-700 hover:bg-blue-800
                text-white text-sm font-500
                focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Anmelden…
                </span>
              ) : 'Anmelden'}
            </button>
          </form>

          <p className="mt-8 text-xs text-center text-muted-foreground">
            Passwort vergessen? Wenden Sie sich an Ihren Administrator.
          </p>
        </div>
      </div>

    </div>
  )
}
