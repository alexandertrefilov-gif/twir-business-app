import type { Metadata } from 'next'
import { PageHeader } from '@/components/shared/PageHeader'
import { DocumentExplorer } from '@/components/documents/DocumentExplorer'
import { Action, requirePagePermission, Resource } from '@/lib/auth/permissions'
import { getArchiveExplorer } from '@/lib/documents/archive-explorer.service'
import { formatFileSize } from '@/lib/services/document.service'

export const metadata: Metadata = { title: 'Dokumente' }

interface SearchParams {
  path?: string
  search?: string
  sort?: string
  direction?: string
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission(Resource.DOCUMENT, Action.READ)
  const query = await searchParams
  const result = await getArchiveExplorer({ currentPath: query.path, search: query.search, sort: query.sort, direction: query.direction })

  return (
    <div>
      <PageHeader title="Dokumentenarchiv" description="Dateien und Ordner des konfigurierten Notfallarchivs" breadcrumbs={[{ label: 'Dokumente' }]} />
      <div className="p-4 sm:p-6">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="stat-card"><p className="stat-value mono">{result.statistics.businessDocuments.toLocaleString('de-DE')}</p><p className="stat-label">Dokumentvorgänge</p></div>
          <div className="stat-card"><p className="stat-value mono">{result.statistics.physicalFiles.toLocaleString('de-DE')}</p><p className="stat-label">Physische Dateien</p></div>
          <div className="stat-card"><p className="stat-value mono">{formatFileSize(result.statistics.totalSize)}</p><p className="stat-label">Archivgröße</p></div>
        </div>
        <div className="card-base overflow-hidden">
          <div className="border-b border-stone-100 px-4 py-3 sm:px-6">
            <form className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 sm:max-w-lg">
                <span className="sr-only">Archiv durchsuchen</span>
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m0 0a7.5 7.5 0 10-10.6-10.6 7.5 7.5 0 0010.6 10.6z" /></svg>
                <input type="search" name="search" placeholder="Datei, Nummer, Kunde oder Projekt suchen …" defaultValue={result.search} maxLength={200} className="h-9 w-full rounded-md border border-stone-200 bg-white pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </label>
              <input type="hidden" name="path" value={result.currentPath} />
              <input type="hidden" name="sort" value={result.sort} />
              <input type="hidden" name="direction" value={result.direction} />
              <button type="submit" className="h-9 rounded-md bg-stone-800 px-4 text-sm font-500 text-white transition-colors hover:bg-stone-900">Suchen</button>
              {result.search && <a href={result.currentPath ? `/documents?path=${encodeURIComponent(result.currentPath)}` : '/documents'} className="inline-flex h-9 items-center rounded-md border border-stone-200 px-3 text-sm hover:bg-stone-50">Suche löschen</a>}
            </form>
          </div>
          <DocumentExplorer entries={result.entries} currentPath={result.currentPath} breadcrumbs={result.breadcrumbs} search={result.search} sort={result.sort} direction={result.direction} available={result.available} error={result.error} />
        </div>
      </div>
    </div>
  )
}
