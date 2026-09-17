'use client'

import { useState } from 'react'

interface DocumentPrintButtonProps {
  pdfUrl: string
  className?: string
}

export function DocumentPrintButton({ pdfUrl, className = '' }: DocumentPrintButtonProps) {
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')

  async function printDocument() {
    if (printing) return
    setPrinting(true)
    setError('')
    try {
      const response = await fetch(pdfUrl, { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? 'Dokument konnte nicht geladen werden.')
      }
      const blobUrl = URL.createObjectURL(await response.blob())
      const frame = document.createElement('iframe')
      frame.title = 'Dokument drucken'
      frame.style.position = 'fixed'
      frame.style.width = '1px'
      frame.style.height = '1px'
      frame.style.opacity = '0'
      frame.style.pointerEvents = 'none'
      frame.onload = () => {
        window.setTimeout(() => {
          frame.contentWindow?.focus()
          frame.contentWindow?.print()
          window.setTimeout(() => {
            URL.revokeObjectURL(blobUrl)
            frame.remove()
          }, 60_000)
        }, 100)
      }
      frame.src = blobUrl
      document.body.appendChild(frame)
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'Drucken ist fehlgeschlagen.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => void printDocument()}
        disabled={printing}
        className={`${className} w-full disabled:cursor-wait disabled:opacity-60`}
      >
        {printing ? 'Laden …' : 'Drucken'}
      </button>
      {error && <p className="mt-1 text-[10px] leading-tight text-red-700" role="alert">{error}</p>}
    </div>
  )
}
