'use client'
// components/documents/DocumentArchive.tsx
// Wiederverwendbares Dokumenten-Widget — für Kunden, Aufträge, Rechnungen

import { useState }           from 'react'
import { useRouter }          from 'next/navigation'
import { ConfirmDialog }      from '@/components/shared/ConfirmDialog'
import { deleteDocumentAction } from '@/app/(dashboard)/documents/actions'
import { formatFileSize }     from '@/lib/services/document.service'
import { format }             from 'date-fns'
import { de }                 from 'date-fns/locale'
import type { DocumentListItem } from '@/lib/services/document.service'

interface DocumentArchiveProps {
  documents:   DocumentListItem[]
  canDelete:   boolean
  entityLabel?: string
}

const MIME_ICONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg':      'img',
  'image/png':       'img',
  'application/vnd.ms-excel': 'xls',
  'text/csv':        'csv',
}

const DOC_TYPE_LABELS: Record<string, string> = {
  OFFER_PDF:          'Angebot-PDF',
  ORDER_PDF:          'Auftrags-PDF',
  INVOICE_PDF:        'Rechnungs-PDF',
  SERVICE_REPORT_PDF: 'Leistungsnachweis',
  CORRECTION_PDF:     'Korrektur-PDF',
  CANCELLATION_PDF:   'Storno-PDF',
  DUNNING_PDF:        'Mahnung',
  UPLOAD:             'Upload',
  OTHER:              'Sonstiges',
}

export function DocumentArchive({
  documents, canDelete, entityLabel,
}: DocumentArchiveProps) {
  const router            = useRouter()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (documents.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/>
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">Keine Dokumente vorhanden.</p>
      </div>
    )
  }

  return (
    <div>
      {deleteError && (
        <div className="mx-4 mt-3 p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">
          {deleteError}
        </div>
      )}
      <ul className="divide-y divide-stone-100">
        {documents.map((doc) => {
          const iconType = MIME_ICONS[doc.mimeType] ?? 'file'
          const typeLabel = DOC_TYPE_LABELS[doc.type] ?? doc.type

          return (
            <li key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 group">
              {/* File icon */}
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-700 mono ${
                iconType === 'pdf' ? 'bg-red-100 text-red-700' :
                iconType === 'img' ? 'bg-blue-100 text-blue-700' :
                'bg-stone-100 text-stone-600'
              }`}>
                {iconType === 'pdf' ? 'PDF' :
                 iconType === 'img' ? 'IMG' :
                 iconType === 'xls' ? 'XLS' :
                 iconType === 'csv' ? 'CSV' : 'DOC'}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-500 text-foreground truncate">{doc.originalName}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-600 font-mono whitespace-nowrap shrink-0">
                    {typeLabel}
                  </span>
                  {doc.isArchived && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-mono">Archiv</span>
                  )}
                </div>
                <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span className="mono">{formatFileSize(doc.fileSize)}</span>
                  <span>{format(new Date(doc.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                  {doc.entityLabel !== '–' && (
                    <span className="mono">{doc.entityLabel}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Download — via API route (auth-protected) */}
                <a
                  href={`/api/documents/${doc.id}/download`}
                  className="p-1.5 rounded text-muted-foreground hover:text-blue-700 hover:bg-blue-50 transition-colors"
                  title="Herunterladen"
                  download
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                  </svg>
                </a>

                {canDelete && (
                  <ConfirmDialog
                    title="Dokument löschen?"
                    description={`„${doc.originalName}" wird aus dem Archiv entfernt. Diese Aktion kann nicht rückgängig gemacht werden und wird im Audit-Log erfasst.`}
                    confirmLabel="Löschen" danger
                    onConfirm={async () => {
                      const res = await deleteDocumentAction(doc.id, 'Manuell gelöscht')
                      if (!res.success) {
                        setDeleteError(res.error ?? 'Fehler')
                        throw new Error(res.error)
                      }
                      setDeleteError(null)
                      router.refresh()
                    }}
                    trigger={
                      <button
                        className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Löschen"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                        </svg>
                      </button>
                    }
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
