'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

// Bewusste Aktion statt einfachem Toggle (Vorgabe Abschnitt 8/9): Freigabe
// erfordert eine explizite Bestätigung, Beanstandung eine Begründung.
export function GgaCabinetOperatorDecisionPanel({ approvalId }: { approvalId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'idle' | 'freigeben' | 'beanstanden'>('idle')
  const [unterlagenGeprueft, setUnterlagenGeprueft] = useState(false)
  const [kommentar, setKommentar] = useState('')
  const [grund, setGrund] = useState('')

  const decide = (decision: 'APPROVED' | 'REJECTED', extra: Record<string, unknown>) => {
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/collaboration/workflow', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'decide-operator-approval', id: approvalId, decision, ...extra }),
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Aktion fehlgeschlagen')
        setMode('idle')
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen')
      }
    })
  }

  if (mode === 'idle') {
    return <div className="flex flex-wrap gap-3">
      <button onClick={() => setMode('freigeben')} className="rounded-lg bg-emerald-700 px-6 py-3 text-base font-600 text-white">Freigeben</button>
      <button onClick={() => setMode('beanstanden')} className="rounded-lg bg-red-700 px-6 py-3 text-base font-600 text-white">Beanstanden</button>
    </div>
  }

  if (mode === 'freigeben') {
    return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <h3 className="text-base font-600 text-emerald-900">Betreiberfreigabe</h3>
      <p className="mt-2 text-sm text-emerald-900">Ich bestätige, dass die bereitgestellten Unterlagen und der dokumentierte Zustand des GGA-Schrankes geprüft wurden.</p>
      <label className="mt-3 flex items-center gap-2 text-sm text-emerald-900">
        <input type="checkbox" checked={unterlagenGeprueft} onChange={(e) => setUnterlagenGeprueft(e.target.checked)} className="h-5 w-5" />
        Unterlagen geprüft
      </label>
      <label className="mt-3 block text-sm text-emerald-900">
        Kommentar (optional)
        <textarea value={kommentar} onChange={(e) => setKommentar(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-emerald-300 px-3 py-2 text-base" />
      </label>
      <p className="mt-2 text-xs text-emerald-800">Name und Datum werden automatisch aus Ihrem Benutzerkonto übernommen.</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button disabled={pending || !unterlagenGeprueft} onClick={() => decide('APPROVED', { unterlagenGeprueft, decisionNote: kommentar || undefined })} className="rounded-lg bg-emerald-700 px-6 py-3 text-base font-600 text-white disabled:opacity-50">Freigabe erteilen</button>
        <button disabled={pending} onClick={() => setMode('idle')} className="rounded-lg border border-stone-300 px-6 py-3 text-base">Abbrechen</button>
      </div>
    </div>
  }

  return <div className="rounded-xl border border-red-200 bg-red-50 p-5">
    <h3 className="text-base font-600 text-red-900">Beanstandung</h3>
    <label className="mt-3 block text-sm text-red-900">
      Grund <span className="text-red-700">*</span>
      <textarea value={grund} onChange={(e) => setGrund(e.target.value)} rows={3} required className="mt-1 w-full rounded-lg border border-red-300 px-3 py-2 text-base" placeholder="z. B. Kennzeichnung am Schrank fehlt." />
    </label>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    <div className="mt-4 flex gap-3">
      <button disabled={pending || !grund.trim()} onClick={() => decide('REJECTED', { decisionNote: grund })} className="rounded-lg bg-red-700 px-6 py-3 text-base font-600 text-white disabled:opacity-50">Beanstandung senden</button>
      <button disabled={pending} onClick={() => setMode('idle')} className="rounded-lg border border-stone-300 px-6 py-3 text-base">Abbrechen</button>
    </div>
  </div>
}
