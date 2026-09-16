'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function CollaborationApprovalActions({ approvalId, canApprove, status = 'REQUESTED' }: { approvalId: string; canApprove: boolean; status?: string }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const decide = (decision: 'APPROVED' | 'REJECTED') => startTransition(async () => {
    setError(null)
    const response = await fetch('/api/collaboration/workflow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'decide-approval', id: approvalId, decision, decisionNote: note }) })
    const result = await response.json()
    if (!response.ok || !result.ok) { setError(result.error || 'Aktion fehlgeschlagen'); return }
    router.refresh()
  })
  if (!canApprove || status !== 'REQUESTED') return null
  return <div className="mt-3 flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor={`approval-note-${approvalId}`}>Entscheidungsnotiz</label><input id={`approval-note-${approvalId}`} value={note} onChange={(event) => setNote(event.target.value)} className="rounded border border-stone-300 px-2 py-1 text-sm" placeholder="Entscheidungsnotiz" /><button disabled={pending} onClick={() => decide('APPROVED')} className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-50">Genehmigen</button><button disabled={pending} onClick={() => decide('REJECTED')} className="rounded bg-red-700 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-50">Ablehnen</button>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</div>
}
