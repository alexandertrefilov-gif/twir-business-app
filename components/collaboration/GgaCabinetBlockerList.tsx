'use client'

import { useRouter } from 'next/navigation'
import { Fragment, useState, useTransition } from 'react'

type Blocker = {
  id: string
  title: string
  status: 'OPEN' | 'RESOLVED'
  cause: string | null
  resolution: string | null
  resolvedAt: string | null
}

export function GgaCabinetBlockerList({ blockers, canResolve }: { blockers: Blocker[]; canResolve: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [openFormId, setOpenFormId] = useState<string | null>(null)
  const [resolutionText, setResolutionText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const startResolve = (blockerId: string) => {
    setOpenFormId(blockerId)
    setResolutionText('')
    setError(null)
  }

  const submitResolve = (blockerId: string) => {
    const resolution = resolutionText.trim()
    if (!resolution) { setError('Bitte beschreiben, wie der Mangel behoben wurde.'); return }
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/collaboration/workflow', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'resolve-blocker', id: blockerId, resolution }),
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Mangel konnte nicht als behoben markiert werden')
        setOpenFormId(null)
        setResolutionText('')
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen')
      }
    })
  }

  return <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
    <table className="min-w-full text-left text-sm">
      <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          <th className="px-4 py-2">Titel</th>
          <th className="px-4 py-2">Status</th>
          <th className="px-4 py-2">Ursache</th>
          <th className="px-4 py-2">Behebung</th>
          {canResolve && <th className="px-4 py-2" />}
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {blockers.map((blocker) => <Fragment key={blocker.id}>
          <tr>
            <td className="px-4 py-2">{blocker.title}</td>
            <td className="px-4 py-2">{blocker.status === 'OPEN' ? 'Offen' : 'Behoben'}</td>
            <td className="px-4 py-2 text-xs text-muted-foreground">{blocker.cause ?? '–'}</td>
            <td className="px-4 py-2 text-xs text-muted-foreground">
              {blocker.status === 'RESOLVED' ? `${blocker.resolution ?? '–'}${blocker.resolvedAt ? ` (${new Date(blocker.resolvedAt).toLocaleDateString('de-DE')})` : ''}` : '–'}
            </td>
            {canResolve && <td className="px-4 py-2 text-right">
              {blocker.status === 'OPEN' && openFormId !== blocker.id && <button type="button" disabled={pending} onClick={() => startResolve(blocker.id)} className="text-xs text-emerald-700 hover:underline">Beheben</button>}
            </td>}
          </tr>
          {canResolve && openFormId === blocker.id && <tr>
            <td colSpan={5} className="bg-stone-50 px-4 py-3">
              <form onSubmit={(event) => { event.preventDefault(); submitResolve(blocker.id) }} className="flex flex-wrap items-start gap-2">
                <label className="sr-only" htmlFor={`resolution-${blocker.id}`}>Behebungsbeschreibung</label>
                <textarea
                  id={`resolution-${blocker.id}`}
                  required
                  value={resolutionText}
                  onChange={(event) => setResolutionText(event.target.value)}
                  placeholder="Wie wurde der Mangel behoben?"
                  className="min-w-[260px] flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-600 text-white disabled:opacity-50">Als behoben speichern</button>
                  <button type="button" disabled={pending} onClick={() => setOpenFormId(null)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs">Abbrechen</button>
                </div>
              </form>
            </td>
          </tr>}
        </Fragment>)}
      </tbody>
    </table>
    {blockers.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Keine Blocker.</p>}
    {error && <p role="alert" className="px-4 pb-3 text-xs text-red-700">{error}</p>}
  </div>
}
