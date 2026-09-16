'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

const TEMPLATES: Array<{ key: 'BESTANDSAUFNAHME' | 'PLANUNG' | 'ABNAHME'; label: string }> = [
  { key: 'BESTANDSAUFNAHME', label: 'Bestandsaufnahme-Checkliste' },
  { key: 'PLANUNG', label: 'Planungs-Checkliste' },
  { key: 'ABNAHME', label: 'Abnahme-Checkliste' },
]

export function GgaCabinetChecklistTemplateButtons({ cabinetId, canEdit }: { cabinetId: string; canEdit: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (!canEdit) return null

  const apply = (templateKey: string) => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/collaboration/workflow', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'apply-cabinet-checklist-template', id: cabinetId, templateKey }),
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Vorlage konnte nicht angewendet werden')
        setMessage(result.result.created > 0 ? `${result.result.created} Punkt(e) hinzugefügt.` : 'Vorlage war bereits vollständig angewendet.')
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen')
      }
    })
  }

  return <div className="mt-3 rounded-md bg-stone-50 p-3">
    <p className="text-xs font-600">Vorlage anwenden</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {TEMPLATES.map((tpl) => <button key={tpl.key} disabled={pending} onClick={() => apply(tpl.key)} className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs disabled:opacity-50">{tpl.label}</button>)}
    </div>
    {message && <p className="mt-2 text-xs text-emerald-700">{message}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </div>
}
