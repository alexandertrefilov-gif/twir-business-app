'use client'
import { useState, useTransition } from 'react'
import { finalizeServiceReportAction } from '@/app/(dashboard)/services/actions'
import { useRouter } from 'next/navigation'

export function ServiceReportFinalizeButton({ reportId }: { reportId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  return <div className="space-y-2">
    <button type="button" disabled={pending} onClick={() => startTransition(async () => {
      if (!window.confirm('Leistungsnachweis finalisieren? Danach ist keine Bearbeitung mehr möglich.')) return
      const result = await finalizeServiceReportAction(reportId)
      setMessage(result.error ?? (result.success ? 'Leistungsnachweis finalisiert.' : 'Finalisierung fehlgeschlagen.'))
      if (result.success) router.refresh()
    })} className="w-full rounded-md bg-blue-700 px-3 py-2 text-sm font-500 text-white disabled:opacity-50">{pending ? 'Wird finalisiert…' : 'Leistungsnachweis finalisieren'}</button>
    {message && <p className="text-xs text-muted-foreground" role="status">{message}</p>}
  </div>
}
