'use client'

import * as Dialog from '@radix-ui/react-dialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ArchiveSort, ArchiveSortDirection, SerializedArchiveEntry } from '@/lib/documents/archive-explorer.service'
import { formatFileSize } from '@/lib/services/document.service'

interface DocumentExplorerProps {
  entries: SerializedArchiveEntry[]
  currentPath: string
  breadcrumbs: Array<{ label: string; path: string }>
  search: string
  sort: ArchiveSort
  direction: ArchiveSortDirection
  available: boolean
  error: string | null
}

const TYPE_LABELS = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', image: 'Bild', json: 'Metadaten', other: 'Datei' } as const

function explorerUrl(input: { path?: string; search?: string; sort?: ArchiveSort; direction?: ArchiveSortDirection }) {
  const params = new URLSearchParams()
  if (input.path) params.set('path', input.path)
  if (input.search) params.set('search', input.search)
  if (input.sort && input.sort !== 'name') params.set('sort', input.sort)
  if (input.direction && input.direction !== 'asc') params.set('direction', input.direction)
  const query = params.toString()
  return query ? `/documents?${query}` : '/documents'
}

function fileUrl(relativePath: string, disposition: 'inline' | 'attachment') {
  const params = new URLSearchParams({ path: relativePath, disposition })
  return `/api/document-archive/file?${params.toString()}`
}

function entryFileUrl(entry: SerializedArchiveEntry, disposition: 'inline' | 'attachment') {
  return fileUrl(entry.storagePath ?? entry.relativePath, disposition)
}

function SortLink({ field, label, sort, direction, currentPath, search }: {
  field: ArchiveSort
  label: string
  sort: ArchiveSort
  direction: ArchiveSortDirection
  currentPath: string
  search: string
}) {
  const active = sort === field
  const nextDirection: ArchiveSortDirection = active && direction === 'asc' ? 'desc' : 'asc'
  return (
    <Link
      href={explorerUrl({ path: currentPath, search, sort: field, direction: nextDirection })}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}<span aria-hidden="true">{active ? (direction === 'asc' ? '↑' : '↓') : ''}</span>
    </Link>
  )
}

export function DocumentExplorer(props: DocumentExplorerProps) {
  const router = useRouter()
  const [preview, setPreview] = useState<SerializedArchiveEntry | null>(null)
  const [metadata, setMetadata] = useState<SerializedArchiveEntry | null>(null)
  const [metadataText, setMetadataText] = useState('')
  const [metadataError, setMetadataError] = useState('')
  const [metadataLoading, setMetadataLoading] = useState(false)

  async function openMetadata(entry: SerializedArchiveEntry) {
    setMetadata(entry)
    setMetadataLoading(true)
    setMetadataError('')
    setMetadataText('')
    try {
      const response = await fetch(entryFileUrl(entry, 'inline'), { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? 'Metadaten konnten nicht geladen werden.')
      }
      const raw = await response.text()
      setMetadataText(JSON.stringify(JSON.parse(raw), null, 2))
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : 'Metadaten konnten nicht geladen werden.')
    } finally {
      setMetadataLoading(false)
    }
  }

  return (
    <>
      <div className="border-b border-stone-100 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2" aria-label="Archivpfad">
          {props.breadcrumbs.map((item, index) => (
            <span key={item.path || 'root'} className="flex min-w-0 items-center gap-2">
              {index > 0 && <span className="text-stone-400" aria-hidden="true">›</span>}
              {index === props.breadcrumbs.length - 1 && !props.search ? (
                <span className="max-w-64 truncate text-sm font-600">{item.label}</span>
              ) : (
                <Link href={explorerUrl({ path: item.path })} className="max-w-64 truncate text-sm text-blue-700 hover:underline">
                  {item.label}
                </Link>
              )}
            </span>
          ))}
          {props.search && <span className="text-sm text-muted-foreground">› Suchergebnisse</span>}
          <button
            type="button"
            onClick={() => router.refresh()}
            className="ml-auto inline-flex h-8 items-center rounded-md border border-stone-200 bg-white px-3 text-xs font-500 hover:bg-stone-50"
          >
            Aktualisieren
          </button>
        </div>
      </div>

      {!props.available ? (
        <div className="px-6 py-14 text-center">
          <p className="text-sm font-600 text-foreground">{props.error}</p>
          <button type="button" onClick={() => router.refresh()} className="mt-4 h-9 rounded-md border border-stone-200 px-4 text-sm hover:bg-stone-50">
            Erneut versuchen
          </button>
        </div>
      ) : props.entries.length === 0 ? (
        <div className="px-6 py-14 text-center text-sm text-muted-foreground">
          {props.search ? 'Keine passenden Archivdateien gefunden.' : 'Dieses Verzeichnis ist leer.'}
        </div>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full table-fixed text-left">
            <thead className="border-b border-stone-200 bg-stone-50/70 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-auto px-4 py-3 sm:px-6"><SortLink field="name" label="Name" {...props} /></th>
                <th className="hidden w-32 px-3 py-3 sm:table-cell"><SortLink field="type" label="Typ" {...props} /></th>
                <th className="hidden w-44 px-3 py-3 md:table-cell"><SortLink field="modified" label="Geändert" {...props} /></th>
                <th className="hidden w-28 px-3 py-3 lg:table-cell"><SortLink field="size" label="Größe" {...props} /></th>
                <th className="w-40 px-4 py-3 text-right sm:w-60 sm:px-6">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {props.entries.map(entry => (
                <tr key={entry.relativePath} className="group hover:bg-stone-50/80">
                  <td className="px-4 py-3 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-700 ${
                        entry.kind === 'directory' ? 'bg-amber-100 text-amber-700' :
                        entry.fileType === 'pdf' ? 'bg-red-100 text-red-700' :
                        entry.fileType === 'docx' ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-600'
                      }`} aria-hidden="true">
                        {entry.kind === 'directory' ? '▰' : TYPE_LABELS[entry.fileType].slice(0, 4).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        {entry.kind === 'directory' ? (
                          <Link href={explorerUrl({ path: entry.relativePath })} className="block truncate text-sm font-500 text-blue-700 hover:underline">
                            {entry.displayName}
                          </Link>
                        ) : (
                          <p className="truncate text-sm font-500" title={entry.name}>{entry.name}</p>
                        )}
                        <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
                          {entry.kind === 'directory' ? `${entry.itemCount ?? 0} Elemente` : TYPE_LABELS[entry.fileType]}
                        </p>
                        {props.search && entry.parentPath && (
                          <Link href={explorerUrl({ path: entry.parentPath })} className="mt-0.5 block truncate text-xs text-muted-foreground hover:text-blue-700">
                            {entry.displayParentPath}
                          </Link>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 text-sm text-muted-foreground sm:table-cell">
                    {entry.kind === 'directory' ? `Ordner · ${entry.itemCount ?? 0}` : TYPE_LABELS[entry.fileType]}
                  </td>
                  <td className="hidden px-3 py-3 text-sm text-muted-foreground md:table-cell">
                    {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.modifiedAt))}
                  </td>
                  <td className="hidden px-3 py-3 text-sm tabular-nums text-muted-foreground lg:table-cell">
                    {entry.size === null ? '–' : formatFileSize(entry.size)}
                  </td>
                  <td className="px-4 py-3 sm:px-6">
                    <div className="flex justify-end gap-1.5">
                      {entry.kind === 'directory' ? (
                        <Link href={explorerUrl({ path: entry.relativePath })} className="inline-flex h-8 items-center rounded border border-stone-200 bg-white px-2.5 text-xs text-blue-700 hover:bg-stone-50">Öffnen</Link>
                      ) : (
                        <>
                          {entry.fileType === 'pdf' && (
                            <>
                              <button type="button" onClick={() => setPreview(entry)} className="inline-flex h-8 items-center rounded border border-stone-200 bg-white px-2.5 text-xs text-blue-700 hover:bg-stone-50">Vorschau</button>
                              <a href={entryFileUrl(entry, 'inline')} target="_blank" rel="noreferrer" className="hidden h-8 items-center rounded border border-stone-200 bg-white px-2.5 text-xs text-blue-700 hover:bg-stone-50 sm:inline-flex">Öffnen</a>
                            </>
                          )}
                          {entry.fileType === 'json' && (
                            <button type="button" onClick={() => void openMetadata(entry)} className="inline-flex h-8 items-center rounded border border-stone-200 bg-white px-2.5 text-xs text-blue-700 hover:bg-stone-50">Anzeigen</button>
                          )}
                          <a href={entryFileUrl(entry, 'attachment')} className="inline-flex h-8 items-center rounded border border-stone-200 bg-white px-2.5 text-xs text-blue-700 hover:bg-stone-50" download>
                            Download
                          </a>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog.Root open={Boolean(preview)} onOpenChange={open => !open && setPreview(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed inset-4 z-[100] flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl sm:inset-8" aria-describedby={undefined}>
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <Dialog.Title className="truncate text-sm font-600">{preview?.name ?? 'PDF-Vorschau'}</Dialog.Title>
              <Dialog.Close asChild><button type="button" aria-label="Vorschau schließen" className="h-8 w-8 rounded-md text-xl text-muted-foreground hover:bg-stone-100">×</button></Dialog.Close>
            </div>
            {preview && <iframe src={entryFileUrl(preview, 'inline')} title={`PDF-Vorschau ${preview.name}`} className="min-h-0 w-full flex-1 bg-stone-100" />}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(metadata)} onOpenChange={open => !open && setMetadata(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed inset-4 z-[100] flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl sm:inset-x-[15%] sm:inset-y-12" aria-describedby={undefined}>
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <Dialog.Title className="truncate text-sm font-600">Metadaten · {metadata?.name}</Dialog.Title>
              <Dialog.Close asChild><button type="button" aria-label="Metadaten schließen" className="h-8 w-8 rounded-md text-xl text-muted-foreground hover:bg-stone-100">×</button></Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-stone-50 p-4">
              {metadataLoading && <p className="text-sm text-muted-foreground">Metadaten werden geladen …</p>}
              {metadataError && <p className="text-sm text-red-700">{metadataError}</p>}
              {!metadataLoading && !metadataError && <pre className="whitespace-pre-wrap break-words rounded-md border border-stone-200 bg-white p-4 text-xs leading-relaxed">{metadataText}</pre>}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
