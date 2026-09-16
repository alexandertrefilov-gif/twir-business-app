'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

const DOCUMENT_KINDS = ['Foto', 'Protokoll', 'Pruefbericht', 'Planzeichnung', 'Sonstiges'] as const
const DOCUMENT_KIND_LABELS: Record<string, string> = { Foto: 'Foto', Protokoll: 'Protokoll', Pruefbericht: 'Prüfbericht', Planzeichnung: 'Planzeichnung', Sonstiges: 'Sonstiges' }

export function GgaCabinetDocumentUpload({ projectId, cabinetId, canUpload }: { projectId: string; cabinetId: string; canUpload: boolean }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [documentKind, setDocumentKind] = useState<string>('Foto')

  if (!canUpload) return null

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Bitte eine Datei auswählen.'); return }
    const formData = new FormData()
    formData.set('file', file)
    formData.set('projectId', projectId)
    formData.set('cabinetId', cabinetId)
    formData.set('documentKind', documentKind)
    startTransition(async () => {
      try {
        const response = await fetch('/api/collaboration/documents', { method: 'POST', body: formData })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Upload fehlgeschlagen')
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Upload fehlgeschlagen')
      }
    })
  }

  return <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 rounded-md bg-stone-50 p-3">
    <label className="block">
      <span className="text-xs font-600">Dokumentart</span>
      <select value={documentKind} onChange={(event) => setDocumentKind(event.target.value)} className="mt-1 rounded border border-stone-300 px-2 py-1 text-sm">
        {DOCUMENT_KINDS.map((kind) => <option key={kind} value={kind}>{DOCUMENT_KIND_LABELS[kind]}</option>)}
      </select>
    </label>
    <label className="block">
      <span className="text-xs font-600">Datei</span>
      <input ref={fileRef} type="file" required className="mt-1 block text-sm" />
    </label>
    <button disabled={pending} className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">Hochladen</button>
    {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
  </form>
}
