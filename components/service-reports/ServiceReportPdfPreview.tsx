'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ServiceReportItemInput } from '@/lib/validators/service-report.schema'

export interface ServiceReportPreviewDraft {
  reportId?: string
  orderId: string
  title: string
  description: string
  reportDate: string
  items: ServiceReportItemInput[]
}

export function ServiceReportPdfPreview({ draft, className = '' }: { draft: ServiceReportPreviewDraft; className?: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function openPreview() {
    setOpen(true)
    setLoading(true)
    setError('')
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }

    try {
      const response = await fetch('/api/services/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error || 'Vorschau konnte nicht erzeugt werden.')
      }
      setPreviewUrl(URL.createObjectURL(await response.blob()))
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Vorschau konnte nicht erzeugt werden.')
    } finally {
      setLoading(false)
    }
  }

  function closePreview() {
    setOpen(false)
  }

  return (
    <>
      <button type="button" onClick={() => void openPreview()}
        className={`h-9 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-500 text-blue-700 transition-colors hover:bg-blue-100 ${className}`}>
        PDF-Vorschau
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="service-preview-title">
          <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-3">
              <h2 id="service-preview-title" className="font-600">PDF-Vorschau Leistungsnachweis</h2>
              <button type="button" onClick={closePreview} aria-label="Vorschau schließen" className="flex h-9 w-9 items-center justify-center rounded text-xl text-muted-foreground hover:bg-stone-100">×</button>
            </div>
            <div className="min-h-0 flex-1 bg-stone-100">
              {loading && <div className="flex h-full items-center justify-center text-sm text-muted-foreground">PDF-Vorschau wird erzeugt …</div>}
              {!loading && error && <div className="flex h-full items-center justify-center p-6 text-sm text-red-700">{error}</div>}
              {!loading && previewUrl && (
                <iframe title="PDF-Vorschau Leistungsnachweis" src={previewUrl} className="h-full w-full border-0" />
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
