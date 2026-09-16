'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export function GgaCabinetDocumentVisibilityToggle({ documentId, visibility, canChange }: {
  documentId: string
  visibility: 'INTERNAL' | 'EXTERNAL'
  canChange: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (!canChange) return <span className={`rounded-full px-2 py-0.5 text-xs font-600 ${visibility === 'EXTERNAL' ? 'bg-green-100 text-green-800' : 'bg-stone-100 text-stone-600'}`}>{visibility === 'EXTERNAL' ? 'Betreiber sichtbar' : 'Intern'}</span>

  const toggle = () => {
    const next = visibility === 'EXTERNAL' ? 'INTERNAL' : 'EXTERNAL'
    startTransition(async () => {
      await fetch('/api/collaboration/workflow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'set-document-visibility', id: documentId, visibility: next }) })
      router.refresh()
    })
  }

  return <button disabled={pending} onClick={toggle} className={`rounded-full px-2 py-0.5 text-xs font-600 disabled:opacity-50 ${visibility === 'EXTERNAL' ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
    {visibility === 'EXTERNAL' ? 'Betreiber sichtbar — zurücknehmen' : 'Intern — für Betreiber freigeben'}
  </button>
}
