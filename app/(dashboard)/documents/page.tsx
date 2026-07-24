// app/(dashboard)/documents/page.tsx
import type { Metadata }  from 'next'
import { PageHeader }     from '@/components/shared/PageHeader'
import { DocumentArchive } from '@/components/documents/DocumentArchive'
import { getDocuments }   from '@/lib/services/document.service'
import { hasPermission, Resource, Action } from '@/lib/auth/permissions'

export const metadata: Metadata = { title: 'Dokumente' }

interface SearchParams {
  search?:    string
  customerId?: string
  invoiceId?: string
  orderId?:   string
  page?:      string
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query  = await searchParams
  const page   = parseInt(query.page ?? '1', 10)
  const search = query.search    ?? ''

  const [result, canDelete] = await Promise.all([
    getDocuments({
      search,
      page,
      customerId: query.customerId,
      invoiceId:  query.invoiceId,
      orderId:    query.orderId,
    }),
    hasPermission(Resource.DOCUMENT, Action.DELETE),
  ])

  return (
    <div>
      <PageHeader
        title="Dokumentenarchiv"
        description="PDFs, Nachweise und Uploads aller Vorgänge"
        breadcrumbs={[{ label: 'Dokumente' }]}
      />

      <div className="p-6">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="stat-card">
            <p className="stat-value mono">{result.total.toLocaleString('de-DE')}</p>
            <p className="stat-label">Archivierte Dokumente</p>
          </div>
          <div className="stat-card">
            <p className="stat-value mono">
              {result.documents
                .reduce((s, d) => s + d.fileSize, 0)
                .toLocaleString('de-DE')} B
            </p>
            <p className="stat-label">Gesamtgröße (Seite)</p>
          </div>
        </div>

        <div className="card-base overflow-hidden">
          {/* Search */}
          <div className="px-6 py-3 border-b border-stone-100">
            <form className="flex items-center gap-3">
              <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
              </svg>
              <input type="search" name="search" placeholder="Dateiname suchen …"
                defaultValue={search}
                className="h-8 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent w-64" />
              <button type="submit"
                className="h-8 px-3 rounded-md bg-stone-800 text-white text-xs font-500 hover:bg-stone-900 transition-colors">
                Suchen
              </button>
              <p className="ml-auto text-xs text-muted-foreground mono">
                {result.total} Dokumente
              </p>
            </form>
          </div>

          <DocumentArchive
            documents={result.documents}
            canDelete={canDelete}
          />
        </div>
      </div>
    </div>
  )
}
